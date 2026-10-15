import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { getModalDialogFocusableElements } from './modalDialogShellPolicy';

/**
 * Save/move/restore focus for a dialog that mounts on `isOpen`: focus moves into
 * the panel on open and returns to the opener on close. Shared by the non-modal
 * tool windows (FloatingWindowShell) and the modal ones (ModalDialogShell) —
 * only the Tab trap and Escape handling are modal-specific, and those stay in
 * ModalDialogShell.
 *
 * `initialFocusRef` overrides the default target (the panel's first focusable
 * element, or the panel itself when it holds none).
 *
 * The opener is recorded in a layout effect. Layout effects run before any passive
 * effect of the same commit, so a child that focuses itself on mount (an upload
 * result or progress line in a reopened dialog) cannot be mistaken for the opener.
 */
export function useFloatingDialogFocus(
  isOpen: boolean,
  panelRef: RefObject<HTMLDivElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>
): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    // Body means another dialog in this commit just unmounted; its passive cleanup has yet to restore its
    // opener, so the passive effect below records the opener after that instead.
    if (isOpen && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      previousFocusRef.current = document.activeElement;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    // Nothing recorded yet (see above), or a re-run after the panel or initial target changed, whose cleanup
    // just returned focus to the opener.
    if (!previousFocusRef.current && document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement;
    }

    const focusable = getModalDialogFocusableElements(panelRef.current);
    (initialFocusRef?.current ?? focusable[0] ?? panelRef.current)?.focus();

    return () => {
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, [isOpen, panelRef, initialFocusRef]);
}
