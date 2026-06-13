import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useCameraStore,
  useDeletionStore,
  useFloorPlaneStore,
  useImageMetricsStore,
  usePointPickingStore,
  useReconstructionStore,
  useSplatBackendStore,
  useUIStore,
} from '../../store';
import type { CameraViewState, NavigationHistoryEntry } from '../../store/types';
import {
  buildFile,
  buildLoadedFiles,
  buildReconstruction,
} from '../../test/builders';
import { useCameraFrustumsStoreFacade } from './useCameraFrustumsStoreFacade';

function buildViewState(offset: number): CameraViewState {
  return {
    position: [offset, offset + 1, offset + 2],
    quaternion: [1, 0, 0, 0],
    target: [0, 0, 0],
    distance: offset + 3,
  };
}

describe('useCameraFrustumsStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useCameraStore.setState(useCameraStore.getInitialState(), true);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useImageMetricsStore.setState(useImageMetricsStore.getInitialState(), true);
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
    usePointPickingStore.setState(usePointPickingStore.getInitialState(), true);
    useFloorPlaneStore.setState(useFloorPlaneStore.getInitialState(), true);
  });

  it('collects frustum render dependencies from stores, nodes, and dataset state', () => {
    const reconstruction = buildReconstruction();
    const imageFile = buildFile('cam_1/00.png');
    const pendingDeletions = new Set([2]);
    const navigationEntry: NavigationHistoryEntry = {
      fromState: buildViewState(1),
      fromImageId: 1,
      toImageId: 2,
    };

    useReconstructionStore.setState({
      reconstruction,
      loadedFiles: buildLoadedFiles({ imageFiles: [imageFile] }),
      sourceType: 'local',
    });
    useCameraStore.setState({
      cameraDisplayMode: 'imageplane',
      cameraScale: 2,
      cameraScaleFactor: '10',
      frustumColorMode: 'byCamera',
      frustumLineWidth: 3,
      selectedImageId: 1,
      cameraFov: 45,
      autoFovEnabled: true,
      navigationHistory: [navigationEntry],
    });
    useUIStore.setState({
      showMatches: true,
      matchesDisplayMode: 'blink',
      matchesOpacity: 0.4,
      matchesColor: '#123456',
      matchesLineWidth: 2,
      touchMode: true,
    });
    useDeletionStore.setState({ pendingDeletions });
    const { result } = renderHook(() => useCameraFrustumsStoreFacade());

    expect(result.current.data).toMatchObject({
      reconstruction,
      isAlignmentMode: false,
      touchMode: true,
      pendingDeletions,
    });
    expect(result.current.data.dataset.getImageSync('cam_1/00.png')).toBe(imageFile);
    expect(result.current.data.cameras).toMatchObject({
      displayMode: 'imageplane',
      scale: 2,
      scaleFactor: '10',
      colorMode: 'byCamera',
      lineWidth: 3,
    });
    expect(result.current.data.selection.selectedImageId).toBe(1);
    expect(result.current.data.matches).toMatchObject({
      visible: true,
      displayMode: 'blink',
      opacity: 0.4,
      color: '#123456',
      lineWidth: 2,
    });
    expect(result.current.data.nav).toMatchObject({
      fov: 45,
      autoFovEnabled: true,
      navigationHistory: [navigationEntry],
    });
  });

  it('does not rerender frustum dependencies for PSNR metric batches', () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useCameraFrustumsStoreFacade();
    });

    act(() => {
      useImageMetricsStore.getState().setSplatPsnrMetric({
        imageId: 1,
        psnr: 30.5,
        mse: 58,
        validPixelCount: 128,
        width: 80,
        height: 60,
        computedAt: 321,
      });
    });

    expect(renders).toBe(1);
  });

  it('exposes splat metrics when camera frustum color mode needs them', () => {
    const splatFile = buildFile('scene.spz', 'splat');
    useReconstructionStore.setState({ loadedFiles: buildLoadedFiles({ splatFile }) });
    useSplatBackendStore.getState().setRequestedBackend('webgpu');
    useSplatBackendStore.getState().setWebGpuBackendState('ready');
    useSplatBackendStore.getState().setWebGpuMetricState('ready');
    useCameraStore.setState({ frustumColorMode: 'splatPsnr' });
    useImageMetricsStore.getState().setSplatPsnrMetric({
      imageId: 1,
      psnr: 30.5,
      ssim: 0.94,
      mse: 58,
      validPixelCount: 128,
      width: 80,
      height: 60,
      computedAt: 321,
    });

    const { result } = renderHook(() => useCameraFrustumsStoreFacade());

    expect(result.current.data.splatPsnrByImage.get(1)?.psnr).toBe(30.5);
    expect(result.current.data.splatPsnrByImage.get(1)?.ssim).toBe(0.94);
  });

  it('does not expose stale splat metrics while Spark is active', () => {
    const splatFile = buildFile('scene.spz', 'splat');
    useReconstructionStore.setState({ loadedFiles: buildLoadedFiles({ splatFile }) });
    useSplatBackendStore.getState().setSparkBackendAvailable(true);
    useSplatBackendStore.getState().setRequestedBackend('spark');
    useCameraStore.setState({ frustumColorMode: 'splatPsnr' });
    useImageMetricsStore.getState().setSplatPsnrMetric({
      imageId: 1,
      psnr: 30.5,
      ssim: 0.94,
      mse: 58,
      validPixelCount: 128,
      width: 80,
      height: 60,
      computedAt: 321,
    });

    const { result } = renderHook(() => useCameraFrustumsStoreFacade());

    expect(result.current.data.splatPsnrByImage.size).toBe(0);
  });

  it('exposes alignment state and routes frustum actions to owning stores', () => {
    const navigationEntry: NavigationHistoryEntry = {
      fromState: buildViewState(5),
      fromImageId: null,
      toImageId: 8,
    };

    usePointPickingStore.setState({ pickingMode: 'distance-2pt' });

    const { result } = renderHook(() => useCameraFrustumsStoreFacade());

    expect(result.current.data.isAlignmentMode).toBe(true);

    act(() => {
      result.current.actions.selectionActions.setSelectedImageId(8);
      result.current.actions.navActions.setFov(30);
      result.current.actions.navActions.pushNavigationHistory(navigationEntry);
      result.current.actions.openImageDetail(8);
      result.current.actions.setShowMatchesInModal(true);
      result.current.actions.setMatchedImageId(9);
    });

    expect(useCameraStore.getState()).toMatchObject({
      selectedImageId: 8,
      cameraFov: 30,
      navigationHistory: [navigationEntry],
    });
    expect(useUIStore.getState()).toMatchObject({
      imageDetailId: 8,
      showMatchesInModal: true,
      matchedImageId: 9,
    });
  });
});
