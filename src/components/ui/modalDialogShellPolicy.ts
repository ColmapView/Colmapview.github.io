export const MODAL_DIALOG_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getModalDialogFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];

  return Array.from(root.querySelectorAll<HTMLElement>(MODAL_DIALOG_FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute('disabled'));
}

type ModalDialogKeyHandler = (event: KeyboardEvent) => void;

// Open modal dialogs, oldest first. One listener hands each key to the newest, so a key that closes
// it never reaches the dialog underneath, however soon React removes the closed one.
const openModalDialogs: ModalDialogKeyHandler[] = [];

function handleModalDialogKeyDown(event: KeyboardEvent): void {
  openModalDialogs[openModalDialogs.length - 1]?.(event);
}

/** Opens a dialog above the others: only it answers keys until it closes. Returns the close. */
export function openModalDialog(handleKeyDown: ModalDialogKeyHandler): () => void {
  if (openModalDialogs.length === 0) document.addEventListener('keydown', handleModalDialogKeyDown);
  openModalDialogs.push(handleKeyDown);
  return () => {
    const index = openModalDialogs.indexOf(handleKeyDown);
    if (index >= 0) openModalDialogs.splice(index, 1);
    if (openModalDialogs.length === 0) document.removeEventListener('keydown', handleModalDialogKeyDown);
  };
}
