import { describe, expect, it } from 'vitest';
import {
  GALLERY_SORT_FIELD_OPTIONS,
  getGalleryCameraFilterValue,
  getGallerySortFieldValue,
} from './imageGalleryToolbarViewModel';

const cameras = [
  { cameraId: 0 },
  { cameraId: 2 },
];

describe('image gallery toolbar view model', () => {
  it('defines labeled sort field options', () => {
    expect(GALLERY_SORT_FIELD_OPTIONS.map(option => option.value)).toEqual([
      'name',
      'imageId',
      'avgError',
      'covisibleCount',
      'numPoints3D',
      'numPoints2D',
    ]);
  });

  it('narrows raw select values to supported sort fields', () => {
    expect(getGallerySortFieldValue('avgError')).toBe('avgError');
    expect(getGallerySortFieldValue('unknown')).toBeNull();
  });

  it('narrows raw camera filter values to all or known camera ids', () => {
    expect(getGalleryCameraFilterValue('all', cameras)).toBe('all');
    expect(getGalleryCameraFilterValue('2', cameras)).toBe(2);
    expect(getGalleryCameraFilterValue('0', cameras)).toBe(0);
    expect(getGalleryCameraFilterValue('', cameras)).toBeNull();
    expect(getGalleryCameraFilterValue('1', cameras)).toBeNull();
    expect(getGalleryCameraFilterValue('2px', cameras)).toBeNull();
    expect(getGalleryCameraFilterValue('2.5', cameras)).toBeNull();
  });
});
