import { act, renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  usePointPickingStore,
  useTransformStore,
  useUIStore,
} from '../../store';
import { createIdentityEuler } from '../../utils/sim3dTransforms';
import { useDistanceInputStoreFacade } from './useDistanceInputStoreFacade';

function createSelectedPoints() {
  return [
    { position: new THREE.Vector3(1, 0, 0), point3DId: 1n },
    { position: new THREE.Vector3(3, 0, 0), point3DId: 2n },
  ];
}

describe('useDistanceInputStoreFacade', () => {
  beforeEach(() => {
    usePointPickingStore.setState(usePointPickingStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects distance-input dependencies from owning stores', () => {
    const selectedPoints = createSelectedPoints();
    const transform = {
      ...createIdentityEuler(),
      scale: 2,
      translationX: 4,
    };
    usePointPickingStore.setState({
      showDistanceModal: true,
      modalPosition: { x: 12, y: 34 },
      selectedPoints,
      pickingMode: 'distance-2pt',
      normalFlipped: true,
      targetAxis: 'Z',
    });
    useTransformStore.setState({ transform });
    useUIStore.setState({ axesCoordinateSystem: 'unreal' });

    const { result } = renderHook(() => useDistanceInputStoreFacade());

    expect(result.current.pointPicking).toMatchObject({
      showDistanceModal: true,
      modalPosition: { x: 12, y: 34 },
      selectedPoints,
      pickingMode: 'distance-2pt',
      normalFlipped: true,
      targetAxis: 'Z',
    });
    expect(result.current.transform.transform).toBe(transform);
    expect(result.current.ui.axesCoordinateSystem).toBe('unreal');
  });

  it('routes point-picking and transform actions back to owning stores', () => {
    const { result } = renderHook(() => useDistanceInputStoreFacade());

    act(() => {
      result.current.pointPicking.setShowDistanceModal(true);
      result.current.pointPicking.setTargetDistance(12.5);
      result.current.transform.setTransform({ scale: 3, translationY: 6 });
    });

    expect(usePointPickingStore.getState()).toMatchObject({
      showDistanceModal: true,
      targetDistance: 12.5,
    });
    expect(useTransformStore.getState().transform).toMatchObject({
      scale: 3,
      translationY: 6,
    });

    act(() => {
      usePointPickingStore.setState({
        pickingMode: 'distance-2pt',
        selectedPoints: createSelectedPoints(),
      });
      result.current.pointPicking.clearSelectedPoints();
    });

    expect(usePointPickingStore.getState()).toMatchObject({
      selectedPoints: [],
      targetDistance: null,
      showDistanceModal: false,
      modalPosition: null,
    });

    act(() => {
      usePointPickingStore.setState({
        pickingMode: 'distance-2pt',
        selectedPoints: createSelectedPoints(),
        showDistanceModal: true,
      });
      result.current.pointPicking.reset();
    });

    expect(usePointPickingStore.getState()).toMatchObject({
      pickingMode: 'off',
      selectedPoints: [],
      showDistanceModal: false,
    });
  });
});
