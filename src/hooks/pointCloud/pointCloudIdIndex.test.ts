import { describe, expect, it, vi } from 'vitest';
import { createIndexedPointIdLookup } from './pointCloudIdIndex';
import { computeSelectedPointOverlay } from './pointCloudSelectionOverlay';

describe('compact point ID lookup', () => {
  it.each([[10n, 30n, 9007199254741001n], [9007199254741001n, 10n, 30n]])('finds sparse IDs without numeric precision loss (case %#)', (...ids) => {
    const lookup = createIndexedPointIdLookup({ get: (index) => ids[index] }, ids.length);
    ids.forEach((id, index) => expect(lookup.findIndex!(id)).toBe(index));
    expect(lookup.findIndex!(11n)).toBe(-1);
  });

  it('bounds selection lookup work by selected count and preserves rendered order', () => {
    const count = 10_000;
    const get = vi.fn((index: number) => BigInt(index * 11 + 5));
    const lookup = createIndexedPointIdLookup({ get }, count);
    get.mockClear();
    const positions = Float32Array.from({ length: count * 3 }, (_, index) => index);
    const overlay = computeSelectedPointOverlay({
      pointCount: count, point3DIds: null, pointIdLookup: lookup, positions,
      selectedPointIds: new Set([BigInt(9000 * 11 + 5), 5n, 9n]), highlightColor: [1, 0, 0],
    });
    expect(Array.from(overlay.selectedPositions!)).toEqual([0, 1, 2, 27000, 27001, 27002]);
    expect(get.mock.calls.length).toBeLessThan(50);
  });

  it.each([[10n, 10n, 30n], [30n, 10n, 30n]])('preserves every selected row with duplicate IDs (case %#)', (...ids) => {
    const lookup = createIndexedPointIdLookup({ get: (index) => ids[index] }, ids.length);
    expect(lookup.findIndex).toBeUndefined();
    const positions = Float32Array.from({ length: ids.length * 3 }, (_, index) => index);
    const overlay = computeSelectedPointOverlay({
      pointCount: ids.length, point3DIds: null, pointIdLookup: lookup, positions,
      selectedPointIds: new Set([ids[0]]), highlightColor: [1, 0, 0],
    });
    expect(Array.from(overlay.selectedPositions!)).toEqual(ids.flatMap((id, index) =>
      id === ids[0] ? Array.from(positions.subarray(index * 3, index * 3 + 3)) : []));
  });
});
