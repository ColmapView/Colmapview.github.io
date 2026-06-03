import { useEffect, type RefObject } from 'react';
import {
  shouldCloseForEscapeKey,
  shouldCloseForOutsideMouseDown,
} from './clickOutsidePolicy';

/**
 * Close a dropdown/menu when clicking outside or pressing Escape.
 * Uses setTimeout(0) to avoid closing on the same click that opened the menu.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!enabled) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (shouldCloseForOutsideMouseDown(ref.current, e.target)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldCloseForEscapeKey(e.key)) onClose();
    };

    // Delay attachment to avoid closing on the same event that opened
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [ref, onClose, enabled]);
}
