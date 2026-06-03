import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type {
  PointPickingMode,
  SelectedPoint,
} from '../../store/stores/pointPickingStore';
import {
  getNormalArrowData,
  getRequiredPointCount,
  getScreenPoint,
  getSelectedPointLinePositions,
  getSelectedPointMarkerScale,
  needsMoreSelectedPoints,
  shouldInitializeNormalTargetAxis,
  shouldShowSelectedPointMarkers,
} from './selectedPointMarkersViewModel';

function point(x: number, y: number, z: number): SelectedPoint {
  return { position: new THREE.Vector3(x, y, z), point3DId: BigInt(x + y + z) };
}

function expectVectorClose(actual: THREE.Vector3, expected: [number, number, number]): void {
  expect(actual.x).toBeCloseTo(expected[0]);
  expect(actual.y).toBeCloseTo(expected[1]);
  expect(actual.z).toBeCloseTo(expected[2]);
}

describe('selected point markers view model', () => {
  it('maps picking modes to required point counts', () => {
    const expected: Record<PointPickingMode, number> = {
      off: 0,
      'origin-1pt': 1,
      'distance-2pt': 2,
      'normal-3pt': 3,
    };

    for (const [mode, count] of Object.entries(expected) as [PointPickingMode, number][]) {
      expect(getRequiredPointCount(mode)).toBe(count);
    }
  });

  it('reports whether more points are needed for the active mode', () => {
    expect(needsMoreSelectedPoints(0, 'origin-1pt')).toBe(true);
    expect(needsMoreSelectedPoints(1, 'origin-1pt')).toBe(false);
    expect(needsMoreSelectedPoints(2, 'normal-3pt')).toBe(true);
    expect(needsMoreSelectedPoints(3, 'normal-3pt')).toBe(false);
    expect(needsMoreSelectedPoints(0, 'off')).toBe(false);
  });

  it('renders markers only when selected or hover preview data exists', () => {
    expect(shouldShowSelectedPointMarkers(0, null)).toBe(false);
    expect(shouldShowSelectedPointMarkers(1, null)).toBe(true);
    expect(shouldShowSelectedPointMarkers(0, new THREE.Vector3())).toBe(true);
  });

  it('initializes normal target axis only when entering 3-point mode', () => {
    expect(shouldInitializeNormalTargetAxis('distance-2pt', 'normal-3pt')).toBe(true);
    expect(shouldInitializeNormalTargetAxis('normal-3pt', 'normal-3pt')).toBe(false);
    expect(shouldInitializeNormalTargetAxis('normal-3pt', 'distance-2pt')).toBe(false);
  });

  it('scales markers from the first selected point distance', () => {
    expect(getSelectedPointMarkerScale([])).toBeCloseTo(0.015);
    expect(getSelectedPointMarkerScale([point(0, 0, 0)])).toBeCloseTo(0.015);
    expect(getSelectedPointMarkerScale([point(0, 0, 0), point(1, 0, 0)])).toBeCloseTo(0.015);
    expect(getSelectedPointMarkerScale([point(0, 0, 0), point(100, 0, 0)])).toBeCloseTo(1.5);
  });

  it('builds connecting-line positions and closes 3-point triangles', () => {
    const points = [point(1, 2, 3), point(4, 5, 6), point(7, 8, 9)];

    expect(getSelectedPointLinePositions(points.slice(0, 1), 'distance-2pt')).toBeNull();
    expect(getSelectedPointLinePositions(points.slice(0, 2), 'distance-2pt')).toEqual([
      1, 2, 3,
      4, 5, 6,
    ]);
    expect(getSelectedPointLinePositions(points, 'normal-3pt')).toEqual([
      1, 2, 3,
      4, 5, 6,
      7, 8, 9,
      1, 2, 3,
    ]);
  });

  it('computes normal-arrow geometry for a selected triangle', () => {
    const data = getNormalArrowData([
      point(0, 0, 0),
      point(2, 0, 0),
      point(0, 2, 0),
    ], 'normal-3pt', false);

    expect(data).not.toBeNull();
    expectVectorClose(data!.normal, [0, 0, 1]);
    expectVectorClose(data!.start, [2 / 3, 2 / 3, 0]);
    expectVectorClose(data!.end, [2 / 3, 2 / 3, 1]);
    expect(data!.coneHeight).toBeCloseTo(0.2);
    expect(data!.coneRadius).toBeCloseTo(0.04);
    expect(Array.from(data!.trianglePositions)).toEqual([
      0, 0, 0,
      2, 0, 0,
      0, 2, 0,
    ]);
  });

  it('flips normal-arrow direction when requested', () => {
    const data = getNormalArrowData([
      point(0, 0, 0),
      point(2, 0, 0),
      point(0, 2, 0),
    ], 'normal-3pt', true);

    expect(data).not.toBeNull();
    expectVectorClose(data!.normal, [0, 0, -1]);
    expectVectorClose(data!.end, [2 / 3, 2 / 3, -1]);
  });

  it('does not build normal arrows for inactive, incomplete, or degenerate selections', () => {
    expect(getNormalArrowData([
      point(0, 0, 0),
      point(2, 0, 0),
      point(0, 2, 0),
    ], 'distance-2pt', false)).toBeNull();
    expect(getNormalArrowData([
      point(0, 0, 0),
      point(2, 0, 0),
    ], 'normal-3pt', false)).toBeNull();
    expect(getNormalArrowData([
      point(0, 0, 0),
      point(1, 1, 1),
      point(2, 2, 2),
    ], 'normal-3pt', false)).toBeNull();
  });

  it('normalizes client coordinates into screen points', () => {
    expect(getScreenPoint(12, 34)).toEqual({ x: 12, y: 34 });
  });
});
