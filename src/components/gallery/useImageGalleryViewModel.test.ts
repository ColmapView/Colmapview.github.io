import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useImageGalleryViewModel } from './useImageGalleryViewModel';
import {
  buildCamera,
  buildFile,
  buildImage,
  buildLoadedFiles,
  buildReconstruction,
} from '../../test/builders';
import {
  useCameraStore,
  useDeletionStore,
  useImageMetricsStore,
  useReconstructionStore,
  useUIStore,
} from '../../store';

afterEach(() => {
  useReconstructionStore.getState().clear();
  useImageMetricsStore.setState(useImageMetricsStore.getInitialState(), true);
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

  it('keeps the gallery toolbar visible while hiding image overlays with button auto-hide', () => {
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

    expect(result.current.hideToolbar).toBe(false);
    expect(result.current.hideImageOverlay).toBe(true);

    act(() => {
      useUIStore.setState({
        autoHideElements: {
          ...useUIStore.getState().autoHideElements,
          buttons: false,
        },
      });
    });

    expect(result.current.hideToolbar).toBe(false);
    expect(result.current.hideImageOverlay).toBe(false);

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

    expect(result.current.hideToolbar).toBe(false);
    expect(result.current.hideImageOverlay).toBe(true);

    unmount();
  });

  it('sorts by SSIM when splat metrics are ready', () => {
    const camera = buildCamera({ cameraId: 1 });
    const lowSsim = buildImage({ imageId: 10, cameraId: camera.cameraId, name: 'low.jpg' });
    const highSsim = buildImage({ imageId: 20, cameraId: camera.cameraId, name: 'high.jpg' });
    const reconstruction = buildReconstruction({
      cameras: [camera],
      images: [lowSsim, highSsim],
    });

    act(() => {
      useReconstructionStore.getState().setReconstruction(reconstruction);
      useImageMetricsStore.setState({ splatPsnrFrameReady: true });
      useImageMetricsStore.getState().setSplatPsnrMetric({
        imageId: lowSsim.imageId,
        psnr: 30,
        ssim: 0.82,
        mse: 12,
        validPixelCount: 100,
        width: 10,
        height: 10,
        computedAt: 1,
      });
      useImageMetricsStore.getState().setSplatPsnrMetric({
        imageId: highSsim.imageId,
        psnr: 25,
        ssim: 0.96,
        mse: 18,
        validPixelCount: 100,
        width: 10,
        height: 10,
        computedAt: 2,
      });
    });

    const { result, unmount } = renderHook(() => useImageGalleryViewModel());

    act(() => {
      result.current.setSortField('splatSsim');
      result.current.setSortDirection('desc');
    });

    expect(result.current.showSplatMetrics).toBe(true);
    expect(result.current.sortField).toBe('splatSsim');
    expect(result.current.images.map((image) => image.name)).toEqual(['high.jpg', 'low.jpg']);

    unmount();
  });

  it('defaults border coloring to PSNR only while a splat is active', () => {
    const reconstruction = buildReconstruction({
      cameras: [buildCamera({ cameraId: 1 })],
      images: [buildImage({ imageId: 10, cameraId: 1, name: 'a.jpg' })],
    });
    const splatFile = buildFile('scene.spz', 'splat');

    act(() => {
      useReconstructionStore.getState().setReconstruction(reconstruction);
    });

    const { result, unmount } = renderHook(() => useImageGalleryViewModel());

    expect(result.current.borderColorMode).toBe('none');

    act(() => {
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFile }));
    });

    expect(result.current.borderColorMode).toBe('psnr');

    act(() => {
      result.current.setBorderColorMode('ssim');
    });

    expect(result.current.borderColorMode).toBe('ssim');

    act(() => {
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles());
    });

    expect(result.current.borderColorMode).toBe('none');

    unmount();
  });
});
