import { useEffect, useRef, useCallback } from 'react';
import { useUIStore } from '../store';
import {
  getIdleTimeoutDelayMs,
  hasDeliberateIdlePointerMove,
  isIdleHideableTarget,
  shouldResumeIdleTimerAfterMouseOut,
  type IdlePointerPosition,
} from './idleTimerPolicy';

/**
 * Sets data-idle="true" on the container after no deliberate interaction for the configured timeout.
 * Pauses during pointer lock (fly mode) and when hovering over idle-hideable elements.
 * Timeout of 0 disables auto-hide entirely.
 */
export function useIdleTimer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastPos = useRef<IdlePointerPosition | null>(null);
  const hoveringRef = useRef(false);
  const timeoutRef = useRef(useUIStore.getState().idleHideTimeout);

  // Keep timeout in sync without re-running the effect
  useEffect(() => {
    return useUIStore.subscribe((s) => {
      timeoutRef.current = s.idleHideTimeout;
      // If disabled (0), immediately show
      if (s.idleHideTimeout === 0 && containerRef.current) {
        clearTimeout(timerRef.current);
        containerRef.current.dataset.idle = 'false';
        useUIStore.getState().setIsIdle(false);
      }
    });
  }, []);

  const startTimer = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const delayMs = getIdleTimeoutDelayMs(timeoutRef.current);
    clearTimeout(timerRef.current);
    if (delayMs === null) return;
    timerRef.current = setTimeout(() => {
      if (containerRef.current && !hoveringRef.current) {
        containerRef.current.dataset.idle = 'true';
        useUIStore.getState().setIsIdle(true);
      }
    }, delayMs);
  }, []);

  const resetTimer = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.dataset.idle = 'false';
    useUIStore.getState().setIsIdle(false);
    startTimer();
  }, [startTimer]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    resetTimer();

    // Taps and keyboard always reset
    const onTap = () => {
      lastPos.current = null;
      resetTimer();
    };

    // Only reset on significant pointer movement
    const onMove = (e: PointerEvent) => {
      if (!lastPos.current) {
        lastPos.current = { x: e.clientX, y: e.clientY };
        return;
      }
      if (hasDeliberateIdlePointerMove(lastPos.current, { x: e.clientX, y: e.clientY })) {
        lastPos.current = { x: e.clientX, y: e.clientY };
        resetTimer();
      }
    };

    // Pointer lock (fly mode) — hide immediately and block hover, show on exit
    const onPointerLockChange = () => {
      if (document.pointerLockElement) {
        clearTimeout(timerRef.current);
        if (containerRef.current) {
          containerRef.current.dataset.idle = 'true';
          containerRef.current.dataset.pointerLocked = 'true';
          useUIStore.getState().setIsIdle(true);
        }
      } else {
        if (containerRef.current) {
          containerRef.current.dataset.pointerLocked = 'false';
        }
        resetTimer();
      }
    };

    // Hover on idle-hideable elements — pause hiding, show if hidden
    const onMouseOver = (e: MouseEvent) => {
      if (isIdleHideableTarget(e.target)) {
        hoveringRef.current = true;
        clearTimeout(timerRef.current);
        if (containerRef.current) {
          containerRef.current.dataset.idle = 'false';
          useUIStore.getState().setIsIdle(false);
        }
      }
    };
    const onMouseOut = (e: MouseEvent) => {
      if (shouldResumeIdleTimerAfterMouseOut(e.relatedTarget)) {
        hoveringRef.current = false;
        startTimer();
      }
    };

    el.addEventListener('pointerdown', onTap, { passive: true });
    el.addEventListener('pointerup', onTap, { passive: true });
    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('keydown', onTap, { passive: true });
    el.addEventListener('wheel', onTap, { passive: true });
    el.addEventListener('mouseover', onMouseOver, { passive: true });
    el.addEventListener('mouseout', onMouseOut, { passive: true });
    document.addEventListener('pointerlockchange', onPointerLockChange);

    return () => {
      clearTimeout(timerRef.current);
      el.removeEventListener('pointerdown', onTap);
      el.removeEventListener('pointerup', onTap);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('keydown', onTap);
      el.removeEventListener('wheel', onTap);
      el.removeEventListener('mouseover', onMouseOver);
      el.removeEventListener('mouseout', onMouseOut);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
    };
  }, [resetTimer, startTimer]);

  return containerRef;
}
