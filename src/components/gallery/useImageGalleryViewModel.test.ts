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
  useSplatBackendStore,
  useUIStore,
} from '../../store';
import type { CameraViewState } from '../../store/types';

afterEach(() => {
  useReconstructionStore.getState().clear();
  useImageMetricsStore.setState(useImageMetricsStore.getInitialState(), true);
  useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
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
    galleryViewMode: 'auto',
    galleryColumns: 2,
    galleryCameraFilter: 'all',
    gallerySortField: 'name',
    gallerySortDirection: 'asc',
    galleryBorderColorMode: 'auto',
    galleryThumbnailDisplayMode: 'image',
    matchesColor: '#ff00ff',
    matchesDisplayMode: 'static',
    showAutoHideEditor: false,
    showMatches: false,
    touchMode: false,
  });
  vi.useRealTimers();
});

describe('useImageGalleryViewModel', () => {
  function setWebGpuSplatMetricsReady() {
    useSplatBackendStore.getState().setRequestedBackend('webgpu');
    useSplatBackendStore.getState().setWebGpuBackendState('ready');
    useSplatBackendStore.getState().setWebGpuMetricState('ready');
  }

  function setSparkSplatBackendActive() {
    useSplatBackendStore.getState().setSparkBackendAvailable(true);
    useSplatBackendStore.getState().setRequestedBackend('spark');
  }

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
    const splatFile = buildFile('scene.spz', 'splat');
    const lowSsim = buildImage({ imageId: 10, cameraId: camera.cameraId, name: 'low.jpg' });
    const highSsim = buildImage({ imageId: 20, cameraId: camera.cameraId, name: 'high.jpg' });
    const reconstruction = buildReconstruction({
      cameras: [camera],
      images: [lowSsim, highSsim],
    });

    act(() => {
      setWebGpuSplatMetricsReady();
      useReconstructionStore.getState().setReconstruction(reconstruction);
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFile }));
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
    expect(result.current.showSplatMetricBorder).toBe(true);
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
      setWebGpuSplatMetricsReady();
      useReconstructionStore.getState().setReconstruction(reconstruction);
    });

    const { result, unmount } = renderHook(() => useImageGalleryViewModel());

    expect(result.current.borderColorMode).toBe('none');
    expect(result.current.showSplatMetricBorder).toBe(false);

    act(() => {
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFile }));
    });

    expect(result.current.borderColorMode).toBe('psnr');
    expect(result.current.showSplatMetricBorder).toBe(true);

    act(() => {
      result.current.setBorderColorMode('ssim');
    });

    expect(result.current.borderColorMode).toBe('ssim');

    act(() => {
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles());
    });

    expect(result.current.borderColorMode).toBe('none');
    expect(result.current.showSplatMetricBorder).toBe(false);

    unmount();
  });

  it('keeps splat metric border controls available while WebGPU metrics are preparing', () => {
    const reconstruction = buildReconstruction({
      cameras: [buildCamera({ cameraId: 1 })],
      images: [buildImage({ imageId: 10, cameraId: 1, name: 'a.jpg' })],
    });
    const splatFile = buildFile('scene.spz', 'splat');

    act(() => {
      useSplatBackendStore.getState().setRequestedBackend('webgpu');
      useSplatBackendStore.getState().setWebGpuBackendState('ready');
      useSplatBackendStore.getState().setWebGpuMetricState('unavailable');
      useReconstructionStore.getState().setReconstruction(reconstruction);
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFile }));
    });

    const { result, unmount } = renderHook(() => useImageGalleryViewModel());

    expect(result.current.borderColorMode).toBe('psnr');
    expect(result.current.showSplatMetricBorder).toBe(true);
    expect(result.current.showSplatMetrics).toBe(false);

    act(() => {
      result.current.setSortField('splatPsnr');
    });

    expect(result.current.sortField).toBe('name');
    expect(result.current.images[0].splatPsnr).toBeUndefined();

    unmount();
  });

  it('hides stale splat metric gallery paths while Spark is active', () => {
    const camera = buildCamera({ cameraId: 1 });
    const image = buildImage({ imageId: 10, cameraId: camera.cameraId, name: 'a.jpg' });
    const reconstruction = buildReconstruction({
      cameras: [camera],
      images: [image],
    });
    const splatFile = buildFile('scene.spz', 'splat');

    act(() => {
      setSparkSplatBackendActive();
      useReconstructionStore.getState().setReconstruction(reconstruction);
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFile }));
      useUIStore.setState({
        gallerySortField: 'splatPsnr',
        galleryBorderColorMode: 'psnr',
      });
      useImageMetricsStore.setState({ splatPsnrFrameReady: true });
      useImageMetricsStore.getState().setSplatPsnrMetric({
        imageId: image.imageId,
        psnr: 31,
        ssim: 0.95,
        mse: 4,
        validPixelCount: 100,
        width: 10,
        height: 10,
        computedAt: 1,
      });
    });

    const { result, unmount } = renderHook(() => useImageGalleryViewModel());

    expect(result.current.showSplatMetrics).toBe(false);
    expect(result.current.showSplatMetricBorder).toBe(false);
    expect(result.current.sortField).toBe('name');
    expect(result.current.borderColorMode).toBe('none');
    expect(result.current.images[0].splatPsnr).toBeUndefined();
    expect(result.current.images[0].splatSsim).toBeUndefined();

    unmount();
  });

  it('right-clicks unselected images to fly there, then right-clicks the selected target to go back and deselect', () => {
    const camera = buildCamera({ cameraId: 1 });
    const image = buildImage({ imageId: 10, cameraId: camera.cameraId, name: 'a.jpg' });
    const fromState = buildCameraViewState(1);
    const currentTargetState = buildCameraViewState(2);
    const reconstruction = buildReconstruction({
      cameras: [camera],
      images: [image],
    });

    act(() => {
      useReconstructionStore.getState().setReconstruction(reconstruction);
      useCameraStore.setState({
        currentViewState: fromState,
      });
    });

    const { result, unmount } = renderHook(() => useImageGalleryViewModel());

    act(() => {
      result.current.handleRightClick(image.imageId);
    });

    expect(useCameraStore.getState().selectedImageId).toBe(image.imageId);
    expect(useCameraStore.getState().flyToImageId).toBe(image.imageId);
    expect(useCameraStore.getState().navigationHistory).toEqual([{
      fromState,
      fromImageId: null,
      toImageId: image.imageId,
    }]);

    act(() => {
      useCameraStore.setState({ currentViewState: currentTargetState });
    });

    act(() => {
      result.current.handleRightClick(image.imageId);
    });

    expect(useCameraStore.getState().selectedImageId).toBeNull();
    expect(useCameraStore.getState().flyToViewState).toBe(fromState);
    expect(useCameraStore.getState().navigationHistory).toEqual([]);

    unmount();
  });

  it('right-clicks a selected image without matching navigation history to deselect only', () => {
    const camera = buildCamera({ cameraId: 1 });
    const image = buildImage({ imageId: 10, cameraId: camera.cameraId, name: 'a.jpg' });
    const currentViewState = buildCameraViewState(1);
    const reconstruction = buildReconstruction({
      cameras: [camera],
      images: [image],
    });

    act(() => {
      useReconstructionStore.getState().setReconstruction(reconstruction);
      useCameraStore.setState({
        currentViewState,
        selectedImageId: image.imageId,
      });
    });

    const { result, unmount } = renderHook(() => useImageGalleryViewModel());

    act(() => {
      result.current.handleRightClick(image.imageId);
    });

    expect(useCameraStore.getState().selectedImageId).toBeNull();
    expect(useCameraStore.getState().flyToViewState).toBeNull();

    unmount();
  });

  it('keeps thumbnail display on images when masks are unavailable', () => {
    const reconstruction = buildReconstruction({
      cameras: [buildCamera({ cameraId: 1 })],
      images: [buildImage({ imageId: 10, cameraId: 1, name: 'a.jpg' })],
    });

    act(() => {
      useReconstructionStore.getState().setSourceInfo('local');
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({
        imageFiles: [buildFile('a.jpg')],
        hasMasks: false,
      }));
      useReconstructionStore.getState().setReconstruction(reconstruction);
    });

    const { result, unmount } = renderHook(() => useImageGalleryViewModel());

    act(() => {
      result.current.setThumbnailDisplayMode('mask');
    });

    expect(result.current.hasMasks).toBe(false);
    expect(result.current.thumbnailDisplayMode).toBe('image');

    unmount();
  });

  it('exposes cached mask files when masks are available', () => {
    const imageFile = buildFile('a.jpg');
    const maskFile = buildFile('a.jpg.png');
    const reconstruction = buildReconstruction({
      cameras: [buildCamera({ cameraId: 1 })],
      images: [buildImage({ imageId: 10, cameraId: 1, name: imageFile.name })],
    });

    act(() => {
      useReconstructionStore.getState().setSourceInfo('local');
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({
        imageFiles: new Map([
          [imageFile.name, imageFile],
          [`masks/${imageFile.name}.png`, maskFile],
        ]),
        hasMasks: true,
      }));
      useReconstructionStore.getState().setReconstruction(reconstruction);
    });

    const { result, unmount } = renderHook(() => useImageGalleryViewModel());

    act(() => {
      result.current.setThumbnailDisplayMode('maskedImage');
    });

    expect(result.current.hasMasks).toBe(true);
    expect(result.current.thumbnailDisplayMode).toBe('maskedImage');
    expect(result.current.images[0].file).toBe(imageFile);
    expect(result.current.images[0].maskFile).toBe(maskFile);

    unmount();
  });
});

function buildCameraViewState(offset: number): CameraViewState {
  return {
    position: [offset, 0, 0],
    quaternion: [1, 0, 0, 0],
    target: [0, 0, 0],
    distance: 1,
  };
}
