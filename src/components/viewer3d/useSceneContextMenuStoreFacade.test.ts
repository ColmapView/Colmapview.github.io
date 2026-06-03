import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  usePointPickingStore,
  useUIStore,
  type SelectedPoint,
} from '../../store';
import { useSceneContextMenuStoreFacade } from './useSceneContextMenuStoreFacade';

function selectedPoint(id: number): SelectedPoint {
  return {
    position: new THREE.Vector3(id, 0, 0),
    point3DId: BigInt(id),
  };
}

describe('useSceneContextMenuStoreFacade', () => {
  beforeEach(() => {
    usePointPickingStore.setState(usePointPickingStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('collects scene context menu data from UI and point-picking stores', () => {
    useUIStore.setState({
      touchMode: true,
    });
    usePointPickingStore.setState({
      pickingMode: 'distance-2pt',
      selectedPoints: [selectedPoint(1), selectedPoint(2)],
      markerRightClickHandled: true,
    });

    const { result } = renderHook(() => useSceneContextMenuStoreFacade());

    expect(result.current.data).toMatchObject({
      touchMode: true,
      pickingMode: 'distance-2pt',
      selectedPointsLength: 2,
      markerRightClickHandled: true,
    });
  });

  it('routes context menu and point-picking updates through store actions', () => {
    usePointPickingStore.setState({
      pickingMode: 'normal-3pt',
      selectedPoints: [selectedPoint(1), selectedPoint(2)],
      markerRightClickHandled: true,
    });

    const { result } = renderHook(() => useSceneContextMenuStoreFacade());

    act(() => {
      result.current.actions.openContextMenu(20, 30);
    });
    expect(useUIStore.getState().contextMenuPosition).toEqual({ x: 20, y: 30 });

    act(() => {
      result.current.actions.closeContextMenu();
      result.current.actions.removeLastPoint();
      result.current.actions.setMarkerRightClickHandled(false);
    });

    expect(useUIStore.getState().contextMenuPosition).toBeNull();
    expect(usePointPickingStore.getState()).toMatchObject({
      selectedPoints: [selectedPoint(1)],
      markerRightClickHandled: false,
    });

    act(() => {
      result.current.actions.resetPointPicking();
    });

    expect(usePointPickingStore.getState()).toMatchObject({
      pickingMode: 'off',
      selectedPoints: [],
      markerRightClickHandled: false,
    });
  });
});
