import { describe, expect, it } from 'vitest';
import {
  getPoint3DIdForIndex,
  normalizeEqualRange,
  shouldIncludePointByFilters,
  shouldUsePointCloudFastPath,
} from './pointCloudDataPolicy';

describe('point cloud data policy', () => {
  it('uses the fast path only when no filters are active', () => {
    expect(shouldUsePointCloudFastPath({
      minTrackLength: 1,
      maxReprojectionError: 1000,
      thinning: 0,
    })).toBe(true);
    expect(shouldUsePointCloudFastPath({
      minTrackLength: 2,
      maxReprojectionError: 1000,
      thinning: 0,
    })).toBe(false);
    expect(shouldUsePointCloudFastPath({
      minTrackLength: 1,
      maxReprojectionError: 2,
      thinning: 0,
    })).toBe(false);
    expect(shouldUsePointCloudFastPath({
      minTrackLength: 1,
      maxReprojectionError: 1000,
      thinning: 1,
    })).toBe(false);
  });

  it('applies thinning, track length, and reprojection error filters', () => {
    const filters = {
      minTrackLength: 3,
      maxReprojectionError: 2.5,
      thinning: 1,
    };

    expect(shouldIncludePointByFilters(0, 3, 2.5, filters)).toBe(true);
    expect(shouldIncludePointByFilters(1, 3, 2.5, filters)).toBe(false);
    expect(shouldIncludePointByFilters(2, 2, 2.5, filters)).toBe(false);
    expect(shouldIncludePointByFilters(2, 3, 2.6, filters)).toBe(false);
  });

  it('resolves point IDs from WASM arrays or COLMAP one-based fallback IDs', () => {
    const ids = [10n, 20n, 30n];

    expect(getPoint3DIdForIndex(ids, 1)).toBe(20n);
    expect(getPoint3DIdForIndex(null, 1)).toBe(2n);
    expect(getPoint3DIdForIndex(undefined, 2)).toBe(3n);
  });

  it('normalizes equal ranges for color scaling without changing distinct ranges', () => {
    expect(normalizeEqualRange(4, 4)).toEqual({ min: 4, max: 5 });
    expect(normalizeEqualRange(2, 7)).toEqual({ min: 2, max: 7 });
  });
});
