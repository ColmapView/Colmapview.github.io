import { describe, expect, it } from 'vitest';
import {
  GALLERY_SORT_FIELD_OPTIONS,
  GALLERY_BORDER_COLOR_OPTIONS,
  GALLERY_THUMBNAIL_DISPLAY_OPTIONS,
  getGalleryCameraFilterValue,
  getGalleryBorderColorModeValue,
  getGallerySortFieldOptions,
  getGallerySortFieldValue,
  getGalleryThumbnailDisplayModeValue,
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
    expect(getGallerySortFieldOptions(false).map(option => option.value)).toEqual([
      'name',
      'imageId',
      'avgError',
      'covisibleCount',
      'numPoints3D',
      'numPoints2D',
    ]);
    expect(getGallerySortFieldOptions(true).map(option => option.value)).toEqual([
      'name',
      'imageId',
      'avgError',
      'covisibleCount',
      'numPoints3D',
      'numPoints2D',
      'splatPsnr',
      'splatSsim',
    ]);
  });

  it('narrows raw select values to supported sort fields', () => {
    expect(getGallerySortFieldValue('avgError')).toBe('avgError');
    expect(getGallerySortFieldValue('splatPsnr')).toBeNull();
    expect(getGallerySortFieldValue('splatSsim')).toBeNull();
    expect(getGallerySortFieldValue('splatPsnr', true)).toBe('splatPsnr');
    expect(getGallerySortFieldValue('splatSsim', true)).toBe('splatSsim');
    expect(getGallerySortFieldValue('unknown')).toBeNull();
  });

  it('defines and narrows gallery border color modes', () => {
    expect(GALLERY_BORDER_COLOR_OPTIONS.map(option => option.value)).toEqual([
      'none',
      'camera',
      'psnr',
      'ssim',
    ]);
    expect(getGalleryBorderColorModeValue('none')).toBe('none');
    expect(getGalleryBorderColorModeValue('psnr')).toBe('psnr');
    expect(getGalleryBorderColorModeValue('unexpected')).toBeNull();
  });

  it('defines and narrows gallery thumbnail display modes', () => {
    expect(GALLERY_THUMBNAIL_DISPLAY_OPTIONS.map(option => option.value)).toEqual([
      'image',
      'maskedImage',
      'inverseMaskedImage',
      'mask',
      'hoverMask',
    ]);
    expect(getGalleryThumbnailDisplayModeValue('image')).toBe('image');
    expect(getGalleryThumbnailDisplayModeValue('maskedImage')).toBe('maskedImage');
    expect(getGalleryThumbnailDisplayModeValue('inverseMaskedImage')).toBe('inverseMaskedImage');
    expect(getGalleryThumbnailDisplayModeValue('mask')).toBe('mask');
    expect(getGalleryThumbnailDisplayModeValue('hoverMask')).toBe('hoverMask');
    expect(getGalleryThumbnailDisplayModeValue('unexpected')).toBeNull();
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
