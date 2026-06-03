import { describe, expect, it } from 'vitest';
import {
  getGalleryKeyboardNavigationImageId,
  getImageGalleryKeyboardNavigationAction,
  isGalleryKeyboardTextTarget,
  isGalleryNavigationKey,
} from './imageGalleryKeyboardNavigationPolicy';

const images = [{ imageId: 1 }, { imageId: 2 }, { imageId: 3 }];

describe('image gallery keyboard navigation policy', () => {
  it('derives gallery keyboard navigation targets', () => {
    const galleryImages = [{ imageId: 1 }, { imageId: 2 }, { imageId: 3 }, { imageId: 4 }, { imageId: 5 }];

    expect(isGalleryNavigationKey('ArrowLeft')).toBe(true);
    expect(isGalleryNavigationKey('Enter')).toBe(false);
    expect(getGalleryKeyboardNavigationImageId({
      key: 'ArrowRight',
      target: document.body,
      images: galleryImages,
      selectedImageId: 2,
      viewMode: 'gallery',
      galleryColumns: 2,
    })).toBe(3);
    expect(getGalleryKeyboardNavigationImageId({
      key: 'ArrowLeft',
      target: document.body,
      images: galleryImages,
      selectedImageId: 1,
      viewMode: 'gallery',
      galleryColumns: 2,
    })).toBe(5);
    expect(getGalleryKeyboardNavigationImageId({
      key: 'ArrowUp',
      target: document.body,
      images: galleryImages,
      selectedImageId: 4,
      viewMode: 'gallery',
      galleryColumns: 2,
    })).toBe(2);
    expect(getGalleryKeyboardNavigationImageId({
      key: 'ArrowDown',
      target: document.body,
      images: galleryImages,
      selectedImageId: 4,
      viewMode: 'gallery',
      galleryColumns: 2,
    })).toBe(4);
  });

  it('derives list keyboard navigation targets and preserves ignored targets', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');

    expect(isGalleryKeyboardTextTarget(input)).toBe(true);
    expect(isGalleryKeyboardTextTarget(textarea)).toBe(true);
    expect(isGalleryKeyboardTextTarget(document.body)).toBe(false);
    expect(getGalleryKeyboardNavigationImageId({
      key: 'ArrowUp',
      target: document.body,
      images,
      selectedImageId: 1,
      viewMode: 'list',
      galleryColumns: 4,
    })).toBe(3);
    expect(getGalleryKeyboardNavigationImageId({
      key: 'ArrowDown',
      target: document.body,
      images,
      selectedImageId: 3,
      viewMode: 'list',
      galleryColumns: 4,
    })).toBe(1);
    expect(getGalleryKeyboardNavigationImageId({
      key: 'ArrowRight',
      target: document.body,
      images,
      selectedImageId: null,
      viewMode: 'list',
      galleryColumns: 4,
    })).toBe(1);
    expect(getGalleryKeyboardNavigationImageId({
      key: 'ArrowLeft',
      target: document.body,
      images,
      selectedImageId: null,
      viewMode: 'list',
      galleryColumns: 4,
    })).toBe(3);
    expect(getGalleryKeyboardNavigationImageId({
      key: 'ArrowRight',
      target: input,
      images,
      selectedImageId: 1,
      viewMode: 'list',
      galleryColumns: 4,
    })).toBeNull();
    expect(getGalleryKeyboardNavigationImageId({
      key: 'Enter',
      target: document.body,
      images,
      selectedImageId: 1,
      viewMode: 'list',
      galleryColumns: 4,
    })).toBeNull();
    expect(getGalleryKeyboardNavigationImageId({
      key: 'ArrowRight',
      target: document.body,
      images: [],
      selectedImageId: 1,
      viewMode: 'list',
      galleryColumns: 4,
    })).toBeNull();
  });

  it('maps arrow keys to select actions by default', () => {
    expect(getImageGalleryKeyboardNavigationAction({
      key: 'ArrowRight',
      target: document.body,
      shiftKey: false,
      images,
      selectedImageId: 1,
      viewMode: 'gallery',
      galleryColumns: 2,
    })).toEqual({ type: 'select', imageId: 2 });
  });

  it('maps shift-arrow keys to navigate actions', () => {
    expect(getImageGalleryKeyboardNavigationAction({
      key: 'ArrowDown',
      target: document.body,
      shiftKey: true,
      images,
      selectedImageId: 1,
      viewMode: 'list',
      galleryColumns: 2,
    })).toEqual({ type: 'navigate', imageId: 2 });
  });

  it('ignores non-navigation keys and text-entry targets', () => {
    const input = document.createElement('input');

    expect(getImageGalleryKeyboardNavigationAction({
      key: 'Enter',
      target: document.body,
      shiftKey: false,
      images,
      selectedImageId: 1,
      viewMode: 'gallery',
      galleryColumns: 2,
    })).toBeNull();
    expect(getImageGalleryKeyboardNavigationAction({
      key: 'ArrowRight',
      target: input,
      shiftKey: false,
      images,
      selectedImageId: 1,
      viewMode: 'gallery',
      galleryColumns: 2,
    })).toBeNull();
  });
});
