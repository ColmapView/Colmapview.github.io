import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useFloorPlaneStore,
  useReconstructionStore,
  useTransformStore,
  useUIStore,
} from '../../store';
import { buildWasmReconstructionWrapper } from '../../test/builders';
import type { Plane } from '../../utils/ransac';
import { createIdentityEuler } from '../../utils/sim3dTransforms';
import { useFloorAlignStoreFacade } from './useFloorAlignStoreFacade';

const plane: Plane = {
  normal: [0, 1, 0],
  d: 0,
  centroid: [0, 0, 0],
  inlierCount: 4,
  radius: 1,
};

describe('useFloorAlignStoreFacade', () => {
  beforeEach(() => {
    useFloorPlaneStore.setState(useFloorPlaneStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects floor-align dependencies from owning stores', () => {
    const wasmReconstruction = buildWasmReconstructionWrapper({
      positions: new Float32Array([0, 0, 0]),
    });
    const transform = {
      ...createIdentityEuler(),
      scale: 2,
      rotationX: 0.25,
    };

    useReconstructionStore.setState({ wasmReconstruction });
    useTransformStore.setState({ transform });
    useUIStore.setState({ axesCoordinateSystem: 'unreal' });
    useFloorPlaneStore.setState({
      showFloorModal: true,
      modalPosition: { x: 12, y: 34 },
      detectedPlane: plane,
      normalFlipped: true,
      targetAxis: 'Z',
      distanceThreshold: 0.12,
      maxIterations: 123,
      sampleCount: 456,
    });

    const { result } = renderHook(() => useFloorAlignStoreFacade());

    expect(result.current.data.wasmReconstruction).toBe(wasmReconstruction);
    expect(result.current.floor).toMatchObject({
      showFloorModal: true,
      modalPosition: { x: 12, y: 34 },
      detectedPlane: plane,
      normalFlipped: true,
      targetAxis: 'Z',
      distanceThreshold: 0.12,
      maxIterations: 123,
      sampleCount: 456,
    });
    expect(result.current.transform.transform).toBe(transform);
    expect(result.current.ui.axesCoordinateSystem).toBe('unreal');
  });

  it('routes floor-align actions back to owning stores', () => {
    const distances = new Float32Array([0, 0.5]);
    const { result } = renderHook(() => useFloorAlignStoreFacade());

    act(() => {
      result.current.floor.setShowFloorModal(true);
      result.current.floor.setDetectedPlane(plane);
      result.current.floor.setPointDistances(distances);
      result.current.floor.setIsDetecting(true);
      result.current.transform.setTransform({ scale: 3, translationY: 6 });
    });

    expect(useFloorPlaneStore.getState()).toMatchObject({
      showFloorModal: true,
      detectedPlane: plane,
      pointDistances: distances,
      isDetecting: true,
    });
    expect(useTransformStore.getState().transform).toMatchObject({
      scale: 3,
      translationY: 6,
    });

    act(() => {
      result.current.floor.reset();
    });

    expect(useFloorPlaneStore.getState()).toMatchObject({
      showFloorModal: false,
      detectedPlane: null,
      pointDistances: null,
      isDetecting: false,
    });
  });
});
