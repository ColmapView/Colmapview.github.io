import { describe, expect, it } from 'vitest';
import {
  getGlobalContextMenuKeyDismissAction,
  getGlobalContextMenuPointerDismissAction,
} from './globalContextMenuDismissPolicy';

describe('global context menu dismiss policy', () => {
  it('closes the context menu only when menu mode receives an outside click', () => {
    expect(getGlobalContextMenuPointerDismissAction({
      showEditPopup: false,
      clickedOutsideMenu: true,
      clickedOutsideEditor: false,
    })).toBe('closeMenu');

    expect(getGlobalContextMenuPointerDismissAction({
      showEditPopup: false,
      clickedOutsideMenu: false,
      clickedOutsideEditor: true,
    })).toBe('none');
  });

  it('closes the editor only when editor mode receives an outside editor click', () => {
    expect(getGlobalContextMenuPointerDismissAction({
      showEditPopup: true,
      clickedOutsideMenu: true,
      clickedOutsideEditor: true,
    })).toBe('closeEditor');

    expect(getGlobalContextMenuPointerDismissAction({
      showEditPopup: true,
      clickedOutsideMenu: true,
      clickedOutsideEditor: false,
    })).toBe('none');
  });

  it('maps Escape to the active close action and ignores other keys', () => {
    expect(getGlobalContextMenuKeyDismissAction({
      showEditPopup: false,
      key: 'Escape',
    })).toBe('closeMenu');

    expect(getGlobalContextMenuKeyDismissAction({
      showEditPopup: true,
      key: 'Escape',
    })).toBe('closeEditor');

    expect(getGlobalContextMenuKeyDismissAction({
      showEditPopup: true,
      key: 'Enter',
    })).toBe('none');
  });
});
