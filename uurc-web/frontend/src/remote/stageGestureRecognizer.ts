export const GESTURE_THRESHOLDS = {
  CLASSIFY_MS: 80,
  MOUSE_SLOP_PX: 12,
  SCROLL_GAIN: 1.2,
  SCROLL_MIN_PX: 2,
  PINCH_MIN_PX: 6,
  PINCH_VS_PAN: 1.1,
  PINCH_GAIN: 1.5,
  SWIPE_PX: 96,
  SWIPE_RATIO: 1.5,
  SWIPE_COOLDOWN_MS: 400,
  MAX_POINTERS: 4,
} as const;

export type GestureMode = "idle" | "pending" | "mouse" | "scroll" | "swipe";

export type GestureShortcutId = "mac-prev-desktop" | "mac-next-desktop" | "mac-mission-control";

export type GestureCommand =
  | { type: "mouseMove"; clientX: number; clientY: number }
  | { type: "mousePress"; button: number }
  | { type: "mouseRelease"; button: number }
  | { type: "scroll"; deltaX: number; deltaY: number }
  | { type: "zoom"; deltaY: number }
  | { type: "shortcut"; id: GestureShortcutId };

export type PointerSample = {
  pointerId: number;
  clientX: number;
  clientY: number;
  button: number;
  timeStamp: number;
};

export type GestureSnapshot = {
  mode: GestureMode;
  count: number;
  maxCount: number;
  ids: number[];
};

type TrackedPointer = {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  button: number;
};

type Point = { x: number; y: number };

