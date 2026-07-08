import { useRef, useCallback } from 'react';
import type * as React from 'react';
import { TOUCH } from '../theme/sizing';

export interface LongPressTouchEvent {
  touches: React.TouchList;
}

interface UseLongPressOptions {
  onLongPress: (e: LongPressTouchEvent) => void;
  onClick?: (e: LongPressTouchEvent) => void;
  delay?: number;
}

interface UseLongPressReturn {
  onTouchStart: (e: LongPressTouchEvent) => void;
  onTouchEnd: (e: LongPressTouchEvent) => void;
  onTouchMove: (e: LongPressTouchEvent) => void;
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
  const touchEventRef = useRef<LongPressTouchEvent | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback((e: LongPressTouchEvent) => {
    // Never orphan a running timer: a second touchstart used to overwrite it,
    // leaving an uncancellable timer that fired mid-gesture.
    clearTimer();

    // touches lists ALL active screen touches: more than one means a gesture
    // (pinch / two-finger pan), not a long-press.
    if (e.touches.length > 1) {
      startPosRef.current = null;
      touchEventRef.current = null;
      return;
    }

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
  }, [clearTimer, onLongPress, delay]);

  const onTouchMove = useCallback((e: LongPressTouchEvent) => {
    // A second finger can land on another element, so it may only become
    // visible here (touches spans the whole screen): cancel the press.
    if (e.touches.length > 1) {
      clearTimer();
      startPosRef.current = null;
      return;
    }

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

  const onTouchEnd = useCallback((e: LongPressTouchEvent) => {
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
