import { describe, expect, it } from 'vitest';
import {
  computeCenterAtOrigin,
  computeNormalizeScale,
} from './sim3dNormalization';
import { transformPoint } from './sim3dTransforms';
import type { Image, Point3D, Reconstruction } from '../types/colmap';

describe('sim3d normalization helpers', () => {
  it('centers reconstruction using the median camera world position', () => {
    const reconstruction = makeReconstruction({
      images: [
        makeImage(1, [1, 2, 3]),
        makeImage(2, [3, 4, 5]),
        makeImage(3, [100, 200, 300]),
      ],
    });

    const transform = computeCenterAtOrigin(reconstruction);

    expect(transform.scale).toBe(1);
    expect(transform.translation.toArray()).toEqual([-3, -4, -5]);
    expect(transformPoint(transform, [3, 4, 5])).toEqual([0, 0, 0]);
  });

  it('normalizes scale from camera positions with explicit percentile bounds', () => {
    const reconstruction = makeReconstruction({
      images: [
        makeImage(1, [0, 0, 0]),
        makeImage(2, [10, 0, 0]),
      ],
    });

    const transform = computeNormalizeScale(reconstruction, 20, 0, 1, true);

    expect(transform.scale).toBeCloseTo(2);
    expectVectorClose(transform.translation.toArray(), [-10, 0, 0]);
    expectVectorClose(transformPoint(transform, [0, 0, 0]), [-10, 0, 0]);
    expectVectorClose(transformPoint(transform, [10, 0, 0]), [10, 0, 0]);
  });

  it('normalizes scale from points when image normalization is disabled', () => {
    const reconstruction = makeReconstruction({
      points3D: [
        makePoint(1n, [0, 0, 0]),
        makePoint(2n, [0, 6, 8]),
      ],
    });

    const transform = computeNormalizeScale(reconstruction, 10, 0, 1, false);

    expect(transform.scale).toBeCloseTo(1);
    expectVectorClose(transform.translation.toArray(), [0, -3, -4]);
    expectVectorClose(transformPoint(transform, [0, 0, 0]), [0, -3, -4]);
    expectVectorClose(transformPoint(transform, [0, 6, 8]), [0, 3, 4]);
  });

  it('returns identity transforms when no normalization coordinates exist', () => {
    const emptyReconstruction = makeReconstruction();

    expect(computeCenterAtOrigin(emptyReconstruction).translation.toArray()).toEqual([0, 0, 0]);
    expect(computeNormalizeScale(emptyReconstruction).scale).toBe(1);
    expect(computeNormalizeScale(emptyReconstruction).translation.toArray()).toEqual([0, 0, 0]);
  });
});

function makeReconstruction(options: {
  images?: Image[];
  points3D?: Point3D[];
} = {}): Reconstruction {
  return {
    cameras: new Map(),
    images: new Map((options.images ?? []).map((image) => [image.imageId, image])),
    points3D: options.points3D ? new Map(options.points3D.map((point) => [point.point3DId, point])) : new Map(),
    imageStats: new Map(),
    connectedImagesIndex: new Map(),
    imageToPoint3DIds: new Map(),
    globalStats: {
      minError: 0,
      maxError: 0,
      avgError: 0,
      minTrackLength: 0,
      maxTrackLength: 0,
      avgTrackLength: 0,
      totalObservations: 0,
      totalPoints: options.points3D?.length ?? 0,
    },
  };
}

function makeImage(imageId: number, worldPosition: [number, number, number]): Image {
  return {
    imageId,
    qvec: [1, 0, 0, 0],
    tvec: [-worldPosition[0], -worldPosition[1], -worldPosition[2]],
    cameraId: 1,
    name: `image-${imageId}.jpg`,
    points2D: [],
  };
}

function makePoint(point3DId: bigint, xyz: [number, number, number]): Point3D {
  return {
    point3DId,
    xyz,
    rgb: [255, 255, 255],
    error: 0,
    track: [],
  };
}

function expectVectorClose(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => {
    expect(actual[index]).toBeCloseTo(value);
  });
}