export function createStageGestureRecognizer(now: () => number = defaultNow) {
  let mode: GestureMode = "idle";
  let mouseArmed = false;
  let swipeFired = false;
  let pendingSince = 0;
  let lastCentroid: Point | null = null;
  let lastDistance: number | null = null;
  let lastSwipeAt = Number.NEGATIVE_INFINITY;
  let maxCount = 0;
  const pointers = new Map<number, TrackedPointer>();

  function snapshot(): GestureSnapshot {
    return { mode, count: pointers.size, maxCount, ids: [...pointers.keys()] };
  }

  function pointerDown(sample: PointerSample): GestureCommand[] {
    if (pointers.has(sample.pointerId)) {
      return pointerMove(sample);
    }
    if (pointers.size >= GESTURE_THRESHOLDS.MAX_POINTERS) return [];

    pointers.set(sample.pointerId, {
      id: sample.pointerId,
      x: sample.clientX,
      y: sample.clientY,
      startX: sample.clientX,
      startY: sample.clientY,
      button: sample.button,
    });
    maxCount = Math.max(maxCount, pointers.size);

    const commands: GestureCommand[] = [];
    const count = pointers.size;
    if (count === 1) {
      mode = "pending";
      pendingSince = now();
      mouseArmed = false;
      swipeFired = false;
      lastCentroid = null;
      lastDistance = null;
      return commands;
    }
    if (count === 2) {
      commands.push(...abortMouse());
      mode = "scroll";
      swipeFired = false;
      syncTwoFingerBaseline();
      return commands;
    }
    commands.push(...abortMouse());
    mode = "swipe";
    return commands;
  }

  function pointerMove(sample: PointerSample): GestureCommand[] {
    const tracked = pointers.get(sample.pointerId);
    if (!tracked) return [];
    tracked.x = sample.clientX;
    tracked.y = sample.clientY;

    if (mode === "pending") {
      return maybeCommitMouse(sample);
    }
    if (mode === "mouse") {
      return [{ type: "mouseMove", clientX: sample.clientX, clientY: sample.clientY }];
    }
    if (mode === "scroll") {
      return emitTwoFinger();
    }
    if (mode === "swipe") {
      return emitSwipe();
    }
    return [];
  }

  function pointerUp(sample: PointerSample): GestureCommand[] {
    return finishPointer(sample, { clickIfPending: true });
  }

  function pointerCancel(sample: PointerSample): GestureCommand[] {
    return finishPointer(sample, { clickIfPending: false });
  }

  function reset(): GestureCommand[] {
    const commands = abortMouse();
    pointers.clear();
    mode = "idle";
    swipeFired = false;
    lastCentroid = null;
    lastDistance = null;
    pendingSince = 0;
    maxCount = 0;
    return commands;
  }

  function finishPointer(sample: PointerSample, options: { clickIfPending: boolean }): GestureCommand[] {
    const tracked = pointers.get(sample.pointerId);
    if (!tracked) {
      if (pointers.size === 0) mode = "idle";
      return [];
    }
    tracked.x = sample.clientX;
    tracked.y = sample.clientY;
    const commands: GestureCommand[] = [];

    if (mode === "pending" && pointers.size === 1 && options.clickIfPending && travel(tracked) < GESTURE_THRESHOLDS.MOUSE_SLOP_PX) {
      commands.push(
        { type: "mouseMove", clientX: sample.clientX, clientY: sample.clientY },
        { type: "mousePress", button: tracked.button },
        { type: "mouseRelease", button: tracked.button },
      );
    } else if (mode === "mouse" && pointers.size === 1) {
      commands.push(
        { type: "mouseMove", clientX: sample.clientX, clientY: sample.clientY },
        { type: "mouseRelease", button: tracked.button },
      );
      mouseArmed = false;
    }

    pointers.delete(sample.pointerId);
    if (pointers.size === 0) {
      mode = "idle";
      swipeFired = false;
      lastCentroid = null;
      lastDistance = null;
      pendingSince = 0;
      return commands;
    }
    if (mode === "scroll" && pointers.size < 2) {
      lastCentroid = null;
      lastDistance = null;
      return commands;
    }
    if (mode === "scroll") syncTwoFingerBaseline();
    return commands;
  }

  function maybeCommitMouse(sample: PointerSample): GestureCommand[] {
    if (pointers.size !== 1) return [];
    const tracked = [...pointers.values()][0];
    if (!tracked) return [];
    const elapsed = now() - pendingSince;
    if (elapsed < GESTURE_THRESHOLDS.CLASSIFY_MS && travel(tracked) < GESTURE_THRESHOLDS.MOUSE_SLOP_PX) {
      return [];
    }
    mode = "mouse";
    mouseArmed = true;
    return [
      { type: "mouseMove", clientX: sample.clientX, clientY: sample.clientY },
      { type: "mousePress", button: tracked.button },
    ];
  }

  function emitTwoFinger(): GestureCommand[] {
    if (pointers.size < 2) return [];
    const points = [...pointers.values()];
    const current = centroidOf(points);
    const distance = pairDistance(points);
    if (!lastCentroid || lastDistance === null) {
      lastCentroid = current;
      lastDistance = distance;
      return [];
    }
    const deltaCentroid = { x: current.x - lastCentroid.x, y: current.y - lastCentroid.y };
    const deltaDistance = distance - lastDistance;
    lastCentroid = current;
    lastDistance = distance;

    const pan = Math.hypot(deltaCentroid.x, deltaCentroid.y);
    if (
      Math.abs(deltaDistance) >= GESTURE_THRESHOLDS.PINCH_MIN_PX &&
      Math.abs(deltaDistance) > pan * GESTURE_THRESHOLDS.PINCH_VS_PAN
    ) {
      const deltaY = -deltaDistance * GESTURE_THRESHOLDS.PINCH_GAIN;
      if (Math.abs(deltaY) < GESTURE_THRESHOLDS.SCROLL_MIN_PX) return [];
      return [{ type: "zoom", deltaY }];
    }
    if (pan < GESTURE_THRESHOLDS.SCROLL_MIN_PX) return [];
    return [
      {
        type: "scroll",
        deltaX: deltaCentroid.x * GESTURE_THRESHOLDS.SCROLL_GAIN,
        deltaY: deltaCentroid.y * GESTURE_THRESHOLDS.SCROLL_GAIN,
      },
    ];
  }

  function emitSwipe(): GestureCommand[] {
    if (swipeFired || pointers.size < 3) return [];
    const elapsed = now() - lastSwipeAt;
    if (elapsed < GESTURE_THRESHOLDS.SWIPE_COOLDOWN_MS && lastSwipeAt !== Number.NEGATIVE_INFINITY) {
      return [];
    }
    const points = [...pointers.values()];
    const dx = mean(points.map((point) => point.x - point.startX));
    const dy = mean(points.map((point) => point.y - point.startY));
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    let id: GestureShortcutId | null = null;
    if (absX >= GESTURE_THRESHOLDS.SWIPE_PX && absX > absY * GESTURE_THRESHOLDS.SWIPE_RATIO) {
      id = dx > 0 ? "mac-next-desktop" : "mac-prev-desktop";
    } else if (absY >= GESTURE_THRESHOLDS.SWIPE_PX && absY > absX * GESTURE_THRESHOLDS.SWIPE_RATIO && dy < 0) {
      id = "mac-mission-control";
    }
    if (!id) return [];
    swipeFired = true;
    lastSwipeAt = now();
    return [{ type: "shortcut", id }];
  }

  function abortMouse(): GestureCommand[] {
    if (!mouseArmed) return [];
    const tracked = [...pointers.values()][0];
    mouseArmed = false;
    return [{ type: "mouseRelease", button: tracked?.button ?? 0 }];
  }

  function syncTwoFingerBaseline() {
    const points = [...pointers.values()];
    if (points.length < 2) {
      lastCentroid = null;
      lastDistance = null;
      return;
    }
    lastCentroid = centroidOf(points);
    lastDistance = pairDistance(points);
  }

  return {
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
    reset,
    snapshot,
  };
}

function defaultNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function travel(pointer: TrackedPointer): number {
  return Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY);
}

function centroidOf(points: readonly TrackedPointer[]): Point {
  return {
    x: mean(points.map((point) => point.x)),
    y: mean(points.map((point) => point.y)),
  };
}

function pairDistance(points: readonly TrackedPointer[]): number {
  const ordered = [...points].sort((left, right) => left.id - right.id);
  const first = ordered[0];
  const second = ordered[1];
  if (!first || !second) return 0;
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
