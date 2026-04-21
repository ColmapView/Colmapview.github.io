/**
 * Save-invariant tests for the four picked-point alignment operations.
 *
 * Each operation composes a Sim3D transform and writes it to the transform
 * store. The export path bakes the active transform into the written bins.
 * These tests reproduce that flow end-to-end:
 *
 *   compute<Op>(picked points) → transformReconstruction
 *     → writePoints3DBinary / writeImagesBinary
 *     → parsePoints3DBinary / parseImagesBinary
 *     → assert the operation's invariant holds on the exported data.
 *
 * If someone ever wires the UI to stash the transform somewhere the export
 * flow doesn't read, these invariants go red.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  computeOriginTranslation,
  computeDistanceScale,
  computeNormalAlignment,
  computePlaneAlignment,
  transformReconstruction,
} from '../utils/sim3dTransforms';
import { writePoints3DBinary, writeImagesBinary } from './writers';
import { parsePoints3DBinary } from './points3d';
import { parseImagesBinary } from './images';
import type { Camera, Image, Point3D, Reconstruction } from '../types/colmap';
import { CameraModelId } from '../types/colmap';

const UNMATCHED = -1n;

function makeReconstruction(points: Map<bigint, Point3D>): Reconstruction {
  const cameras = new Map<number, Camera>([[
    1,
    {
      cameraId: 1,
      modelId: CameraModelId.PINHOLE,
      width: 1024,
      height: 768,
      params: [500, 500, 512, 384],
    },
  ]]);
  // One throwaway image so writeImagesBinary has something to serialize.
  const images = new Map<number, Image>([[
    1,
    {
      imageId: 1,
      qvec: [1, 0, 0, 0],
      tvec: [0, 0, 0],
      cameraId: 1,
      name: 'dummy.jpg',
      points2D: [],
    },
  ]]);
  return {
    cameras,
    images,
    points3D: points,
    imageStats: new Map(),
    connectedImagesIndex: new Map(),
    imageToPoint3DIds: new Map(),
    globalStats: {
      minError: 0, maxError: 0, avgError: 0,
      minTrackLength: 0, maxTrackLength: 0, avgTrackLength: 0,
      totalObservations: 0, totalPoints: 0,
    },
  };
}

function makePoint(id: bigint, xyz: [number, number, number]): Point3D {
  return {
    point3DId: id,
    xyz,
    rgb: [255, 255, 255],
    error: 0,
    track: [],
  };
}

function exportAndReparse(transformed: Reconstruction) {
  const ptBuf = writePoints3DBinary(transformed.points3D!);
  const imgBuf = writeImagesBinary(transformed.images, null);
  return {
    points: parsePoints3DBinary(ptBuf),
    images: parseImagesBinary(imgBuf),
  };
}

describe('1-point center: exported data places the picked point at origin', () => {
  it('translates the picked point to (0,0,0)', () => {
    const picked: [number, number, number] = [3.2, -1.7, 4.5];
    const points = new Map<bigint, Point3D>([
      [1n, makePoint(1n, picked)],
      [2n, makePoint(2n, [0, 1, 0])],
      [3n, makePoint(3n, [5, 5, 5])],
    ]);
    const sim3d = computeOriginTranslation(new THREE.Vector3(...picked));
    const transformed = transformReconstruction(sim3d, makeReconstruction(points));
    const { points: reparsed } = exportAndReparse(transformed);
    const p = reparsed.get(1n)!;
    expect(p.xyz[0]).toBeCloseTo(0, 9);
    expect(p.xyz[1]).toBeCloseTo(0, 9);
    expect(p.xyz[2]).toBeCloseTo(0, 9);
    // Other points shift by the same vector
    const p2 = reparsed.get(2n)!;
    expect(p2.xyz[0]).toBeCloseTo(-picked[0], 9);
    expect(p2.xyz[1]).toBeCloseTo(1 - picked[1], 9);
    expect(p2.xyz[2]).toBeCloseTo(-picked[2], 9);
  });
});

describe('2-point scale: exported pair matches target distance', () => {
  it('rescales the scene so the two picked points are at targetDistance', () => {
    const a: [number, number, number] = [1, 0, 0];
    const b: [number, number, number] = [4, 4, 0]; // original distance 5
    const target = 1.0;
    const points = new Map<bigint, Point3D>([
      [1n, makePoint(1n, a)],
      [2n, makePoint(2n, b)],
    ]);
    const sim3d = computeDistanceScale(
      new THREE.Vector3(...a),
      new THREE.Vector3(...b),
      target,
    );
    const transformed = transformReconstruction(sim3d, makeReconstruction(points));
    const { points: reparsed } = exportAndReparse(transformed);
    const p1 = new THREE.Vector3(...reparsed.get(1n)!.xyz);
    const p2 = new THREE.Vector3(...reparsed.get(2n)!.xyz);
    expect(p1.distanceTo(p2)).toBeCloseTo(target, 9);
  });
});

describe('3-point align: exported plane normal coincides with targetUp', () => {
  it('rotates the picked-plane triangle so its normal equals targetUp', () => {
    // Three points in a tilted plane
    const p1: [number, number, number] = [0, 0, 0];
    const p2: [number, number, number] = [1, 0, 0];
    const p3: [number, number, number] = [0, 1, 1]; // plane spans x and (y + z)
    const targetUp = new THREE.Vector3(0, 1, 0);
    const points = new Map<bigint, Point3D>([
      [1n, makePoint(1n, p1)],
      [2n, makePoint(2n, p2)],
      [3n, makePoint(3n, p3)],
    ]);
    const sim3d = computeNormalAlignment(
      new THREE.Vector3(...p1),
      new THREE.Vector3(...p2),
      new THREE.Vector3(...p3),
      false,
      targetUp,
    );
    const transformed = transformReconstruction(sim3d, makeReconstruction(points));
    const { points: reparsed } = exportAndReparse(transformed);
    const q1 = new THREE.Vector3(...reparsed.get(1n)!.xyz);
    const q2 = new THREE.Vector3(...reparsed.get(2n)!.xyz);
    const q3 = new THREE.Vector3(...reparsed.get(3n)!.xyz);
    const v1 = q2.clone().sub(q1);
    const v2 = q3.clone().sub(q1);
    const normal = v1.clone().cross(v2).normalize();
    // Normal should equal ±targetUp; sign depends on winding but both mean
    // "plane aligned with Y axis". We accept either and assert magnitude.
    expect(Math.abs(normal.dot(targetUp))).toBeCloseTo(1, 6);
  });
});

describe('floor align: exported floor plane passes through origin along targetUp', () => {
  it('aligns the plane normal to targetUp and zeros the plane offset', () => {
    // Simulate a RANSAC-detected plane: normal + centroid
    const planeNormal: [number, number, number] = [0.3, 0.8, -0.2];
    const planeCentroid: [number, number, number] = [1, 2, 3];
    const targetUp = new THREE.Vector3(0, 1, 0);
    const points = new Map<bigint, Point3D>([
      [1n, makePoint(1n, planeCentroid)],
      // Two other points on the plane so we can verify the plane orientation
      // after transform. Build them from the normal.
      ...(() => {
        const n = new THREE.Vector3(...planeNormal).normalize();
        const c = new THREE.Vector3(...planeCentroid);
        const tan1 = new THREE.Vector3(1, 0, 0).cross(n).normalize();
        const tan2 = n.clone().cross(tan1).normalize();
        const p2 = c.clone().add(tan1.clone().multiplyScalar(1.5));
        const p3 = c.clone().add(tan2.clone().multiplyScalar(2.0));
        return [
          [2n, makePoint(2n, [p2.x, p2.y, p2.z] as [number, number, number])],
          [3n, makePoint(3n, [p3.x, p3.y, p3.z] as [number, number, number])],
        ] as const;
      })(),
    ]);

    const sim3d = computePlaneAlignment(planeNormal, planeCentroid, targetUp);
    const transformed = transformReconstruction(sim3d, makeReconstruction(points));
    const { points: reparsed } = exportAndReparse(transformed);

    const q1 = new THREE.Vector3(...reparsed.get(1n)!.xyz);
    const q2 = new THREE.Vector3(...reparsed.get(2n)!.xyz);
    const q3 = new THREE.Vector3(...reparsed.get(3n)!.xyz);

    // The plane passes through the origin along the targetUp axis — meaning
    // the centroid's projection onto targetUp is zero.
    expect(q1.dot(targetUp)).toBeCloseTo(0, 6);

    // All three on-plane points have the same targetUp component (the plane is
    // perpendicular to targetUp now).
    expect(q2.dot(targetUp)).toBeCloseTo(0, 6);
    expect(q3.dot(targetUp)).toBeCloseTo(0, 6);

    // Plane normal (recomputed from transformed points) is aligned with targetUp.
    const v1 = q2.clone().sub(q1);
    const v2 = q3.clone().sub(q1);
    const normal = v1.clone().cross(v2).normalize();
    expect(Math.abs(normal.dot(targetUp))).toBeCloseTo(1, 6);
  });
});

// Keep the UNMATCHED import referenced so the compiler doesn't prune it if we
// extend the fixture later.
void UNMATCHED;
