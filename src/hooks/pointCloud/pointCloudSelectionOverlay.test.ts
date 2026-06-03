import { describe, expect, it } from 'vitest';
import { computeSelectedPointOverlay } from './pointCloudSelectionOverlay';

describe('point cloud selection overlay', () => {
  const positions = new Float32Array([
    1, 2, 3,
    4, 5, 6,
    7, 8, 9,
  ]);
  const highlightColor: [number, number, number] = [1, 0.5, 0.25];

  it('returns null arrays when no points are selected', () => {
    expect(computeSelectedPointOverlay({
      pointCount: 3,
      point3DIds: [10n, 20n, 30n],
      positions,
      selectedPointIds: new Set(),
      highlightColor,
    })).toEqual({ selectedPositions: null, selectedColors: null });
  });

  it('returns null arrays when selected IDs do not match any point', () => {
    expect(computeSelectedPointOverlay({
      pointCount: 3,
      point3DIds: [10n, 20n, 30n],
      positions,
      selectedPointIds: new Set([99n]),
      highlightColor,
    })).toEqual({ selectedPositions: null, selectedColors: null });
  });

  it('builds compact selected position and color arrays for explicit point IDs', () => {
    const result = computeSelectedPointOverlay({
      pointCount: 3,
      point3DIds: [10n, 20n, 30n],
      positions,
      selectedPointIds: new Set([30n, 10n]),
      highlightColor,
    });

    expect(Array.from(result.selectedPositions!)).toEqual([
      1, 2, 3,
      7, 8, 9,
    ]);
    expect(Array.from(result.selectedColors!)).toEqual([
      1, 0.5, 0.25,
      1, 0.5, 0.25,
    ]);
  });

  it('uses COLMAP one-based fallback IDs when no point ID array is available', () => {
    const result = computeSelectedPointOverlay({
      pointCount: 3,
      point3DIds: null,
      positions,
      selectedPointIds: new Set([2n]),
      highlightColor,
    });

    expect(Array.from(result.selectedPositions!)).toEqual([4, 5, 6]);
    expect(Array.from(result.selectedColors!)).toEqual([1, 0.5, 0.25]);
  });
});
