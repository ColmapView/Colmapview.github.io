import { describe, expect, it } from 'vitest';
import {
  getRequiredPointCount,
  needsMoreSelectedPoints,
  POINT_PICKING_REQUIRED_POINT_COUNTS,
  type PointPickingMode,
} from './pointPickingPolicy';

describe('point picking policy', () => {
  it('maps picking modes to required point counts', () => {
    expect(POINT_PICKING_REQUIRED_POINT_COUNTS).toEqual({
      off: 0,
      'origin-1pt': 1,
      'distance-2pt': 2,
      'normal-3pt': 3,
    });

    for (const mode of Object.keys(POINT_PICKING_REQUIRED_POINT_COUNTS) as PointPickingMode[]) {
      expect(getRequiredPointCount(mode)).toBe(POINT_PICKING_REQUIRED_POINT_COUNTS[mode]);
    }
  });

  it('reports whether more selected points are needed', () => {
    expect(needsMoreSelectedPoints(0, 'off')).toBe(false);
    expect(needsMoreSelectedPoints(0, 'origin-1pt')).toBe(true);
    expect(needsMoreSelectedPoints(1, 'origin-1pt')).toBe(false);
    expect(needsMoreSelectedPoints(1, 'distance-2pt')).toBe(true);
    expect(needsMoreSelectedPoints(2, 'distance-2pt')).toBe(false);
    expect(needsMoreSelectedPoints(2, 'normal-3pt')).toBe(true);
    expect(needsMoreSelectedPoints(3, 'normal-3pt')).toBe(false);
  });
});
