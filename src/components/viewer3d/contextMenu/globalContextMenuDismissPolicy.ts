export type GlobalContextMenuDismissAction = 'none' | 'closeMenu' | 'closeEditor';

export interface GlobalContextMenuPointerDismissOptions {
  showEditPopup: boolean;
  clickedOutsideMenu: boolean;
  clickedOutsideEditor: boolean;
}

export interface GlobalContextMenuKeyDismissOptions {
  showEditPopup: boolean;
  key: string;
}

export function getGlobalContextMenuPointerDismissAction({
  showEditPopup,
  clickedOutsideMenu,
  clickedOutsideEditor,
}: GlobalContextMenuPointerDismissOptions): GlobalContextMenuDismissAction {
  if (showEditPopup) {
    return clickedOutsideEditor ? 'closeEditor' : 'none';
  }

  return clickedOutsideMenu ? 'closeMenu' : 'none';
}

export function getGlobalContextMenuKeyDismissAction({
  showEditPopup,
  key,
}: GlobalContextMenuKeyDismissOptions): GlobalContextMenuDismissAction {
  if (key !== 'Escape') return 'none';
  return showEditPopup ? 'closeEditor' : 'closeMenu';
}
