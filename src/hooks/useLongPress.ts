import { useRef, useCallback } from 'react';
import { TOUCH } from '../theme/sizing';

interface UseLongPressOptions {
  onLongPress: (e: React.TouchEvent) => void;
  onClick?: (e: React.TouchEvent) => void;
  delay?: number;
}

interface UseLongPressReturn {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchCancel: () => void;
}

/**
 * Hook for detecting long-press gestures on touch devices.
 *
 * - Uses TOUCH.longPressDelay (500ms) by default
 * - Cancels on movement beyond TOUCH.dragThreshold (10px)
 * - Calls onLongPress callback when threshold met
 * - Calls onClick if released before delay
 *
 * @example
 * const longPressHandlers = useLongPress({
 *   onLongPress: (e) => showContextMenu(e),
 *   onClick: (e) => handleClick(e),
 * });
 *
 * return <div {...longPressHandlers}>Touch me</div>;
 */
export function useLongPress({
  onLongPress,
  onClick,
  delay = TOUCH.longPressDelay,
}: UseLongPressOptions): UseLongPressReturn {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef(false);
  const touchEventRef = useRef<React.TouchEvent | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Store starting position for drag detection
    const touch = e.touches[0];
    startPosRef.current = { x: touch.clientX, y: touch.clientY };
    longPressTriggeredRef.current = false;
    touchEventRef.current = e;

    // Start the long-press timer
    timerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      onLongPress(touchEventRef.current!);
    }, delay);
  }, [onLongPress, delay]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startPosRef.current) return;

    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - startPosRef.current.x);
    const deltaY = Math.abs(touch.clientY - startPosRef.current.y);

    // Cancel long-press if moved beyond threshold
    if (deltaX > TOUCH.dragThreshold || deltaY > TOUCH.dragThreshold) {
      clearTimer();
      startPosRef.current = null;
    }
  }, [clearTimer]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    clearTimer();

    // If long-press wasn't triggered, treat as a click
    if (!longPressTriggeredRef.current && startPosRef.current && onClick) {
      onClick(e);
    }

    startPosRef.current = null;
    touchEventRef.current = null;
  }, [clearTimer, onClick]);

  const onTouchCancel = useCallback(() => {
    clearTimer();
    startPosRef.current = null;
    longPressTriggeredRef.current = false;
    touchEventRef.current = null;
  }, [clearTimer]);

  return {
    onTouchStart,
    onTouchEnd,
    onTouchMove,
    onTouchCancel,
  };
}
