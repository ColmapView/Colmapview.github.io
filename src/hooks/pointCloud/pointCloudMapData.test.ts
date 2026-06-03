import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPoint3D } from '../../test/builders';
import type { Point3D } from '../../types/colmap';
import { computeSlowPathMap } from './pointCloudMapData';

function toPointMap(points: Point3D[]): Map<bigint, Point3D> {
  return new Map(points.map(point => [point.point3DId, point]));
}

function track(length: number) {
  return Array.from({ length }, (_, point2DIdx) => ({ imageId: 1, point2DIdx }));
}

describe('point cloud Map data builder', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty data and warns when no Map fallback exists', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(computeSlowPathMap({
      points3D: undefined,
      colorMode: 'rgb',
      minTrackLength: 1,
      maxReprojectionError: 10,
      thinning: 0,
      selectedImagePointIds: new Set(),
      showSelectionHighlight: false,
      highlightColor: [1, 0, 0],
    })).toEqual({
      positions: null,
      colors: null,
      selectedPositions: null,
      selectedColors: null,
      indexToPoint3DId: new Map(),
    });
    expect(warn).toHaveBeenCalledWith('[PointCloud] No points3D Map and WASM not available');
  });

  it('filters Map points and builds positions plus picking IDs', () => {
    const result = computeSlowPathMap({
      points3D: toPointMap([
        buildPoint3D({ point3DId: 10n, xyz: [0, 1, 2], error: 0.2, track: track(1) }),
        buildPoint3D({ point3DId: 20n, xyz: [3, 4, 5], error: 0.5, track: track(2) }),
        buildPoint3D({ point3DId: 30n, xyz: [6, 7, 8], error: 2, track: track(3) }),
      ]),
      colorMode: 'rgb',
      minTrackLength: 2,
      maxReprojectionError: 1.5,
      thinning: 0,
      selectedImagePointIds: new Set(),
      showSelectionHighlight: false,
      highlightColor: [1, 0, 0],
    });

    expect(Array.from(result.positions ?? [])).toEqual([3, 4, 5]);
    expect(result.indexToPoint3DId.get(0)).toBe(20n);
    expect(result.selectedPositions).toBeNull();
    expect(result.selectedColors).toBeNull();
  });

  it('builds highlighted overlay arrays for selected Map points', () => {
    const result = computeSlowPathMap({
      points3D: toPointMap([
        buildPoint3D({ point3DId: 10n, xyz: [0, 1, 2], error: 0.2, track: track(2) }),
        buildPoint3D({ point3DId: 20n, xyz: [3, 4, 5], error: 0.5, track: track(2) }),
      ]),
      colorMode: 'rgb',
      minTrackLength: 1,
      maxReprojectionError: 10,
      thinning: 0,
      selectedImagePointIds: new Set([20n]),
      showSelectionHighlight: true,
      highlightColor: [0.25, 0.5, 0.75],
    });

    expect(Array.from(result.selectedPositions ?? [])).toEqual([3, 4, 5]);
    expect(Array.from(result.selectedColors ?? [])).toEqual([0.25, 0.5, 0.75]);
  });

  it('returns empty data when filters remove every Map point', () => {
    const result = computeSlowPathMap({
      points3D: toPointMap([
        buildPoint3D({ point3DId: 10n, error: 5, track: track(1) }),
      ]),
      colorMode: 'rgb',
      minTrackLength: 10,
      maxReprojectionError: 1,
      thinning: 0,
      selectedImagePointIds: new Set(),
      showSelectionHighlight: false,
      highlightColor: [1, 0, 0],
    });

    expect(result).toEqual({
      positions: null,
      colors: null,
      selectedPositions: null,
      selectedColors: null,
      indexToPoint3DId: new Map(),
    });
  });

  it('normalizes track-length colors for included Map points', () => {
    const result = computeSlowPathMap({
      points3D: toPointMap([
        buildPoint3D({ point3DId: 10n, track: track(2), rgb: [255, 0, 0] }),
        buildPoint3D({ point3DId: 20n, track: track(4), rgb: [0, 255, 0] }),
      ]),
      colorMode: 'trackLength',
      minTrackLength: 1,
      maxReprojectionError: 10,
      thinning: 0,
      selectedImagePointIds: new Set(),
      showSelectionHighlight: false,
      highlightColor: [1, 0, 0],
    });

    const colors = Array.from(result.colors ?? []).map(value => Number(value.toFixed(2)));
    expect(colors).toEqual([
      0.1, 0.1, 0.5,
      0.2, 1, 0.3,
    ]);
  });
});
