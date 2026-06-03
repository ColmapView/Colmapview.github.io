export const IDLE_MOVE_THRESHOLD_PX = 20;
export const IDLE_HIDEABLE_SELECTOR = '.idle-hideable';

export interface IdlePointerPosition {
  x: number;
  y: number;
}

export function getIdleTimeoutDelayMs(timeoutSeconds: number): number | null {
  if (timeoutSeconds <= 0) return null;
  return timeoutSeconds * 1000;
}

export function hasDeliberateIdlePointerMove(
  previousPosition: IdlePointerPosition | null,
  nextPosition: IdlePointerPosition,
  threshold = IDLE_MOVE_THRESHOLD_PX
): boolean {
  if (!previousPosition) return false;

  const dx = nextPosition.x - previousPosition.x;
  const dy = nextPosition.y - previousPosition.y;
  return dx * dx + dy * dy > threshold * threshold;
}

function isElementTarget(target: EventTarget | null): target is Element {
  return typeof Element !== 'undefined' && target instanceof Element;
}

export function isIdleHideableTarget(target: EventTarget | null): boolean {
  return isElementTarget(target) && target.closest(IDLE_HIDEABLE_SELECTOR) !== null;
}

export function shouldResumeIdleTimerAfterMouseOut(relatedTarget: EventTarget | null): boolean {
  return !isIdleHideableTarget(relatedTarget);
}
