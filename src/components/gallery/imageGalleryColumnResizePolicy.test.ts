import { describe, expect, it } from 'vitest';
import {
  getGalleryColumnWheelDelta,
  getNextGalleryColumnCount,
  shouldHandleGalleryColumnWheel,
} from './imageGalleryColumnResizePolicy';

describe('image gallery column resize policy', () => {
  it('handles only shift-wheel events in gallery mode', () => {
    expect(shouldHandleGalleryColumnWheel('gallery', true)).toBe(true);
    expect(shouldHandleGalleryColumnWheel('gallery', false)).toBe(false);
    expect(shouldHandleGalleryColumnWheel('list', true)).toBe(false);
  });

  it('uses the dominant wheel delta axis for shift-wheel resizing', () => {
    expect(getGalleryColumnWheelDelta(0, 12)).toBe(12);
    expect(getGalleryColumnWheelDelta(-24, 3)).toBe(-24);
  });

  it('increments, decrements, and clamps column counts', () => {
    expect(getNextGalleryColumnCount({
      currentColumns: 4,
      pendingColumns: null,
      deltaY: 1,
      minColumns: 2,
      maxColumns: 8,
    })).toBe(5);
    expect(getNextGalleryColumnCount({
      currentColumns: 4,
      pendingColumns: null,
      deltaY: -1,
      minColumns: 2,
      maxColumns: 8,
    })).toBe(3);
    expect(getNextGalleryColumnCount({
      currentColumns: 8,
      pendingColumns: null,
      deltaY: 1,
      minColumns: 2,
      maxColumns: 8,
    })).toBe(8);
    expect(getNextGalleryColumnCount({
      currentColumns: 2,
      pendingColumns: null,
      deltaY: -1,
      minColumns: 2,
      maxColumns: 8,
    })).toBe(2);
  });

  it('uses pending column count for debounced wheel sequences', () => {
    expect(getNextGalleryColumnCount({
      currentColumns: 4,
      pendingColumns: 6,
      deltaY: 1,
      minColumns: 2,
      maxColumns: 8,
    })).toBe(7);
  });
});
