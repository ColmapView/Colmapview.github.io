import { describe, expect, it } from 'vitest';
import { getUrlInputModalOverlayStyle } from '../modals/urlInputModalViewModel';
import { getHotkeyHelpOverlayStyle } from '../modals/hotkeyHelpViewModel';
import { getDropZoneHoverCardStyle } from '../dropzone/dropZoneHoverCardViewModel';
import { getProfileDropdownMenuStyle } from '../dropzone/profileDropdownViewModel';
import { getProfileSelectorMenuStyle } from '../dropzone/profileSelectorViewModel';
import {
  DESKTOP_IMAGE_DETAIL_FRAME_CLASS,
  TOUCH_IMAGE_DETAIL_FRAME_CLASS,
} from '../modals/imageDetailFrameViewModel';
import {
  TOUCH_GALLERY_DRAWER_BACKDROP_CLASS,
  TOUCH_GALLERY_DRAWER_PANEL_CLASS,
} from '../layout/touchGalleryDrawerPolicy';
import { getContextMenuListStyle } from '../viewer3d/contextMenu/globalContextMenuViewModel';
import {
  getFixedContextMenuHtmlStyle,
  getFixedCursorHtmlStyle,
  getPointerEnabledHtmlStyle,
} from '../viewer3d/htmlOverlayStylePolicy';
import { notificationStyles } from '../../theme/componentStyles';
import { getConfirmationOverlayStyle } from './confirmationHostPolicy';
import { getMouseTooltipStyle } from './mouseTooltipPolicy';
import { Z_INDEX } from '../../theme';

describe('popup layer contract', () => {
  it('pins the current shared z-index scale', () => {
    expect(Z_INDEX.modal).toBe(1000);
    expect(Z_INDEX.modalOverlay).toBe(1100);
    expect(Z_INDEX.toast).toBe(1500);
    expect(Z_INDEX.tooltip).toBe(2000);
    expect(Z_INDEX.contextMenu).toBe(2100);
    expect(Z_INDEX.mouseTooltip).toBe(9999);
  });

  it('preserves current modal and popup layer policies', () => {
    expect(getUrlInputModalOverlayStyle()).toEqual({ zIndex: Z_INDEX.modalOverlay });
    expect(getHotkeyHelpOverlayStyle()).toEqual({ zIndex: Z_INDEX.modalOverlay });
    expect(getConfirmationOverlayStyle()).toEqual({ zIndex: Z_INDEX.mouseTooltip + 1 });
    expect(getProfileDropdownMenuStyle()).toEqual({ zIndex: Z_INDEX.dropdown });
    expect(getProfileSelectorMenuStyle()).toEqual({ zIndex: Z_INDEX.dropdown });
    expect(getDropZoneHoverCardStyle()).toEqual({ zIndex: Z_INDEX.dropdown });
    expect(getMouseTooltipStyle({ x: 12, y: 20 }, 4)).toMatchObject({
      zIndex: Z_INDEX.mouseTooltip,
    });
    expect(getContextMenuListStyle({
      position: { x: 10, y: 20 },
      isPositionAdjusted: true,
    })).toMatchObject({ zIndex: Z_INDEX.contextMenu });
  });

  it('documents Drei Html popup layers that intentionally keep implicit DOM stacking', () => {
    expect(getFixedContextMenuHtmlStyle({ x: 10, y: 20 })).not.toHaveProperty('zIndex');
    expect(getFixedCursorHtmlStyle({ x: 10, y: 20 })).not.toHaveProperty('zIndex');
    expect(getPointerEnabledHtmlStyle()).not.toHaveProperty('zIndex');
  });

  it('keeps current hard-coded class layers intact', () => {
    expect(TOUCH_GALLERY_DRAWER_BACKDROP_CLASS).toContain('z-[997]');
    expect(TOUCH_GALLERY_DRAWER_PANEL_CLASS).toContain('z-[998]');
    expect(DESKTOP_IMAGE_DETAIL_FRAME_CLASS).toContain('z-[1000]');
    expect(TOUCH_IMAGE_DETAIL_FRAME_CLASS).toContain('z-[1000]');
    expect(notificationStyles.container).toContain('z-toast');
  });
});
