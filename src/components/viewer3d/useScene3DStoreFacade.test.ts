import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useCameraStore,
  useNotificationStore,
  usePointCloudStore,
  useReconstructionStore,
  useSplatBackendStore,
  useTransformStore,
  useUIStore,
} from '../../store';
import { buildFile, buildLoadedFiles, buildReconstruction } from '../../test/builders';
import type { Sim3dEuler } from '../../types/sim3d';
import {
  useSceneContainerStoreFacade,
  useSceneContentStoreFacade,
} from './useScene3DStoreFacade';

describe('useScene3DStoreFacade', () => {
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
    useTransformStore.setState({ transform });
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
      requestedSplatBackend: 'webgpu',
    });
    expect(result.current.data.splatBackendAvailability.webGpu).toBe('unavailable');

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

    const { result } = renderHook(() => useSceneContainerStoreFacade());

    expect(result.current.data).toMatchObject({
      reconstruction,
      wasmReconstruction: null,
      splatFile,
      backgroundColor: '#101820',
      showAutoHideEditor: true,
      requestedSplatBackend: 'auto',
      splatsVisible: true,
    });
    expect(result.current.data.splatBackendAvailability.spark).toBe(true);
    expect(result.current.data.splatBackendResolution.backend).toBe('spark');

    act(() => {
      result.current.actions.addNotification('warning', 'WebGPU unavailable');
      result.current.actions.setSelectedImageId(42);
      result.current.actions.setWebGpuBackendState('failed', 'adapter lost');
    });

    expect(useCameraStore.getState().selectedImageId).toBe(42);
    expect(useNotificationStore.getState().notifications).toMatchObject([
      { type: 'warning', message: 'WebGPU unavailable' },
    ]);
    expect(useSplatBackendStore.getState().availability.webGpu).toBe('failed');
    expect(useSplatBackendStore.getState().availability.webGpuFailureReason).toBe('adapter lost');
  });
});
