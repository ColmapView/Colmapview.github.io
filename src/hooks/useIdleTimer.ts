import { useEffect, useRef, useCallback } from 'react';
import { useUIStore } from '../store';
import {
  getIdleTimeoutDelayMs,
  isIdleFocusPauseTarget,
  isIdlePauseTarget,
  shouldResumeIdleTimerAfterFocusOut,
  shouldResumeIdleTimerAfterMouseOut,
} from './idleTimerPolicy';

/**
 * Sets data-idle="true" on the container after no deliberate interaction for the configured timeout.
 * Pauses during pointer lock (fly mode) and while hovering popup/control surfaces.
 * Timeout of 0 disables auto-hide entirely.
 */
export function useIdleTimer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hoveringPauseTargetRef = useRef(false);
  const focusPauseTargetRef = useRef(false);
  const timeoutRef = useRef(useUIStore.getState().idleHideTimeout);

  const isPausedByUi = useCallback(
    () =>
      hoveringPauseTargetRef.current ||
      (focusPauseTargetRef.current && isIdleFocusPauseTarget(document.activeElement)),
    []
  );

  const showFromIdle = useCallback(() => {
    if (!containerRef.current) return;
    containerRef.current.dataset.idle = 'false';
    useUIStore.getState().setIsIdle(false);
  }, []);

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
      if (containerRef.current && !isPausedByUi()) {
        containerRef.current.dataset.idle = 'true';
        useUIStore.getState().setIsIdle(true);
      }
    }, delayMs);
  }, [isPausedByUi]);

  const resetTimer = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    showFromIdle();
    startTimer();
  }, [showFromIdle, startTimer]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    resetTimer();

    const onPointerActivity = (e: Event) => {
      if (isIdlePauseTarget(e.target)) {
        resetTimer();
      }
    };

    const onKeyDown = () => {
      resetTimer();
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

    // Hover on popup/control surfaces — pause hiding, show if hidden.
    // These can be rendered through portals, so listen at document level.
    const onMouseOver = (e: MouseEvent) => {
      if (isIdlePauseTarget(e.target)) {
        hoveringPauseTargetRef.current = true;
        clearTimeout(timerRef.current);
        showFromIdle();
      }
    };
    const onMouseOut = (e: MouseEvent) => {
      if (shouldResumeIdleTimerAfterMouseOut(e.relatedTarget)) {
        hoveringPauseTargetRef.current = false;
        if (!isPausedByUi()) startTimer();
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      if (isIdleFocusPauseTarget(e.target)) {
        focusPauseTargetRef.current = true;
        clearTimeout(timerRef.current);
        showFromIdle();
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      if (shouldResumeIdleTimerAfterFocusOut(e.relatedTarget)) {
        focusPauseTargetRef.current = false;
        if (!isPausedByUi()) startTimer();
      }
    };

    el.addEventListener('pointerdown', onPointerActivity, { passive: true });
    el.addEventListener('pointerup', onPointerActivity, { passive: true });
    el.addEventListener('pointermove', onPointerActivity, { passive: true });
    el.addEventListener('keydown', onKeyDown, { passive: true });
    el.addEventListener('wheel', onPointerActivity, { passive: true });
    document.addEventListener('mouseover', onMouseOver, { passive: true });
    document.addEventListener('mouseout', onMouseOut, { passive: true });
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    return () => {
      clearTimeout(timerRef.current);
      el.removeEventListener('pointerdown', onPointerActivity);
      el.removeEventListener('pointerup', onPointerActivity);
      el.removeEventListener('pointermove', onPointerActivity);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('wheel', onPointerActivity);
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mouseout', onMouseOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
    };
  }, [isPausedByUi, resetTimer, showFromIdle, startTimer]);

  return containerRef;
}
