/**
 * Shared hook for draggable modal positioning using Pointer Events.
 * Uses setPointerCapture so all move/up events route to the drag handle
 * element — no window listeners or isDragging state needed.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { MODAL_POSITION, VIEWPORT_FALLBACK } from '../theme';

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

export function useModalDrag({ estimatedWidth, estimatedHeight, isOpen, initialPosition }: UseModalDragOptions) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
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
  }, []);

  // Position modal when opened
  useEffect(() => {
    if (isOpen) {
      if (initialPosition) {
        // Position near cursor with offset and boundary clamping
        const offset = MODAL_POSITION.cursorOffset;
        const clamped = clampToViewport(
          initialPosition.x + offset,
          initialPosition.y - offset,
          estimatedWidth,
          estimatedHeight,
        );
        // eslint-disable-next-line react-hooks/set-state-in-effect -- initial position on open
        setPosition(clamped);
      } else {
        // Center on screen
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        setPosition({
          x: (viewportW - estimatedWidth) / 2,
          y: Math.max(MODAL_POSITION.minTop, (viewportH - estimatedHeight) / 2),
        });
        requestAnimationFrame(centerModal);
      }
    }
  }, [isOpen, centerModal, estimatedWidth, estimatedHeight, initialPosition]);

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = positionRef.current.x;
    const startPosY = positionRef.current.y;

    const onMove = (ev: PointerEvent) => {
      setPosition({
        x: startPosX + ev.clientX - startX,
        y: startPosY + ev.clientY - startY,
      });
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }, []);

  return { position, panelRef, handleDragStart, centerModal };
}
