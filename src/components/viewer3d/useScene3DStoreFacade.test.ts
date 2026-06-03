import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useCameraStore,
  useReconstructionStore,
  useTransformStore,
  useUIStore,
} from '../../store';
import { buildReconstruction } from '../../test/builders';
import type { Sim3dEuler } from '../../types/sim3d';
import {
  useSceneContainerStoreFacade,
  useSceneContentStoreFacade,
} from './useScene3DStoreFacade';

describe('useScene3DStoreFacade', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useCameraStore.setState(useCameraStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects scene content dependencies from owning stores', () => {
    const reconstruction = buildReconstruction();
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

    useReconstructionStore.setState({ reconstruction });
    useTransformStore.setState({ transform });
    useUIStore.setState({
      isIdle: true,
      autoHideElements,
      showAutoHideEditor: true,
      viewResetTrigger: 4,
      viewDirection: 'z',
      viewTrigger: 5,
    });

    const { result } = renderHook(() => useSceneContentStoreFacade());

    expect(result.current.data).toMatchObject({
      reconstruction,
      wasmReconstruction: null,
      isIdle: true,
      autoHideElements,
      showAutoHideEditor: true,
      viewResetTrigger: 4,
      viewDirection: 'z',
      viewTrigger: 5,
      transform,
    });
  });

  it('collects scene container dependencies and routes selection actions', () => {
    const reconstruction = buildReconstruction();

    useReconstructionStore.setState({ reconstruction });
    useUIStore.setState({
      backgroundColor: '#101820',
      showAutoHideEditor: true,
    });

    const { result } = renderHook(() => useSceneContainerStoreFacade());

    expect(result.current.data).toMatchObject({
      reconstruction,
      wasmReconstruction: null,
      backgroundColor: '#101820',
      showAutoHideEditor: true,
    });

    act(() => {
      result.current.actions.setSelectedImageId(42);
    });

    expect(useCameraStore.getState().selectedImageId).toBe(42);
  });
});
