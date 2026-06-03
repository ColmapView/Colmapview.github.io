import { describe, expect, it } from 'vitest';
import {
  getClearedGalleryItemHoverState,
  getGalleryItemHoverResetKey,
  getGalleryItemPointerHoverState,
  shouldTrackGalleryItemPointer,
} from './imageGalleryItemHoverPolicy';

describe('imageGalleryItemHoverPolicy', () => {
  it('derives cleared and pointer hover states', () => {
    expect(getClearedGalleryItemHoverState()).toEqual({
      hovered: false,
      mousePos: null,
    });
    expect(getGalleryItemPointerHoverState({ x: 12, y: 34 })).toEqual({
      hovered: true,
      mousePos: { x: 12, y: 34 },
    });
  });

  it('uses scrolling state as the hover reset boundary', () => {
    expect(getGalleryItemHoverResetKey(false)).toBe('idle');
    expect(getGalleryItemHoverResetKey(true)).toBe('scrolling');
  });

  it('tracks pointer hover only for non-scrolling desktop items', () => {
    expect(shouldTrackGalleryItemPointer({ isScrolling: false, touchMode: false })).toBe(true);
    expect(shouldTrackGalleryItemPointer({ isScrolling: true, touchMode: false })).toBe(false);
    expect(shouldTrackGalleryItemPointer({ isScrolling: false, touchMode: true })).toBe(false);
  });
});
