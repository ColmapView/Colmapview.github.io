import { isEventTargetOutside } from '../utils/domTargetGuards';

export function shouldCloseForOutsideMouseDown(
  container: HTMLElement | null,
  target: EventTarget | null,
): boolean {
  return isEventTargetOutside(container, target);
}

export function shouldCloseForEscapeKey(key: string): boolean {
  return key === 'Escape';
}
