import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  usePointPickingStore,
  useReconstructionStore,
  useTransformStore,
  useUIStore,
} from '../../store';
import { buildReconstruction } from '../../test/builders';
import type { Sim3dEuler } from '../../types/sim3d';
import { useTrackballControlsStoreFacade } from './useTrackballControlsStoreFacade';

describe('useTrackballControlsStoreFacade', () => {
  beforeEach(() => {
    usePointPickingStore.setState(usePointPickingStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects trackball control dependencies from owning stores', () => {
    const reconstruction = buildReconstruction();
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
    usePointPickingStore.setState({ pickingMode: 'normal-3pt' });
    useTransformStore.setState({ transform });
    useUIStore.setState({ touchMode: true });

    const { result } = renderHook(() => useTrackballControlsStoreFacade());

    expect(result.current.data).toMatchObject({
      reconstruction,
      pickingMode: 'normal-3pt',
      transform,
      touchMode: true,
    });
  });
});
