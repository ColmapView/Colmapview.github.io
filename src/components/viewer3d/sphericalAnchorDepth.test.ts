import { describe, expect, it } from 'vitest';
import { computeMedianObservedPointDepth, median } from './sphericalAnchorDepth';

describe('median', () => {
  it('returns the middle element for odd counts', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([5])).toBe(5);
  });

  it('averages the two middle elements for even counts', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([10, 2])).toBe(6);
  });

  it('does not mutate its input', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe('computeMedianObservedPointDepth', () => {
  const origin = { x: 0, y: 0, z: 0 };

  // Points laid along +x so each point's distance from the origin equals its x.
  function xAxisPositions(distances: number[]): number[] {
    const out: number[] = [];
    for (const d of distances) out.push(d, 0, 0);
    return out;
  }

  it('anchors at the median distance of the OBSERVED points (odd count)', () => {
    const depth = computeMedianObservedPointDepth({
      observedPointIds: new Set([10n, 20n, 30n]),
      wasm: {
        positions: xAxisPositions([3, 5, 4]),
        point3DIds: [10n, 20n, 30n],
        pointCount: 3,
      },
      cameraCenter: origin,
      radius: 1,
    });
    // distances {3,4,5} -> median 4; above the 2r=2 clamp.
    expect(depth).toBeCloseTo(4, 12);
  });

  it('averages the two middle distances for an even observed count', () => {
    const depth = computeMedianObservedPointDepth({
      observedPointIds: new Set([1n, 2n, 3n, 4n]),
      wasm: {
        positions: xAxisPositions([3, 4, 5, 6]),
        point3DIds: [1n, 2n, 3n, 4n],
        pointCount: 4,
      },
      cameraCenter: origin,
      radius: 1,
    });
    // distances {3,4,5,6} -> median (4+5)/2 = 4.5.
    expect(depth).toBeCloseTo(4.5, 12);
  });

  it('only counts the observed subset, ignoring unobserved points', () => {
    const depth = computeMedianObservedPointDepth({
      observedPointIds: new Set([1n, 2n, 3n]),
      wasm: {
        positions: xAxisPositions([3, 4, 5, 100]),
        point3DIds: [1n, 2n, 3n, 4n],
        pointCount: 4,
      },
      cameraCenter: origin,
      radius: 1,
    });
    // observed {3,4,5} -> median 4 (the far point id 4 is excluded).
    expect(depth).toBeCloseTo(4, 12);
  });

  it('falls back to the median over ALL points when the image observes none', () => {
    const depth = computeMedianObservedPointDepth({
      observedPointIds: new Set([999n]), // not present among the point ids
      wasm: {
        positions: xAxisPositions([3, 4, 5, 6]),
        point3DIds: [1n, 2n, 3n, 4n],
        pointCount: 4,
      },
      cameraCenter: origin,
      radius: 0.5,
    });
    // no observed matches -> median over all {3,4,5,6} = 4.5.
    expect(depth).toBeCloseTo(4.5, 12);
  });

  it('falls back to 10x radius when there are no points at all', () => {
    const depth = computeMedianObservedPointDepth({
      observedPointIds: null,
      wasm: { positions: [], point3DIds: [], pointCount: 0 },
      points3D: null,
      cameraCenter: origin,
      radius: 2,
    });
    expect(depth).toBeCloseTo(20, 12); // 10 * 2
  });

  it('clamps the anchor to at least 2x radius (disk stays outside the sphere)', () => {
    const depth = computeMedianObservedPointDepth({
      observedPointIds: new Set([7n]),
      wasm: {
        positions: xAxisPositions([1]), // a very near observed point
        point3DIds: [7n],
        pointCount: 1,
      },
      cameraCenter: origin,
      radius: 5,
    });
    // median distance 1, but clamped up to 2r = 10.
    expect(depth).toBeCloseTo(10, 12);
  });

  it('supports a points3D Map source when WASM arrays are unavailable', () => {
    const depth = computeMedianObservedPointDepth({
      observedPointIds: new Set([1n, 2n]),
      points3D: new Map([
        [1n, { xyz: [3, 0, 0] as [number, number, number] }],
        [2n, { xyz: [0, 4, 0] as [number, number, number] }],
        [3n, { xyz: [0, 0, 100] as [number, number, number] }],
      ]),
      cameraCenter: origin,
      radius: 1,
    });
    // observed distances {3,4} -> median 3.5.
    expect(depth).toBeCloseTo(3.5, 12);
  });

  it('measures distance from the given camera center, not the origin', () => {
    const depth = computeMedianObservedPointDepth({
      observedPointIds: new Set([1n]),
      wasm: {
        positions: [10, 0, 0], // point at x=10
        point3DIds: [1n],
        pointCount: 1,
      },
      cameraCenter: { x: 4, y: 0, z: 0 }, // 6 away from the point
      radius: 1,
    });
    expect(depth).toBeCloseTo(6, 12);
  });
});
