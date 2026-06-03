import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  usePointCloudStore,
  usePointPickingStore,
  useUIStore,
} from '../../store';
import { useSelectedPointMarkersStoreFacade } from './useSelectedPointMarkersStoreFacade';

describe('useSelectedPointMarkersStoreFacade', () => {
  beforeEach(() => {
    usePointPickingStore.setState(usePointPickingStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects selected-point marker dependencies from owning stores', () => {
    const selectedPoints = [
      { position: new THREE.Vector3(1, 2, 3), point3DId: 1n },
    ];
    const hoveredPoint = new THREE.Vector3(4, 5, 6);

    usePointPickingStore.setState({
      selectedPoints,
      pickingMode: 'normal-3pt',
      normalFlipped: true,
      targetAxis: 'X',
      hoveredPoint,
    });
    usePointCloudStore.setState({ pointSize: 7 });
    useUIStore.setState({ axesCoordinateSystem: 'blender' });

    const { result } = renderHook(() => useSelectedPointMarkersStoreFacade());

    expect(result.current.data).toMatchObject({
      selectedPoints,
      pickingMode: 'normal-3pt',
      normalFlipped: true,
      targetAxis: 'X',
      hoveredPoint,
      pointSize: 7,
      axesCoordinateSystem: 'blender',
      defaultTargetAxis: 'Z',
    });
  });

  it('drops hovered-point subscriptions when the active picking mode has enough points', () => {
    const selectedPoints = [
      { position: new THREE.Vector3(1, 0, 0), point3DId: 1n },
      { position: new THREE.Vector3(2, 0, 0), point3DId: 2n },
    ];

    usePointPickingStore.setState({
      selectedPoints,
      pickingMode: 'distance-2pt',
      hoveredPoint: new THREE.Vector3(3, 0, 0),
    });

    const { result } = renderHook(() => useSelectedPointMarkersStoreFacade());

    expect(result.current.data.hoveredPoint).toBeNull();
  });

  it('routes marker actions back to the point picking store', () => {
    const selectedPoints = [
      { position: new THREE.Vector3(1, 0, 0), point3DId: 1n },
      { position: new THREE.Vector3(2, 0, 0), point3DId: 2n },
    ];

    usePointPickingStore.setState({
      selectedPoints,
      normalFlipped: false,
      targetAxis: 'Y',
    });

    const { result } = renderHook(() => useSelectedPointMarkersStoreFacade());

    act(() => {
      result.current.actions.removePointAt(0);
      result.current.actions.toggleNormalFlipped();
      result.current.actions.cycleTargetAxis('colmap');
      result.current.actions.setTargetAxis('Z');
    });

    expect(usePointPickingStore.getState()).toMatchObject({
      selectedPoints: [selectedPoints[1]],
      normalFlipped: true,
      targetAxis: 'Z',
    });
  });
});
