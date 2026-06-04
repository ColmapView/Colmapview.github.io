import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useImageGalleryViewModel } from './useImageGalleryViewModel';
import {
  buildCamera,
  buildImage,
  buildReconstruction,
} from '../../test/builders';
import {
  useCameraStore,
  useDeletionStore,
  useReconstructionStore,
  useUIStore,
} from '../../store';

afterEach(() => {
  useReconstructionStore.getState().clear();
  useCameraStore.setState({
    currentViewState: null,
    flyToImageId: null,
    flyToViewState: null,
    navigationHistory: [],
    selectedImageId: null,
  });
  useDeletionStore.getState().clearPendingDeletions();
  useUIStore.setState({
    autoHideElements: { ...useUIStore.getInitialState().autoHideElements },
    isIdle: false,
    matchesColor: '#ff00ff',
    matchesDisplayMode: 'static',
    showAutoHideEditor: false,
    showMatches: false,
    touchMode: false,
  });
  vi.useRealTimers();
});

describe('useImageGalleryViewModel', () => {
  it('resets stale camera filters when the reconstruction changes', () => {
    vi.useFakeTimers();
    const camera1 = buildCamera({ cameraId: 1 });
    const camera2 = buildCamera({ cameraId: 2 });
    const firstReconstruction = buildReconstruction({
      cameras: [camera1, camera2],
      images: [
        buildImage({ imageId: 10, cameraId: camera1.cameraId, name: 'a.jpg' }),
        buildImage({ imageId: 20, cameraId: camera2.cameraId, name: 'b.jpg' }),
      ],
    });
    const nextReconstruction = buildReconstruction({
      cameras: [camera1],
      images: [
        buildImage({ imageId: 30, cameraId: camera1.cameraId, name: 'next.jpg' }),
      ],
    });

    act(() => {
      useReconstructionStore.getState().setReconstruction(firstReconstruction);
    });
    const { result, unmount } = renderHook(() => useImageGalleryViewModel());

    act(() => {
      result.current.setCameraFilter(camera2.cameraId);
    });

    expect(result.current.cameraFilter).toBe(camera2.cameraId);
    expect(result.current.images.map((image) => image.imageId)).toEqual([20]);

    act(() => {
      useReconstructionStore.getState().setReconstruction(nextReconstruction);
    });

    expect(result.current.cameraFilter).toBe('all');
    expect(result.current.images.map((image) => image.imageId)).toEqual([30]);

    unmount();
  });

  it('hides the gallery toolbar with the button auto-hide state', () => {
    const reconstruction = buildReconstruction({
      cameras: [buildCamera({ cameraId: 1 })],
      images: [buildImage({ imageId: 10, cameraId: 1, name: 'a.jpg' })],
    });

    act(() => {
      useReconstructionStore.getState().setReconstruction(reconstruction);
      useUIStore.setState({
        autoHideElements: {
          ...useUIStore.getState().autoHideElements,
          buttons: true,
        },
        isIdle: true,
        showAutoHideEditor: false,
      });
    });

    const { result, unmount } = renderHook(() => useImageGalleryViewModel());

    expect(result.current.hideToolbar).toBe(true);

    act(() => {
      useUIStore.setState({
        autoHideElements: {
          ...useUIStore.getState().autoHideElements,
          buttons: false,
        },
      });
    });

    expect(result.current.hideToolbar).toBe(false);

    act(() => {
      useUIStore.setState({
        autoHideElements: {
          ...useUIStore.getState().autoHideElements,
          buttons: true,
        },
        isIdle: false,
        showAutoHideEditor: true,
      });
    });

    expect(result.current.hideToolbar).toBe(true);

    unmount();
  });
});
