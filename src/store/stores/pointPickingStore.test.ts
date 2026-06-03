import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { usePointPickingStore, type SelectedPoint } from './pointPickingStore';

function point(id: number): SelectedPoint {
  return {
    position: new THREE.Vector3(id, 0, 0),
    point3DId: BigInt(id),
  };
}

describe('point picking store', () => {
  beforeEach(() => {
    usePointPickingStore.getState().reset();
  });

  it('caps selected points according to the active picking mode', () => {
    const store = usePointPickingStore.getState();

    store.setPickingMode('distance-2pt');
    usePointPickingStore.getState().addSelectedPoint(point(1), { x: 10, y: 20 });
    usePointPickingStore.getState().addSelectedPoint(point(2), { x: 30, y: 40 });
    usePointPickingStore.getState().addSelectedPoint(point(3), { x: 50, y: 60 });

    expect(usePointPickingStore.getState().selectedPoints.map((selected) => selected.point3DId)).toEqual([
      1n,
      2n,
    ]);
    expect(usePointPickingStore.getState().showDistanceModal).toBe(true);
    expect(usePointPickingStore.getState().modalPosition).toEqual({ x: 30, y: 40 });
  });

  it('does not add points while picking is off', () => {
    usePointPickingStore.getState().addSelectedPoint(point(1), { x: 10, y: 20 });

    expect(usePointPickingStore.getState().selectedPoints).toEqual([]);
    expect(usePointPickingStore.getState().showDistanceModal).toBe(false);
  });

  it('does not leave marker right-click state sticky after object handlers run', () => {
    const store = usePointPickingStore.getState();

    store.setPickingMode('normal-3pt');
    usePointPickingStore.getState().addSelectedPoint(point(1));
    usePointPickingStore.getState().addSelectedPoint(point(2));
    usePointPickingStore.getState().addSelectedPoint(point(3));

    usePointPickingStore.getState().removePointAt(1);
    expect(usePointPickingStore.getState().markerRightClickHandled).toBe(false);

    usePointPickingStore.getState().cycleTargetAxis('colmap');
    expect(usePointPickingStore.getState().targetAxis).toBe('X');
    expect(usePointPickingStore.getState().markerRightClickHandled).toBe(false);
  });

  it('updates marker right-click handling state through an explicit action', () => {
    usePointPickingStore.getState().setMarkerRightClickHandled(true);
    expect(usePointPickingStore.getState().markerRightClickHandled).toBe(true);

    usePointPickingStore.getState().setMarkerRightClickHandled(false);
    expect(usePointPickingStore.getState().markerRightClickHandled).toBe(false);
  });
});
