import { describe, expect, it } from 'vitest';
import {
  DESKTOP_IMAGE_DETAIL_FRAME_CLASS,
  TOUCH_IMAGE_DETAIL_FRAME_CLASS,
  getDesktopImageDetailPanelStyle,
  isImageDetailMaskInteractionEnabled,
} from './imageDetailFrameViewModel';

describe('imageDetailFrameViewModel', () => {
  it('keeps image detail modal layer classes stable', () => {
    expect(DESKTOP_IMAGE_DETAIL_FRAME_CLASS).toBe('fixed inset-0 z-[1000] pointer-events-none');
    expect(TOUCH_IMAGE_DETAIL_FRAME_CLASS).toBe('fixed inset-0 z-[1000] bg-ds-primary flex flex-col');
  });

  it('derives desktop panel bounds as a React style object', () => {
    expect(getDesktopImageDetailPanelStyle({
      position: { x: 20, y: 30 },
      size: { width: 640, height: 480 },
    })).toEqual({
      left: 20,
      top: 30,
      width: 640,
      height: 480,
    });
  });

  it('enables mask interactions only in single-image mask mode', () => {
    expect(isImageDetailMaskInteractionEnabled({
      hasMask: true,
      showMatchesInModal: false,
    })).toBe(true);

    expect(isImageDetailMaskInteractionEnabled({
      hasMask: true,
      showMatchesInModal: true,
    })).toBe(false);

    expect(isImageDetailMaskInteractionEnabled({
      hasMask: false,
      showMatchesInModal: false,
    })).toBe(false);
  });
});
