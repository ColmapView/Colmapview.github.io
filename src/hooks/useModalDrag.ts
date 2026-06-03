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
}

interface InitialModalPositionOptions {
  estimatedWidth: number;
  estimatedHeight: number;
  initialPosition?: { x: number; y: number } | null;
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
): { x: number; y: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : VIEWPORT_FALLBACK.width;
  const vh = typeof window !== 'undefined' ? window.innerHeight : VIEWPORT_FALLBACK.height;
  const padding = MODAL_POSITION.viewportPadding;
  return {
    x: Math.max(padding, Math.min(x, vw - width - padding)),
    y: Math.max(padding, Math.min(y, vh - height - padding)),
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
}: InitialModalPositionOptions): { x: number; y: number } {
  if (initialPosition) {
    const offset = MODAL_POSITION.cursorOffset;
    return clampToViewport(
      initialPosition.x + offset,
      initialPosition.y - offset,
      estimatedWidth,
      estimatedHeight,
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
}: UseModalDragOptions): string {
  if (!isOpen) return 'closed';
  if (initialPosition) {
    return `cursor:${estimatedWidth}:${estimatedHeight}:${initialPosition.x}:${initialPosition.y}`;
  }
  return `center:${estimatedWidth}:${estimatedHeight}`;
}

export function useModalDrag({ estimatedWidth, estimatedHeight, isOpen, initialPosition }: UseModalDragOptions) {
  const initialEstimatedPosition = isOpen
    ? getEstimatedModalPosition({ estimatedWidth, estimatedHeight, initialPosition })
    : { x: 0, y: 0 };
  const positionResetKey = getModalPositionResetKey({ estimatedWidth, estimatedHeight, isOpen, initialPosition });
  const [position, setPosition] = useResetKeyedState(positionResetKey, initialEstimatedPosition);
  const panelRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(position);
  useEffect(() => { positionRef.current = position; }, [position]);

  const centerModal = useCallback(() => {
    if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      setPosition({
        x: (viewportW - rect.width) / 2,
        y: Math.max(MODAL_POSITION.minTop, (viewportH - rect.height) / 2),
      });
    }
  }, [setPosition]);

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
      setPosition({
        x: startPosX + ev.clientX - startX,
        y: startPosY + ev.clientY - startY,
      });
    };
    startCapturedPointerDrag({ event, onMove });
  }, [setPosition]);

  return { position, panelRef, handleDragStart, centerModal };
}
