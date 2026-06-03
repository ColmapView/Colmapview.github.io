import { describe, expect, it } from 'vitest';
import {
  buildImageUrl,
  buildMaskUrlCandidates,
  getImageLookupKeys,
  getMaskLookupPaths,
  getMaskPathVariants,
  isImageFile,
  normalizeImagePath,
} from './imageFileLookupPolicy';

describe('image file lookup policy', () => {
  it('normalizes paths and identifies supported image files', () => {
    expect(normalizeImagePath('images\\cam1\\Photo.JPG')).toBe('images/cam1/Photo.JPG');
    expect(isImageFile('images/cam1/Photo.JPG')).toBe(true);
    expect(isImageFile('sparse/0/images.bin')).toBe(false);
  });

  it('builds suffix and case-insensitive lookup keys', () => {
    expect(getImageLookupKeys('project\\images\\Cam1\\Photo.JPG')).toEqual([
      'project/images/Cam1/Photo.JPG',
      'project/images/cam1/photo.jpg',
      'images/Cam1/Photo.JPG',
      'images/cam1/photo.jpg',
      'Cam1/Photo.JPG',
      'cam1/photo.jpg',
      'Photo.JPG',
      'photo.jpg',
    ]);
  });

  it('builds image URLs without duplicating the images prefix', () => {
    expect(buildImageUrl('https://example.com/images/', 'images/cam1/photo.jpg')).toEqual({
      url: 'https://example.com/images/cam1/photo.jpg',
      filename: 'photo.jpg',
    });
    expect(buildImageUrl('https://example.com/images', 'cam1/photo.jpg')).toEqual({
      url: 'https://example.com/images/cam1/photo.jpg',
      filename: 'photo.jpg',
    });
  });

  it('builds local mask lookup paths for mirrored folder layouts and fallbacks', () => {
    expect(getMaskLookupPaths('project/images/cam1/photo.jpg')).toEqual([
      'project/masks/cam1/photo.jpg',
      'project/masks/cam1/photo.jpg.png',
      'masks/project/images/cam1/photo.jpg',
      'masks/project/images/cam1/photo.jpg.png',
      'masks/photo.jpg',
      'masks/photo.jpg.png',
    ]);
    expect(getMaskLookupPaths('images\\cam1\\photo.jpg')).toContain('masks/cam1/photo.jpg.png');
  });

  it('builds ZIP mask variants and URL mask candidates', () => {
    expect(getMaskPathVariants('images/cam1/photo.jpg')).toEqual([
      'masks/cam1/photo.jpg',
      'masks/cam1/photo.jpg.png',
      'masks/photo.jpg',
      'masks/photo.jpg.png',
    ]);

    expect(buildMaskUrlCandidates('https://example.com/masks/', 'images/cam1/photo.jpg')).toEqual([
      { url: 'https://example.com/masks/cam1/photo.jpg', filename: 'photo.jpg' },
      { url: 'https://example.com/masks/cam1/photo.jpg.png', filename: 'photo.jpg.png' },
    ]);
    expect(buildMaskUrlCandidates('https://example.com/masks/', 'masks/photo.png')[0].url)
      .toBe('https://example.com/masks/photo.png');
  });
});
