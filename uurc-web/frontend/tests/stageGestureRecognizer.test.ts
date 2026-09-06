import { describe, expect, it } from "vitest";

import {
  GESTURE_THRESHOLDS,
  createStageGestureRecognizer,
  type PointerSample,
} from "../src/remote/stageGestureRecognizer.js";

function createClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    set(value: number) {
      current = value;
    },
    add(delta: number) {
      current += delta;
    },
  };
}

function pointer(id: number, x: number, y: number, button = 0): PointerSample {
  return { pointerId: id, clientX: x, clientY: y, button, timeStamp: 0 };
}

describe("stageGestureRecognizer", () => {
  it("presses immediately on touchscreen down and releases on lift", () => {
    const clock = createClock();
    const recognizer = createStageGestureRecognizer(clock.now);

    expect(recognizer.pointerDown(pointer(1, 10, 10))).toEqual([
      { type: "mouseMove", clientX: 10, clientY: 10 },
      { type: "mousePress", button: 0 },
    ]);
    clock.add(30);
    expect(recognizer.pointerUp(pointer(1, 12, 11))).toEqual([
      { type: "mouseMove", clientX: 12, clientY: 11 },
      { type: "mouseRelease", button: 0 },
    ]);
  });

  it("drags immediately after the first finger is down", () => {
    const clock = createClock();
    const recognizer = createStageGestureRecognizer(clock.now);

    expect(recognizer.pointerDown(pointer(1, 20, 20))).toEqual([
      { type: "mouseMove", clientX: 20, clientY: 20 },
      { type: "mousePress", button: 0 },
    ]);
    expect(recognizer.pointerMove(pointer(1, 40, 28))).toEqual([{ type: "mouseMove", clientX: 40, clientY: 28 }]);
  });

  it("releases the immediate press when a second finger arrives and then scrolls", () => {
    const clock = createClock();
    const recognizer = createStageGestureRecognizer(clock.now);

    expect(recognizer.pointerDown(pointer(1, 0, 0))).toEqual([
      { type: "mouseMove", clientX: 0, clientY: 0 },
      { type: "mousePress", button: 0 },
    ]);
    expect(recognizer.pointerDown(pointer(2, 40, 0))).toEqual([{ type: "mouseRelease", button: 0 }]);
    const moved = recognizer.pointerMove(pointer(1, 0, 24));
    expect(moved.some((command) => command.type === "mousePress")).toBe(false);
    expect(moved).toEqual([{ type: "scroll", deltaX: 0, deltaY: 12 * GESTURE_THRESHOLDS.SCROLL_GAIN }]);
  });

  it("converts a still hold into a right-click after the long-press window", () => {
    const clock = createClock();
    const recognizer = createStageGestureRecognizer(clock.now);

    recognizer.pointerDown(pointer(1, 8, 8));
    clock.add(GESTURE_THRESHOLDS.LONG_PRESS_MS);
    expect(recognizer.tick()).toEqual([
      { type: "mouseRelease", button: 0 },
      { type: "mousePress", button: 2 },
    ]);
    expect(recognizer.pointerUp(pointer(1, 8, 8))).toEqual([
      { type: "mouseMove", clientX: 8, clientY: 8 },
      { type: "mouseRelease", button: 2 },
    ]);
  });

  it("keeps the precise mouse classify window when requested", () => {
    const clock = createClock();
    const recognizer = createStageGestureRecognizer(clock.now, { pointerStyle: "precise" });

    expect(recognizer.pointerDown(pointer(1, 20, 20))).toEqual([]);
    clock.add(GESTURE_THRESHOLDS.PRECISE_CLASSIFY_MS + 1);
    expect(recognizer.pointerMove(pointer(1, 21, 20))).toEqual([
      { type: "mouseMove", clientX: 21, clientY: 20 },
      { type: "mousePress", button: 0 },
    ]);
  });

  it("fires next-desktop once for a three-finger horizontal swipe", () => {
    const clock = createClock();
    const recognizer = createStageGestureRecognizer(clock.now);

    recognizer.pointerDown(pointer(1, 0, 0));
    recognizer.pointerDown(pointer(2, 10, 8));
    recognizer.pointerDown(pointer(3, 20, 4));
    const first = [
      ...recognizer.pointerMove(pointer(1, GESTURE_THRESHOLDS.SWIPE_PX + 10, 2)),
      ...recognizer.pointerMove(pointer(2, 10 + GESTURE_THRESHOLDS.SWIPE_PX + 10, 10)),
      ...recognizer.pointerMove(pointer(3, 20 + GESTURE_THRESHOLDS.SWIPE_PX + 10, 6)),
    ].filter((command) => command.type === "shortcut");

    expect(first).toEqual([{ type: "shortcut", id: "mac-next-desktop" }]);
    expect(recognizer.pointerMove(pointer(1, GESTURE_THRESHOLDS.SWIPE_PX + 80, 2))).toEqual([]);
  });

  it("does not switch desktops when three fingers move mostly vertically downward", () => {
    const clock = createClock();
    const recognizer = createStageGestureRecognizer(clock.now);

    recognizer.pointerDown(pointer(1, 0, 0));
    recognizer.pointerDown(pointer(2, 16, 0));
    recognizer.pointerDown(pointer(3, 32, 0));
    const commands = [
      ...recognizer.pointerMove(pointer(1, 4, GESTURE_THRESHOLDS.SWIPE_PX + 20)),
      ...recognizer.pointerMove(pointer(2, 20, GESTURE_THRESHOLDS.SWIPE_PX + 20)),
      ...recognizer.pointerMove(pointer(3, 36, GESTURE_THRESHOLDS.SWIPE_PX + 20)),
    ];
    expect(commands.filter((command) => command.type === "shortcut")).toEqual([]);
  });

  it("opens Mission Control on a three-finger swipe up", () => {
    const clock = createClock();
    const recognizer = createStageGestureRecognizer(clock.now);

    recognizer.pointerDown(pointer(1, 0, 200));
    recognizer.pointerDown(pointer(2, 20, 200));
    recognizer.pointerDown(pointer(3, 40, 200));
    const commands = [
      ...recognizer.pointerMove(pointer(1, 2, 200 - GESTURE_THRESHOLDS.SWIPE_PX - 8)),
      ...recognizer.pointerMove(pointer(2, 22, 200 - GESTURE_THRESHOLDS.SWIPE_PX - 8)),
      ...recognizer.pointerMove(pointer(3, 42, 200 - GESTURE_THRESHOLDS.SWIPE_PX - 8)),
    ];
    expect(commands.filter((command) => command.type === "shortcut")).toEqual([
      { type: "shortcut", id: "mac-mission-control" },
    ]);
  });

  it("emits zoom when two fingers pinch rather than pan", () => {
    const clock = createClock();
    const recognizer = createStageGestureRecognizer(clock.now);

    recognizer.pointerDown(pointer(1, 0, 0));
    recognizer.pointerDown(pointer(2, 100, 0));
    expect(recognizer.pointerMove(pointer(2, 160, 0))).toEqual([
      { type: "zoom", deltaY: -60 * GESTURE_THRESHOLDS.PINCH_GAIN },
    ]);
  });

  it("does not inherit two-finger travel when a third finger lands", () => {
    const clock = createClock();
    const recognizer = createStageGestureRecognizer(clock.now);

    recognizer.pointerDown(pointer(1, 0, 0));
    recognizer.pointerDown(pointer(2, 10, 0));
    recognizer.pointerMove(pointer(1, 160, 0));
    recognizer.pointerMove(pointer(2, 170, 0));
    expect(recognizer.pointerDown(pointer(3, 180, 0)).filter((command) => command.type === "shortcut")).toEqual([]);
    expect(recognizer.pointerMove(pointer(3, 181, 1)).filter((command) => command.type === "shortcut")).toEqual([]);
  });

  it("allows a new three-finger swipe immediately after the previous gesture ends", () => {
    const clock = createClock();
    const recognizer = createStageGestureRecognizer(clock.now);

    recognizer.pointerDown(pointer(1, 0, 0));
    recognizer.pointerDown(pointer(2, 10, 0));
    recognizer.pointerDown(pointer(3, 20, 0));
    recognizer.pointerMove(pointer(1, GESTURE_THRESHOLDS.SWIPE_PX + 10, 0));
    recognizer.pointerMove(pointer(2, 10 + GESTURE_THRESHOLDS.SWIPE_PX + 10, 0));
    recognizer.pointerMove(pointer(3, 20 + GESTURE_THRESHOLDS.SWIPE_PX + 10, 0));
    recognizer.pointerUp(pointer(1, GESTURE_THRESHOLDS.SWIPE_PX + 10, 0));
    recognizer.pointerUp(pointer(2, 10 + GESTURE_THRESHOLDS.SWIPE_PX + 10, 0));
    recognizer.pointerUp(pointer(3, 20 + GESTURE_THRESHOLDS.SWIPE_PX + 10, 0));
    clock.add(50);

    recognizer.pointerDown(pointer(4, 0, 40));
    recognizer.pointerDown(pointer(5, 10, 40));
    recognizer.pointerDown(pointer(6, 20, 40));
    const commands = [
      ...recognizer.pointerMove(pointer(4, GESTURE_THRESHOLDS.SWIPE_PX + 10, 40)),
      ...recognizer.pointerMove(pointer(5, 10 + GESTURE_THRESHOLDS.SWIPE_PX + 10, 40)),
      ...recognizer.pointerMove(pointer(6, 20 + GESTURE_THRESHOLDS.SWIPE_PX + 10, 40)),
    ].filter((command) => command.type === "shortcut");
    expect(commands).toEqual([{ type: "shortcut", id: "mac-next-desktop" }]);
  });

  it("commits a still finger via tick after the precise classify window", () => {
    const clock = createClock();
    const recognizer = createStageGestureRecognizer(clock.now, { pointerStyle: "precise" });

    recognizer.pointerDown(pointer(1, 8, 8));
    expect(recognizer.tick()).toEqual([]);
    clock.add(GESTURE_THRESHOLDS.PRECISE_CLASSIFY_MS);
    expect(recognizer.tick()).toEqual([
      { type: "mouseMove", clientX: 8, clientY: 8 },
      { type: "mousePress", button: 0 },
    ]);
    expect(recognizer.snapshot().mode).toBe("mouse");
  });

  it("clears swipe cooldown on reset so the next swipe can fire", () => {
    const clock = createClock();
    const recognizer = createStageGestureRecognizer(clock.now);

    recognizer.pointerDown(pointer(1, 0, 0));
    recognizer.pointerDown(pointer(2, 10, 0));
    recognizer.pointerDown(pointer(3, 20, 0));
    recognizer.pointerMove(pointer(1, GESTURE_THRESHOLDS.SWIPE_PX + 10, 0));
    recognizer.pointerMove(pointer(2, 10 + GESTURE_THRESHOLDS.SWIPE_PX + 10, 0));
    recognizer.pointerMove(pointer(3, 20 + GESTURE_THRESHOLDS.SWIPE_PX + 10, 0));
    recognizer.reset();

    recognizer.pointerDown(pointer(1, 0, 0));
    recognizer.pointerDown(pointer(2, 10, 0));
    recognizer.pointerDown(pointer(3, 20, 0));
    const commands = [
      ...recognizer.pointerMove(pointer(1, GESTURE_THRESHOLDS.SWIPE_PX + 10, 0)),
      ...recognizer.pointerMove(pointer(2, 10 + GESTURE_THRESHOLDS.SWIPE_PX + 10, 0)),
      ...recognizer.pointerMove(pointer(3, 20 + GESTURE_THRESHOLDS.SWIPE_PX + 10, 0)),
    ].filter((command) => command.type === "shortcut");
    expect(commands).toEqual([{ type: "shortcut", id: "mac-next-desktop" }]);
  });

  it("releases a pressed mouse on reset", () => {
    const clock = createClock();
    const recognizer = createStageGestureRecognizer(clock.now);

    recognizer.pointerDown(pointer(1, 0, 0));
    recognizer.pointerMove(pointer(1, 16, 0));
    expect(recognizer.reset()).toEqual([{ type: "mouseRelease", button: 0 }]);
    expect(recognizer.snapshot()).toEqual({ mode: "idle", count: 0, maxCount: 0, ids: [] });
  });
});
