import { useEffect, type MutableRefObject } from 'react';
import { shouldCaptureMovementKey } from './trackballControlsViewModel';
import type { TrackballAnimationTarget } from './useTrackballFlyTo';

interface TrackballKeyboardHandlerOptions {
  enabledRef: MutableRefObject<boolean>;
  keysPressedRef: MutableRefObject<Set<string>>;
  animationTargetRef: MutableRefObject<TrackballAnimationTarget | null>;
  navActions: {
    clearNavigationHistory: () => void;
  };
}

interface TrackballKeyboardEventOptions extends TrackballKeyboardHandlerOptions {
  event: KeyboardEvent;
}

export function handleTrackballKeyDown({
  event,
  enabledRef,
  keysPressedRef,
  animationTargetRef,
  navActions,
}: TrackballKeyboardEventOptions): void {
  if (!enabledRef.current) return;

  const key = event.key.toLowerCase();
  if (!shouldCaptureMovementKey(event)) return;

  event.preventDefault();
  keysPressedRef.current.add(key);

  if (key !== 'shift') {
    navActions.clearNavigationHistory();
    animationTargetRef.current = null;
  }
}

export function handleTrackballKeyUp(
  event: KeyboardEvent,
  keysPressedRef: MutableRefObject<Set<string>>
): void {
  keysPressedRef.current.delete(event.key.toLowerCase());
}

export function handleTrackballBlur(keysPressedRef: MutableRefObject<Set<string>>): void {
  keysPressedRef.current.clear();
}

export function useTrackballKeyboardHandlers({
  enabledRef,
  keysPressedRef,
  animationTargetRef,
  navActions,
}: TrackballKeyboardHandlerOptions): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleTrackballKeyDown({
        event,
        enabledRef,
        keysPressedRef,
        animationTargetRef,
        navActions,
      });
    };
    const onKeyUp = (event: KeyboardEvent) => {
      handleTrackballKeyUp(event, keysPressedRef);
    };
    const onBlur = () => {
      handleTrackballBlur(keysPressedRef);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [animationTargetRef, enabledRef, keysPressedRef, navActions]);
}
