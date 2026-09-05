import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";

type FloatingPanelPosition = {
  left: number;
  top: number;
};

type DragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function useDraggableFloatingPanel<T extends HTMLElement>(enabled = true) {
  const panelRef = useRef<T | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [position, setPosition] = useState<FloatingPanelPosition | null>(null);

  // 关闭拖拽（如退出全屏）时清掉自定义坐标，让工具栏回到 CSS 中定义的固定原位。
  useEffect(() => {
    if (!enabled) setPosition(null);
  }, [enabled]);

  const panelStyle = useMemo<CSSProperties | undefined>(() => {
    if (!enabled || !position) return undefined;
    // 拖动后用 position:fixed + 视口坐标，使工具栏可以移出画面区域、停到窗口任意位置。
    return {
      position: "fixed",
      left: `${position.left}px`,
      top: `${position.top}px`,
      transform: "none",
    };
  }, [enabled, position]);

  const moveToPointer = useCallback((clientX: number, clientY: number) => {
    const panel = panelRef.current;
    const dragState = dragStateRef.current;
    if (!panel || !dragState) return;

    // 以视口为边界（而非父容器），允许拖出远控画面，仅约束在窗口内避免拖丢。
    const panelRect = panel.getBoundingClientRect();
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - panelRect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - panelRect.height - margin);

    setPosition({
      left: clamp(clientX - dragState.offsetX, margin, maxLeft),
      top: clamp(clientY - dragState.offsetY, margin, maxTop),
    });
  }, []);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    const panel = panelRef.current;
    if (!panel) return;

    const panelRect = panel.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top,
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointer events used by tests do not always create an active pointer.
    }
    event.preventDefault();
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (dragStateRef.current?.pointerId !== event.pointerId) return;
      moveToPointer(event.clientX, event.clientY);
      event.preventDefault();
    },
    [moveToPointer],
  );

  const finishDrag = useCallback((event: PointerEvent<HTMLElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // The pointer may already be released by the browser or a test harness.
    }
    event.preventDefault();
  }, []);

  return {
    panelRef,
    panelStyle,
    dragHandleProps: {
      onPointerCancel: finishDrag,
      onPointerDown,
      onPointerMove,
      onPointerUp: finishDrag,
    },
  };
}
