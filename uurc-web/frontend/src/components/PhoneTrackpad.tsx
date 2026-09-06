import { useEffect, useRef } from "react";

import type { InputBridgeEvent } from "../remote/inputBridgeEvents.js";

const TAP_SLOP_PX = 10;
const TAP_MS = 280;
const LONG_PRESS_MS = 520;
const FLUSH_MS = 32;

export function PhoneTrackpad({
  disabled,
  onEvents,
}: {
  disabled: boolean;
  onEvents: (events: InputBridgeEvent[]) => void;
}) {
  const padRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startAt: number;
    moved: number;
    longPress: number | null;
    scrollLastY: number | null;
  }>({ startAt: 0, moved: 0, longPress: null, scrollLastY: null });
  const pending = useRef<InputBridgeEvent[]>([]);
  const flushTimer = useRef<number | null>(null);

  function flush(): void {
    if (flushTimer.current !== null) {
      window.clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    if (pending.current.length === 0) return;
    const events = pending.current;
    pending.current = [];
    onEvents(events);
  }

  function queue(event: InputBridgeEvent): void {
    const last = pending.current[pending.current.length - 1];
    if (event.type === "move" && last?.type === "move") {
      last.dx += event.dx;
      last.dy += event.dy;
    } else if (event.type === "scroll" && last?.type === "scroll") {
      last.deltaX += event.deltaX;
      last.deltaY += event.deltaY;
    } else {
      pending.current.push(event);
    }
    if (flushTimer.current === null) {
      flushTimer.current = window.setTimeout(flush, FLUSH_MS);
    }
  }

  function clearLongPress(): void {
    if (gesture.current.longPress !== null) {
      window.clearTimeout(gesture.current.longPress);
      gesture.current.longPress = null;
    }
  }

  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;

    const onDown = (event: PointerEvent) => {
      if (disabled) return;
      event.preventDefault();
      pad.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size === 1) {
        gesture.current = { startAt: event.timeStamp, moved: 0, longPress: null, scrollLastY: null };
        gesture.current.longPress = window.setTimeout(() => {
          queue({ type: "click", button: "secondary" });
          gesture.current.moved = TAP_SLOP_PX + 1;
        }, LONG_PRESS_MS);
      } else {
        clearLongPress();
        gesture.current.scrollLastY = centroidY();
      }
    };

    const onMove = (event: PointerEvent) => {
      if (disabled || !pointers.current.has(event.pointerId)) return;
      event.preventDefault();
      const previous = pointers.current.get(event.pointerId);
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!previous) return;
      if (pointers.current.size >= 2) {
        const currentY = centroidY();
        if (gesture.current.scrollLastY !== null) {
          const deltaY = currentY - gesture.current.scrollLastY;
          if (Math.abs(deltaY) >= 1) queue({ type: "scroll", deltaX: 0, deltaY });
        }
        gesture.current.scrollLastY = currentY;
        gesture.current.moved += Math.abs(event.clientY - previous.y);
        return;
      }
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      gesture.current.moved += Math.hypot(dx, dy);
      if (gesture.current.moved > TAP_SLOP_PX) clearLongPress();
      if (dx !== 0 || dy !== 0) queue({ type: "move", dx, dy });
    };

    const onUp = (event: PointerEvent) => {
      if (!pointers.current.has(event.pointerId)) return;
      event.preventDefault();
      pointers.current.delete(event.pointerId);
      if (pointers.current.size > 0) {
        gesture.current.scrollLastY = centroidY();
        return;
      }
      const elapsed = event.timeStamp - gesture.current.startAt;
      const tapped = gesture.current.moved <= TAP_SLOP_PX && elapsed <= TAP_MS;
      clearLongPress();
      if (tapped) queue({ type: "click", button: "primary" });
      flush();
    };

    pad.addEventListener("pointerdown", onDown);
    pad.addEventListener("pointermove", onMove);
    pad.addEventListener("pointerup", onUp);
    pad.addEventListener("pointercancel", onUp);
    return () => {
      pad.removeEventListener("pointerdown", onDown);
      pad.removeEventListener("pointermove", onMove);
      pad.removeEventListener("pointerup", onUp);
      pad.removeEventListener("pointercancel", onUp);
      clearLongPress();
      flush();
    };
  }, [disabled, onEvents]);

  function centroidY(): number {
    const points = [...pointers.current.values()];
    if (points.length === 0) return 0;
    return points.reduce((sum, point) => sum + point.y, 0) / points.length;
  }

  return (
    <div className="pair-trackpad-wrap">
      <div
        ref={padRef}
        className={`pair-trackpad${disabled ? " is-disabled" : ""}`}
        role="application"
        aria-label="手机触控板"
      >
        <span>在这里滑动控制鼠标</span>
        <small>轻点左键 · 长按右键 · 双指滑动滚动</small>
      </div>
      <div className="pair-trackpad-actions">
        <button type="button" disabled={disabled} onClick={() => onEvents([{ type: "click", button: "primary" }])}>
          左键
        </button>
        <button type="button" disabled={disabled} onClick={() => onEvents([{ type: "click", button: "secondary" }])}>
          右键
        </button>
      </div>
    </div>
  );
}
