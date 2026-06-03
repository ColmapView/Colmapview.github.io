import { describe, expect, it } from 'vitest';
import type { Point3D } from '../types/colmap';
import { getPointFilterWarning } from './fileDropzonePointFilterWarning';

function createPoint(trackLength: number): Point3D {
  return {
    point3DId: BigInt(trackLength),
    xyz: [0, 0, 0],
    rgb: [255, 255, 255],
    error: 0,
    track: Array.from({ length: trackLength }, (_, index) => ({
      imageId: index,
      point2DIdx: index,
    })),
  };
}

describe('file dropzone point filter warning', () => {
  it('does not warn when filtering is disabled or no points are loaded', () => {
    expect(getPointFilterWarning({
      minTrackLength: 1,
      pointCount: 3,
      wasmTrackLengths: new Uint32Array([1, 2, 3]),
    })).toBeNull();

    expect(getPointFilterWarning({
      minTrackLength: 2,
      pointCount: 0,
      wasmTrackLengths: new Uint32Array([1, 1]),
    })).toBeNull();
  });

  it('counts filtered points from WASM track lengths', () => {
    expect(getPointFilterWarning({
      minTrackLength: 3,
      pointCount: 5,
      wasmTrackLengths: new Uint32Array([1, 2, 3, 4, 1]),
    })).toEqual({
      filteredCount: 3,
      percentage: '60.0',
      message: '3 points (60.0%) hidden due to min track length filter (3). Adjust in Point Cloud settings.',
    });
  });

  it('counts filtered points from JS point maps when WASM data is unavailable', () => {
    const points = new Map<bigint, Point3D>([
      [1n, createPoint(1)],
      [2n, createPoint(2)],
      [3n, createPoint(5)],
    ]);

    expect(getPointFilterWarning({
      minTrackLength: 3,
      pointCount: 3,
      points3D: points.values(),
    })).toMatchObject({
      filteredCount: 2,
      percentage: '66.7',
    });
  });

  it('does not warn when no points are hidden', () => {
    expect(getPointFilterWarning({
      minTrackLength: 2,
      pointCount: 3,
      wasmTrackLengths: new Uint32Array([2, 3, 4]),
    })).toBeNull();
  });
});
