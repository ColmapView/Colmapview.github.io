import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildFile, buildImage, buildReconstruction } from '../../test/builders';
import {
  useSelectedFrustumImageCacheRefresh,
  type SelectedFrustumImageSource,
} from './useSelectedFrustumImageCacheRefresh';

function createImageSource(overrides: Partial<SelectedFrustumImageSource> = {}): SelectedFrustumImageSource {
  return {
    hasImages: vi.fn(() => true),
    getImageSync: vi.fn(() => undefined),
    getImage: vi.fn(async (name: string) => buildFile(name)),
    ...overrides,
  };
}

describe('useSelectedFrustumImageCacheRefresh', () => {
  it('fetches a missing selected image and reports cache refresh once it loads', async () => {
    const selectedImage = buildImage({ imageId: 7, name: 'images/selected.jpg' });
    const imageSource = createImageSource();
    const onImageLoaded = vi.fn();

    renderHook(() => useSelectedFrustumImageCacheRefresh({
      imageSource,
      reconstruction: buildReconstruction({ images: [selectedImage] }),
      selectedImageId: selectedImage.imageId,
      onImageLoaded,
    }));

    await waitFor(() => expect(onImageLoaded).toHaveBeenCalledTimes(1));
    expect(imageSource.getImage).toHaveBeenCalledWith(selectedImage.name);
  });

  it('does not fetch when images are unavailable, the selection is missing, or the image is cached', () => {
    const selectedImage = buildImage({ imageId: 7, name: 'images/selected.jpg' });
    const reconstruction = buildReconstruction({ images: [selectedImage] });
    const cachedSource = createImageSource({
      getImageSync: vi.fn(() => buildFile(selectedImage.name)),
    });

    renderHook(() => useSelectedFrustumImageCacheRefresh({
      imageSource: createImageSource({ hasImages: vi.fn(() => false) }),
      reconstruction,
      selectedImageId: selectedImage.imageId,
      onImageLoaded: vi.fn(),
    }));
    renderHook(() => useSelectedFrustumImageCacheRefresh({
      imageSource: createImageSource(),
      reconstruction,
      selectedImageId: null,
      onImageLoaded: vi.fn(),
    }));
    renderHook(() => useSelectedFrustumImageCacheRefresh({
      imageSource: createImageSource(),
      reconstruction,
      selectedImageId: 999,
      onImageLoaded: vi.fn(),
    }));
    renderHook(() => useSelectedFrustumImageCacheRefresh({
      imageSource: cachedSource,
      reconstruction,
      selectedImageId: selectedImage.imageId,
      onImageLoaded: vi.fn(),
    }));

    expect(cachedSource.getImage).not.toHaveBeenCalled();
  });

  it('ignores null results and completed fetches after cleanup', async () => {
    const selectedImage = buildImage({ imageId: 7, name: 'images/selected.jpg' });
    const reconstruction = buildReconstruction({ images: [selectedImage] });
    const onNullLoaded = vi.fn();

    renderHook(() => useSelectedFrustumImageCacheRefresh({
      imageSource: createImageSource({ getImage: vi.fn(async () => null) }),
      reconstruction,
      selectedImageId: selectedImage.imageId,
      onImageLoaded: onNullLoaded,
    }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(onNullLoaded).not.toHaveBeenCalled();

    let resolveFetch!: (file: File) => void;
    const pendingFetch = new Promise<File>((resolve) => {
      resolveFetch = resolve;
    });
    const onCancelledLoaded = vi.fn();
    const { unmount } = renderHook(() => useSelectedFrustumImageCacheRefresh({
      imageSource: createImageSource({ getImage: vi.fn(() => pendingFetch) }),
      reconstruction,
      selectedImageId: selectedImage.imageId,
      onImageLoaded: onCancelledLoaded,
    }));

    unmount();
    await act(async () => {
      resolveFetch(buildFile(selectedImage.name));
      await pendingFetch;
    });

    expect(onCancelledLoaded).not.toHaveBeenCalled();
  });
});
