import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useImageGalleryKeyboardNavigation } from './useImageGalleryKeyboardNavigation';
import type { ImageData } from './useImageGalleryViewModel';

function createImage(imageId: number): ImageData {
  return {
    imageId,
    name: `${imageId}.jpg`,
    numPoints2D: 0,
    numPoints3D: 0,
    cameraId: 1,
    cameraWidth: 640,
    cameraHeight: 480,
    covisibleCount: 0,
    avgError: 0,
  };
}

function createOptions() {
  return {
    images: [createImage(1), createImage(2), createImage(3)],
    selectedImageId: 1,
    viewMode: 'gallery' as const,
    galleryColumns: 2,
    onSelectImage: vi.fn(),
    onNavigateToImage: vi.fn(),
  };
}

describe('useImageGalleryKeyboardNavigation', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('selects the next image for plain arrow keys', () => {
    const options = createOptions();
    renderHook(() => useImageGalleryKeyboardNavigation(options));
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    const preventDefault = vi.spyOn(event, 'preventDefault');

    window.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(options.onSelectImage).toHaveBeenCalledWith(2);
    expect(options.onNavigateToImage).not.toHaveBeenCalled();
  });

  it('navigates to the next image for shift-arrow keys', () => {
    const options = createOptions();
    renderHook(() => useImageGalleryKeyboardNavigation(options));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }));

    expect(options.onNavigateToImage).toHaveBeenCalledWith(2);
    expect(options.onSelectImage).not.toHaveBeenCalled();
  });

  it('ignores keys from text-entry targets', () => {
    const options = createOptions();
    renderHook(() => useImageGalleryKeyboardNavigation(options));
    const input = document.createElement('input');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(options.onSelectImage).not.toHaveBeenCalled();
    expect(options.onNavigateToImage).not.toHaveBeenCalled();
  });

  it('removes the window listener on unmount', () => {
    const options = createOptions();
    const { unmount } = renderHook(() => useImageGalleryKeyboardNavigation(options));

    unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

    expect(options.onSelectImage).not.toHaveBeenCalled();
    expect(options.onNavigateToImage).not.toHaveBeenCalled();
  });
});
