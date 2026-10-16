import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { getModalDialogFocusableElements } from './modalDialogShellPolicy';

/**
 * Save/move/restore focus for a dialog that mounts on `isOpen`: focus moves into
 * the panel on open and returns to the opener on close. Shared by the non-modal
 * tool windows (FloatingWindowShell) and the modal ones (ModalDialogShell) —
 * only the Tab trap and Escape handling are modal-specific, and those stay in
 * ModalDialogShell.
 *
 * `initialFocusRef` overrides focus chosen by a child on mount. Otherwise preserve
 * that focus, or use the panel's first focusable element (the panel itself when it holds none).
 *
 * The opener is recorded and restored in one layout effect. Layout effects run before any
 * passive effect of the same commit, so a child that focuses itself on mount (an upload result
 * or progress line in a reopened dialog) cannot be mistaken for the opener; and a dialog closing
 * in the same commit restores its own opener in its layout cleanup, before this one records it.
 */
export function useFloatingDialogFocus(
  isOpen: boolean,
  panelRef: RefObject<HTMLDivElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>
): void {
  useLayoutEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
      return;
    }
    const panel = panelRef.current;
    if (panel?.contains(document.activeElement)) return;
    const focusable = getModalDialogFocusableElements(panel);
    (focusable[0] ?? panel)?.focus();
  }, [isOpen, panelRef, initialFocusRef]);
}
