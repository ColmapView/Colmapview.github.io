/**
 * Shared hook for draggable modal positioning using Pointer Events.
 * Uses setPointerCapture so all move/up events route to the drag handle
 * element — no window listeners or isDragging state needed.
 */

import {
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { MODAL_POSITION, VIEWPORT_FALLBACK } from '../theme';
import {
  startCapturedPointerDrag,
  type CapturedPointerDragStartEvent,
} from '../utils/capturedPointerDrag';
import { useResetKeyedState } from './useResetKeyedState';

interface UseModalDragOptions {
  /** Estimated width for initial centering before DOM measurement */
  estimatedWidth: number;
  /** Estimated height for initial centering before DOM measurement */
  estimatedHeight: number;
  /** Whether the modal is currently open */
  isOpen: boolean;
  /** Optional cursor position to place the modal near (instead of centering) */
  initialPosition?: { x: number; y: number } | null;
  /** Keep this window reachable after dragging, content resizing, or viewport changes. */
  constrainToViewport?: boolean;
  /** Additional occupied space below the draggable viewport, such as a touch status bar. */
  viewportBottomInset?: number;
}

interface InitialModalPositionOptions {
  estimatedWidth: number;
  estimatedHeight: number;
  initialPosition?: { x: number; y: number } | null;
  viewportBottomInset?: number;
}

interface ModalDragStartEvent extends CapturedPointerDragStartEvent {
  clientX: number;
  clientY: number;
}

/** Clamp a modal position so it stays within the viewport */
function clampToViewport(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportBottomInset = 0,
): { x: number; y: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : VIEWPORT_FALLBACK.width;
  const vh = typeof window !== 'undefined' ? window.innerHeight : VIEWPORT_FALLBACK.height;
  const padding = MODAL_POSITION.viewportPadding;
  return {
    x: Math.max(padding, Math.min(x, vw - width - padding)),
    y: Math.max(padding, Math.min(y, vh - height - padding - Math.max(0, viewportBottomInset))),
  };
}

function getViewportSize(): { width: number; height: number } {
  return typeof window !== 'undefined'
    ? { width: window.innerWidth, height: window.innerHeight }
    : VIEWPORT_FALLBACK;
}

export function getEstimatedModalPosition({
  estimatedWidth,
  estimatedHeight,
  initialPosition,
  viewportBottomInset = 0,
}: InitialModalPositionOptions): { x: number; y: number } {
  if (initialPosition) {
    const offset = MODAL_POSITION.cursorOffset;
    return clampToViewport(
      initialPosition.x + offset,
      initialPosition.y - offset,
      estimatedWidth,
      estimatedHeight,
      viewportBottomInset,
    );
  }

  const viewport = getViewportSize();
  return {
    x: (viewport.width - estimatedWidth) / 2,
    y: Math.max(MODAL_POSITION.minTop, (viewport.height - estimatedHeight) / 2),
  };
}

function getModalPositionResetKey({
  isOpen,
  estimatedWidth,
  estimatedHeight,
  initialPosition,
  viewportBottomInset = 0,
}: UseModalDragOptions): string {
  if (!isOpen) return 'closed';
  if (initialPosition) {
    return `cursor:${estimatedWidth}:${estimatedHeight}:${initialPosition.x}:${initialPosition.y}:${viewportBottomInset}`;
  }
  return `center:${estimatedWidth}:${estimatedHeight}:${viewportBottomInset}`;
}

export function useModalDrag({ estimatedWidth, estimatedHeight, isOpen, initialPosition, constrainToViewport = false,
  viewportBottomInset = 0 }: UseModalDragOptions) {
  const estimate = isOpen
    ? getEstimatedModalPosition({ estimatedWidth, estimatedHeight, initialPosition, viewportBottomInset })
    : { x: 0, y: 0 };
  const initialEstimatedPosition = isOpen && constrainToViewport
    ? clampToViewport(estimate.x, estimate.y, estimatedWidth, estimatedHeight, viewportBottomInset) : estimate;
  const positionResetKey = getModalPositionResetKey({
    estimatedWidth, estimatedHeight, isOpen, initialPosition, viewportBottomInset,
  });
  const [position, setPosition] = useResetKeyedState(positionResetKey, initialEstimatedPosition);
  const panelRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(position);
  useEffect(() => { positionRef.current = position; }, [position]);

  const centerModal = useCallback(() => {
    if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const centered = { x: (viewportW - rect.width) / 2, y: Math.max(MODAL_POSITION.minTop, (viewportH - rect.height) / 2) };
      setPosition(constrainToViewport
        ? clampToViewport(centered.x, centered.y, rect.width, rect.height, viewportBottomInset) : centered);
    }
  }, [constrainToViewport, setPosition, viewportBottomInset]);

  useEffect(() => {
    if (!isOpen || !constrainToViewport) return;
    const clampPosition = () => {
      const rect = panelRef.current?.getBoundingClientRect();
      setPosition(previous => clampToViewport(previous.x, previous.y,
        rect?.width || estimatedWidth, rect?.height || estimatedHeight, viewportBottomInset));
    };
    window.addEventListener('resize', clampPosition);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(clampPosition);
    if (panelRef.current) observer?.observe(panelRef.current);
    return () => { window.removeEventListener('resize', clampPosition); observer?.disconnect(); };
  }, [constrainToViewport, estimatedHeight, estimatedWidth, isOpen, setPosition, viewportBottomInset]);

  // Re-center on the measured DOM size after the estimated centered position renders.
  useEffect(() => {
    if (!isOpen || initialPosition) return;

    const frameId = requestAnimationFrame(centerModal);
    return () => cancelAnimationFrame(frameId);
  }, [isOpen, centerModal, initialPosition]);

  const handleDragStart = useCallback((event: ModalDragStartEvent) => {
    const startX = event.clientX;
    const startY = event.clientY;
    const startPosX = positionRef.current.x;
    const startPosY = positionRef.current.y;

    const onMove = (ev: PointerEvent) => {
      const moved = { x: startPosX + ev.clientX - startX, y: startPosY + ev.clientY - startY };
      const rect = panelRef.current?.getBoundingClientRect();
      setPosition(constrainToViewport ? clampToViewport(moved.x, moved.y,
        rect?.width || estimatedWidth, rect?.height || estimatedHeight, viewportBottomInset) : moved);
    };
    startCapturedPointerDrag({ event, onMove });
  }, [constrainToViewport, estimatedHeight, estimatedWidth, setPosition, viewportBottomInset]);

  return { position, panelRef, handleDragStart, centerModal };
}
