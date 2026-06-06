export const IDLE_MOVE_THRESHOLD_PX = 20;
export const IDLE_HIDEABLE_SELECTOR = '.idle-hideable';
export const IDLE_IGNORE_SELECTOR = '[data-idle-ignore="true"]';
export const IDLE_PAUSE_TARGET_SELECTOR = [
  IDLE_HIDEABLE_SELECTOR,
  '[data-idle-pause="true"]',
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[aria-haspopup]',
  'button:not([disabled])',
  'select:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'textarea:not([disabled])',
  'a[href]',
].join(',');
export const IDLE_FOCUS_PAUSE_TARGET_SELECTOR = [
  '[data-idle-pause="true"]',
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  'select:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'textarea:not([disabled])',
].join(',');

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

export function isIdleIgnoredTarget(target: EventTarget | null): boolean {
  return isElementTarget(target) && target.closest(IDLE_IGNORE_SELECTOR) !== null;
}

export function isIdlePauseTarget(target: EventTarget | null): boolean {
  return isElementTarget(target) &&
    !isIdleIgnoredTarget(target) &&
    target.closest(IDLE_PAUSE_TARGET_SELECTOR) !== null;
}

export function isIdleFocusPauseTarget(target: EventTarget | null): boolean {
  return isElementTarget(target) &&
    !isIdleIgnoredTarget(target) &&
    target.closest(IDLE_FOCUS_PAUSE_TARGET_SELECTOR) !== null;
}

export function shouldResumeIdleTimerAfterMouseOut(relatedTarget: EventTarget | null): boolean {
  return !isIdlePauseTarget(relatedTarget);
}

export function shouldResumeIdleTimerAfterFocusOut(relatedTarget: EventTarget | null): boolean {
  return !isIdleFocusPauseTarget(relatedTarget);
}
