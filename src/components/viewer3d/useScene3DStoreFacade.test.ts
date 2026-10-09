import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCameraStore,
  useNotificationStore,
  usePointCloudStore,
  useReconstructionStore,
  useSplatBackendStore,
  useTransformStore,
  useUIStore,
} from '../../store';
import { buildPendingFetch, buildFile, buildLoadedFiles, buildReconstruction } from '../../test/builders';
import type { Sim3dEuler } from '../../types/sim3d';
import { beginReconstructionLoad } from '../../wasm/reconstructionLoadLifecycle';
import {
  useSceneContainerStoreFacade,
  useSceneContentStoreFacade,
} from './useScene3DStoreFacade';

describe('useScene3DStoreFacade', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useCameraStore.setState(useCameraStore.getInitialState(), true);
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects scene content dependencies from owning stores', () => {
    const reconstruction = buildReconstruction();
    const splatFile = buildFile('scene.splat');
    const autoHideElements = {
      ...useUIStore.getInitialState().autoHideElements,
      axes: true,
      points: true,
    };
    const transform: Sim3dEuler = {
      scale: 2,
      rotationX: 0.1,
      rotationY: 0.2,
      rotationZ: 0.3,
      translationX: 1,
      translationY: 2,
      translationZ: 3,
    };

    useReconstructionStore.setState({
      reconstruction,
      loadedFiles: buildLoadedFiles({ splatFile }),
    });
    useTransformStore.setState({
      transform,
      splatTransform: {
        scale: 3,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        translationX: 4,
        translationY: 5,
        translationZ: 6,
      },
    });
    useUIStore.setState({
      isIdle: true,
      autoHideElements,
      showAutoHideEditor: true,
      viewResetTrigger: 4,
      viewDirection: 'z',
      viewTrigger: 5,
    });
    useSplatBackendStore.getState().setRequestedBackend('webgpu');
    useSplatBackendStore.getState().setWebGpuBackendState('unavailable');

    const { result } = renderHook(() => useSceneContentStoreFacade());

    expect(result.current.data).toMatchObject({
      reconstruction,
      wasmReconstruction: null,
      splatFile,
      isIdle: true,
      autoHideElements,
      showAutoHideEditor: true,
      viewResetTrigger: 4,
      viewDirection: 'z',
      viewTrigger: 5,
      transform,
      splatTransform: expect.objectContaining({ scale: 3, translationX: 4 }),
      requestedSplatBackend: 'webgpu',
      splatsVisible: false,
    });
    expect(result.current.data.splatBackendResolution).toMatchObject({
      status: 'unavailable',
      requested: 'webgpu',
    });

    act(() => {
      result.current.actions.setSparkBackendAvailable(true);
    });

    expect(useSplatBackendStore.getState().availability.spark).toBe(true);
  });

  it('collects scene container dependencies and routes selection actions', () => {
    const reconstruction = buildReconstruction();
    const splatFile = buildFile('scene.spz');

    useReconstructionStore.setState({
      reconstruction,
      loadedFiles: buildLoadedFiles({ splatFile }),
    });
    useUIStore.setState({
      backgroundColor: '#101820',
      showAutoHideEditor: true,
    });
    useSplatBackendStore.getState().setSparkBackendAvailable(true);
    usePointCloudStore.getState().setColorMode('splats');

    const { result, rerender } = renderHook(() => useSceneContainerStoreFacade());
    const initialGetUrlProgress = result.current.actions.getUrlProgress;

    expect(result.current.data).toMatchObject({
      reconstruction,
      wasmReconstruction: null,
      splatFile,
      backgroundColor: '#101820',
      showAutoHideEditor: true,
      requestedSplatBackend: 'auto',
      splatsVisible: true,
      pointsLayerVisible: true,
    });
    expect(result.current.data.splatBackendAvailability.spark).toBe(true);
    expect(result.current.data.splatBackendResolution.backend).toBe('spark');

    act(() => {
      result.current.actions.addNotification('warning', 'WebGPU unavailable');
      result.current.actions.setSelectedImageId(42);
      result.current.actions.setWebGpuBackendState('failed', 'adapter lost');
    });
    rerender();

    expect(useCameraStore.getState().selectedImageId).toBe(42);
    expect(useNotificationStore.getState().notifications).toMatchObject([
      { type: 'warning', message: 'WebGPU unavailable' },
    ]);
    expect(useSplatBackendStore.getState().availability.webGpu).toBe('failed');
    expect(useSplatBackendStore.getState().availability.webGpuFailureReason).toBe('adapter lost');
    expect(result.current.actions.getUrlProgress).toBe(initialGetUrlProgress);
  });

  it('tells the WebGPU canvas when a dataset load or a tile download owns the loading state', async () => {
    const pendingFetch = buildPendingFetch();
    vi.stubGlobal('fetch', vi.fn(pendingFetch.fetch));
    useReconstructionStore.setState({ loadedFiles: buildLoadedFiles({
      splatFileSources: [{ id: 'tile.spz', path: 'tile.spz', url: 'https://x/tile.spz', size: 1 }] }) });
    const { result } = renderHook(() => useSceneContainerStoreFacade());
    const splat = new File(['splat'], 'scene.spz');
    expect(result.current.actions.isDatasetLoadPendingForSplat(splat)).toBe(false);
    expect(result.current.actions.isSplatDownloadPending()).toBe(false);

    const load = beginReconstructionLoad();
    expect(result.current.actions.isDatasetLoadPendingForSplat(splat)).toBe(true);
    load.finish();

    // The hook reads the loading state the download writes, so its updates go through act.
    let download!: Promise<void>;
    act(() => { download = useReconstructionStore.getState().selectSplatSource('tile.spz'); });
    expect(result.current.actions.isSplatDownloadPending()).toBe(true);
    await act(async () => {
      useReconstructionStore.getState().cancelLoading();
      await download;
    });
    expect(result.current.actions.isSplatDownloadPending()).toBe(false);
  });

  it('exposes point-layer auto-hide visibility for the outer WebGPU canvas', () => {
    useUIStore.setState({
      isIdle: true,
      autoHideElements: {
        ...useUIStore.getInitialState().autoHideElements,
        points: true,
      },
    });

    const { result } = renderHook(() => useSceneContainerStoreFacade());

    expect(result.current.data.pointsLayerVisible).toBe(false);
  });
});
