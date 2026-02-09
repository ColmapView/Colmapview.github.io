import { useEffect, useRef, useCallback } from 'react';
import { useUIStore } from '../store';

const MOVE_THRESHOLD = 20; // px — ignore small movements from orbit/scroll jitter

/**
 * Sets data-idle="true" on the container after no deliberate interaction for the configured timeout.
 * Pauses during pointer lock (fly mode) and when hovering over idle-hideable elements.
 * Timeout of 0 disables auto-hide entirely.
 */
export function useIdleTimer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
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
    const timeout = timeoutRef.current;
    clearTimeout(timerRef.current);
    if (timeout <= 0) return; // disabled
    timerRef.current = setTimeout(() => {
      if (containerRef.current && !hoveringRef.current) {
        containerRef.current.dataset.idle = 'true';
        useUIStore.getState().setIsIdle(true);
      }
    }, timeout * 1000);
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
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
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
      const target = e.target as HTMLElement;
      if (target.closest?.('.idle-hideable')) {
        hoveringRef.current = true;
        clearTimeout(timerRef.current);
        if (containerRef.current) {
          containerRef.current.dataset.idle = 'false';
          useUIStore.getState().setIsIdle(false);
        }
      }
    };
    const onMouseOut = (e: MouseEvent) => {
      const target = e.relatedTarget as HTMLElement | null;
      if (!target?.closest?.('.idle-hideable')) {
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
