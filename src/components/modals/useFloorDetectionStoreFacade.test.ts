import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  useFloorPlaneStore,
  useReconstructionStore,
  useTransformStore,
  useUIStore,
} from '../../store';
import {
  buildReconstruction,
  buildWasmReconstructionWrapper,
} from '../../test/builders';
import type { Plane } from '../../utils/ransac';
import { createIdentityEuler } from '../../utils/sim3dTransforms';
import { useFloorDetectionStoreFacade } from './useFloorDetectionStoreFacade';

const plane: Plane = {
  normal: [0, 1, 0],
  d: 0,
  centroid: [0, 0, 0],
  inlierCount: 4,
  radius: 1,
};

describe('useFloorDetectionStoreFacade', () => {
  beforeEach(() => {
    useFloorPlaneStore.setState(useFloorPlaneStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects floor-detection dependencies from owning stores', () => {
    const reconstruction = buildReconstruction();
    const wasmReconstruction = buildWasmReconstructionWrapper({
      positions: new Float32Array([0, 0, 0]),
    });
    const transform = {
      ...createIdentityEuler(),
      scale: 2,
      rotationZ: 0.5,
    };

    useReconstructionStore.setState({ reconstruction, wasmReconstruction });
    useTransformStore.setState({ transform });
    useUIStore.setState({ axesCoordinateSystem: 'unreal' });
    useFloorPlaneStore.setState({
      detectedPlane: plane,
      distanceThreshold: 0.2,
      sampleCount: 12000,
      floorColorMode: 'distance',
      isDetecting: true,
      normalFlipped: true,
      targetAxis: 'Z',
    });

    const { result } = renderHook(() => useFloorDetectionStoreFacade());

    expect(result.current.data).toMatchObject({
      reconstruction,
      wasmReconstruction,
    });
    expect(result.current.floor).toMatchObject({
      detectedPlane: plane,
      distanceThreshold: 0.2,
      sampleCount: 12000,
      floorColorMode: 'distance',
      isDetecting: true,
      normalFlipped: true,
      targetAxis: 'Z',
    });
    expect(result.current.transform.transform).toBe(transform);
    expect(result.current.ui.axesCoordinateSystem).toBe('unreal');
  });

  it('routes floor-detection actions back to owning stores', () => {
    const distances = new Float32Array([0.1, 0.2]);
    const { result } = renderHook(() => useFloorDetectionStoreFacade());

    act(() => {
      result.current.floor.setDetectedPlane(plane);
      result.current.floor.setDistanceThreshold(0.15);
      result.current.floor.setSampleCount(9000);
      result.current.floor.setFloorColorMode('binary');
      result.current.floor.setPointDistances(distances);
      result.current.floor.setIsDetecting(true);
      result.current.floor.toggleNormalFlipped();
      result.current.floor.cycleTargetAxis();
      result.current.transform.setTransform({ scale: 4, translationX: 5 });
    });

    expect(useFloorPlaneStore.getState()).toMatchObject({
      detectedPlane: plane,
      distanceThreshold: 0.15,
      sampleCount: 9000,
      floorColorMode: 'binary',
      pointDistances: distances,
      isDetecting: true,
      normalFlipped: true,
      targetAxis: 'Z',
    });
    expect(useTransformStore.getState().transform).toMatchObject({
      scale: 4,
      translationX: 5,
    });

    act(() => {
      result.current.floor.reset();
    });

    expect(useFloorPlaneStore.getState()).toMatchObject({
      detectedPlane: null,
      floorColorMode: 'off',
      pointDistances: null,
      isDetecting: false,
      normalFlipped: false,
      targetAxis: 'Y',
    });
  });
});
