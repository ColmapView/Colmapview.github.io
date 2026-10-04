import { useEffect, useRef, useCallback } from 'react';
import { useUIStore } from '../store';
import {
  beginIdlePointerTravel,
  extendIdlePointerTravel,
  getIdleHoverPauseTarget,
  getIdleTimeoutDelayMs,
  isIdleFocusPauseTarget,
  isIdleHoverPauseActive,
  isIdleIgnoredTarget,
  isIdlePauseTarget,
  isIdleWakeTap,
  shouldResumeIdleTimerAfterFocusOut,
  shouldResumeIdleTimerAfterMouseOut,
  type IdlePointerTravel,
} from './idleTimerPolicy';

/**
 * Sets data-idle="true" on the container after no deliberate interaction for the configured timeout.
 * Pauses during pointer lock (fly mode) and while hovering popup/control surfaces.
 * Timeout of 0 disables auto-hide entirely.
 */
export function useIdleTimer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The hovered element itself, not a flag: an element that unmounts under the
  // cursor sends no mouseout, so the pause has to expire by noticing the
  // element left the document (see isIdleHoverPauseActive).
  const hoveringPauseTargetRef = useRef<Element | null>(null);
  const focusPauseTargetRef = useRef(false);
  // Keyed on pointerId: a pinch has two live touches at once, and a single
  // shared slot would pair one finger's down with the other's up.
  const touchTravelRef = useRef<Map<number, IdlePointerTravel>>(new Map());
  const timeoutRef = useRef(useUIStore.getState().idleHideTimeout);

  const isPausedByUi = useCallback(
    () =>
      isIdleHoverPauseActive(hoveringPauseTargetRef.current) ||
      (focusPauseTargetRef.current && isIdleFocusPauseTarget(document.activeElement)),
    []
  );

  const showFromIdle = useCallback(() => {
    if (!containerRef.current) return;
    containerRef.current.dataset.idle = 'false';
    useUIStore.getState().setIsIdle(false);
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

  // React only to timeout changes. Idle-state writes must not re-enter this listener.
  useEffect(() => useUIStore.subscribe((state, previous) => {
    if (state.idleHideTimeout === previous.idleHideTimeout) return;
    timeoutRef.current = state.idleHideTimeout;
    resetTimer();
  }), [resetTimer]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    resetTimer();

    const onPointerActivity = (e: Event) => {
      if (isIdlePauseTarget(e.target)) {
        resetTimer();
      }
    };

    // Touch tap-to-wake (see isIdleWakeTap). The generic activity handler above
    // deliberately filters to pause targets; these wrappers add the one touch
    // exception without loosening that filter for mouse/pen. pointermove is
    // wrapped for the same reason: the tap test needs EVERY touch move to
    // measure travel, including the ones over bare canvas that the filtered
    // handler ignores.
    const touchTravel = touchTravelRef.current;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touchTravel.set(e.pointerId, beginIdlePointerTravel({ x: e.clientX, y: e.clientY }));
      }
      onPointerActivity(e);
    };
    const onPointerMove = (e: PointerEvent) => {
      const travel = touchTravel.get(e.pointerId);
      if (travel) {
        touchTravel.set(e.pointerId, extendIdlePointerTravel(travel, { x: e.clientX, y: e.clientY }));
      }
      onPointerActivity(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      const travel = touchTravel.get(e.pointerId) ?? null;
      touchTravel.delete(e.pointerId);
      if (
        !isIdleIgnoredTarget(e.target) &&
        isIdleWakeTap(e.pointerType, travel, { x: e.clientX, y: e.clientY })
      ) {
        resetTimer();
      }
      onPointerActivity(e);
    };
    // A cancelled pointer (the browser claiming the gesture, a lost touch)
    // never produces a pointerup, so it has to drop its own entry — otherwise
    // the stale travel outlives the gesture. No wake check: nothing completed.
    const onPointerCancel = (e: PointerEvent) => {
      touchTravel.delete(e.pointerId);
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
    // The element is remembered rather than a flag so the pause can end on its
    // own when the element unmounts without ever sending a mouseout.
    const onMouseOver = (e: MouseEvent) => {
      const pauseTarget = getIdleHoverPauseTarget(e.target);
      if (pauseTarget) {
        hoveringPauseTargetRef.current = pauseTarget;
        clearTimeout(timerRef.current);
        showFromIdle();
      }
    };
    const onMouseOut = (e: MouseEvent) => {
      if (shouldResumeIdleTimerAfterMouseOut(e.relatedTarget)) {
        hoveringPauseTargetRef.current = null;
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

    // Keyboard reach for hidden chrome. While idle the chrome is
    // visibility:hidden, so it is out of tab order and focus never enters it —
    // the document focusin listener above can therefore never fire from a Tab
    // press, and the container keydown below does not fire either when focus
    // sits on document.body. Tab ONLY: scene movement keys (WASD, fly mode) are
    // bound on window (useTrackballKeyboardHandlers), so they bubble past the
    // container without resetting today; a document listener that woke on any
    // key would postpone hiding for the whole flight.
    const onDocumentKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') resetTimer();
    };

    el.addEventListener('pointerdown', onPointerDown, { passive: true });
    el.addEventListener('pointerup', onPointerUp, { passive: true });
    el.addEventListener('pointercancel', onPointerCancel, { passive: true });
    el.addEventListener('pointermove', onPointerMove, { passive: true });
    el.addEventListener('keydown', onKeyDown, { passive: true });
    el.addEventListener('wheel', onPointerActivity, { passive: true });
    document.addEventListener('mouseover', onMouseOver, { passive: true });
    document.addEventListener('mouseout', onMouseOut, { passive: true });
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', onDocumentKeyDown, { passive: true });
    document.addEventListener('pointerlockchange', onPointerLockChange);

    return () => {
      clearTimeout(timerRef.current);
      touchTravel.clear();
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerCancel);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('wheel', onPointerActivity);
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mouseout', onMouseOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('keydown', onDocumentKeyDown);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
    };
  }, [isPausedByUi, resetTimer, showFromIdle, startTimer]);

  return containerRef;
}
