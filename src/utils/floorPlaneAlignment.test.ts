import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Plane } from './ransac';
import {
  createIdentityEuler,
  createSim3dFromEuler,
} from './sim3dTransforms';
import {
  computeFloorAlignmentTransform,
  detectFloorPlaneFromPositions,
  getFloorDetectionPositions,
  getFloorNormalFlippedForCameraDownSide,
  getFloorTargetUpVector,
} from './floorPlaneAlignment';
import { buildImage } from '../test/builders';

function expectVectorClose(actual: THREE.Vector3, expected: [number, number, number]): void {
  expect(actual.x).toBeCloseTo(expected[0]);
  expect(actual.y).toBeCloseTo(expected[1]);
  expect(actual.z).toBeCloseTo(expected[2]);
}

function applyEulerTransform(
  euler: ReturnType<typeof createIdentityEuler>,
  point: THREE.Vector3
): THREE.Vector3 {
  const sim3d = createSim3dFromEuler(euler);
  return point
    .clone()
    .applyQuaternion(sim3d.rotation)
    .multiplyScalar(sim3d.scale)
    .add(sim3d.translation);
}

describe('floor plane alignment', () => {
  it('maps target axes through the selected coordinate system', () => {
    expectVectorClose(getFloorTargetUpVector('threejs', 'Y'), [0, 1, 0]);
    expectVectorClose(getFloorTargetUpVector('blender', 'Y'), [0, 0, -1]);
    expectVectorClose(getFloorTargetUpVector('unreal', 'X'), [0, 0, -1]);
  });

  it('negates the target vector for semantically-down axes (COLMAP/OpenCV Y)', () => {
    // The oriented floor normal points toward the cameras (the up side of the
    // floor). Aligning it to +Y in a Y-DOWN convention pointed the convention's
    // down axis at the frustums (the reported bug); the target must be -Y so
    // that +Y (down) goes into the floor.
    expectVectorClose(getFloorTargetUpVector('colmap', 'Y'), [0, -1, 0]);
    expectVectorClose(getFloorTargetUpVector('opencv', 'Y'), [0, -1, 0]);
    // Non-down axes keep their raw direction.
    expectVectorClose(getFloorTargetUpVector('colmap', 'Z'), [0, 0, 1]); // Fwd
    expectVectorClose(getFloorTargetUpVector('colmap', 'X'), [1, 0, 0]); // Right
  });

  it('keeps identity detection positions stable and transforms non-identity positions', () => {
    const positions = new Float32Array([1, 2, 3]);

    expect(getFloorDetectionPositions(positions, createIdentityEuler())).toBe(positions);

    const transformed = getFloorDetectionPositions(positions, {
      ...createIdentityEuler(),
      scale: 2,
      translationX: 1,
      translationY: -1,
      translationZ: 0.5,
    });

    expect(Array.from(transformed)).toEqual([3, 3, 6.5]);
  });

  it('detects a floor plane and paired point distances from transformed positions', () => {
    const positions = new Float32Array([
      0, 0, 2,
      1, 0, 2,
      0, 1, 2,
      1, 1, 2,
    ]);

    const result = detectFloorPlaneFromPositions(positions, createIdentityEuler(), {
      distanceThreshold: 0.001,
      maxIterations: 1,
      sampleCount: 4,
    });

    expect(result.positions).toBe(positions);
    expect(result.plane?.inlierCount).toBe(4);
    expect(result.distances).toHaveLength(4);
    expect(Array.from(result.distances ?? []).every((distance) => Math.abs(distance) < 1e-6)).toBe(true);
  });

  it('composes a floor alignment transform that aligns the plane to target up', () => {
    const plane: Plane = {
      normal: [0, 0, 1],
      d: -2,
      centroid: [0, 0, 2],
      inlierCount: 4,
      radius: 1,
    };
    const targetUp = new THREE.Vector3(0, 1, 0);
    const aligned = computeFloorAlignmentTransform(
      plane,
      false,
      targetUp,
      createIdentityEuler()
    );
    const sim3d = createSim3dFromEuler(aligned);
    const transformedNormal = new THREE.Vector3(...plane.normal)
      .applyQuaternion(sim3d.rotation)
      .normalize();

    expect(transformedNormal.dot(targetUp)).toBeCloseTo(1);
    expect(applyEulerTransform(aligned, new THREE.Vector3(...plane.centroid)).dot(targetUp)).toBeCloseTo(0);
  });

  it('defaults the floor down side to the side with fewer cameras', () => {
    const plane: Plane = {
      normal: [0, 1, 0],
      d: 0,
      centroid: [0, 0, 0],
      inlierCount: 4,
      radius: 1,
    };
    const identity = createIdentityEuler();
    const cameraAt = (imageId: number, position: [number, number, number]) => buildImage({
      imageId,
      tvec: [-position[0], -position[1], -position[2]],
    });

    expect(getFloorNormalFlippedForCameraDownSide(plane, [
      cameraAt(1, [0, 2, 0]),
      cameraAt(2, [1, 3, 0]),
      cameraAt(3, [0, -2, 0]),
    ], identity)).toBe(false);

    expect(getFloorNormalFlippedForCameraDownSide(plane, [
      cameraAt(1, [0, 2, 0]),
      cameraAt(2, [1, -3, 0]),
      cameraAt(3, [0, -2, 0]),
    ], identity)).toBe(true);

    expect(getFloorNormalFlippedForCameraDownSide(plane, [
      cameraAt(1, [0, 2, 0]),
      cameraAt(2, [0, -2, 0]),
    ], identity)).toBe(false);

    expect(getFloorNormalFlippedForCameraDownSide({
      ...plane,
      d: -10,
      centroid: [0, 10, 0],
    }, [
      cameraAt(1, [0, 9, 0]),
      cameraAt(2, [0, 8, 0]),
      cameraAt(3, [0, 30, 0]),
    ], {
      ...identity,
      translationY: 10,
    })).toBe(false);
  });

  it('falls back to the point-cloud majority side when cameras tie or are absent', () => {
    // Without a decisive camera vote the raw RANSAC sign (random 3-point
    // winding) used to leak through, flipping the arrow between retries. The
    // scene bulk sits on the up side of a floor, so points break the tie the
    // same way cameras do. Positions are in the already-transformed frame
    // (the caller hands over detectFloorPlaneFromPositions's output).
    const plane: Plane = {
      normal: [0, 1, 0],
      d: 0,
      centroid: [0, 0, 0],
      inlierCount: 4,
      radius: 1,
    };
    const identity = createIdentityEuler();
    const cameraAt = (imageId: number, position: [number, number, number]) => buildImage({
      imageId,
      tvec: [-position[0], -position[1], -position[2]],
    });
    const pointsMostlyNegative = new Float32Array([
      0, -2, 0,
      1, -3, 0,
      0, -1, 2,
      0, 2, 0,
    ]);
    const pointsMostlyPositive = new Float32Array([
      0, 2, 0,
      1, 3, 0,
      0, 1, 2,
      0, -2, 0,
    ]);

    // No cameras at all: the point majority decides.
    expect(getFloorNormalFlippedForCameraDownSide(plane, [], identity, 1e-6, pointsMostlyNegative)).toBe(true);
    expect(getFloorNormalFlippedForCameraDownSide(plane, [], identity, 1e-6, pointsMostlyPositive)).toBe(false);

    // Cameras tie 1-1: the point majority decides.
    expect(getFloorNormalFlippedForCameraDownSide(plane, [
      cameraAt(1, [0, 2, 0]),
      cameraAt(2, [0, -2, 0]),
    ], identity, 1e-6, pointsMostlyNegative)).toBe(true);

    // A decisive camera vote is never overridden by points.
    expect(getFloorNormalFlippedForCameraDownSide(plane, [
      cameraAt(1, [0, 2, 0]),
      cameraAt(2, [1, 3, 0]),
      cameraAt(3, [0, -2, 0]),
    ], identity, 1e-6, pointsMostlyNegative)).toBe(false);

    // Points also tied (or absent): keep the raw sign, matching old behavior.
    expect(getFloorNormalFlippedForCameraDownSide(plane, [], identity, 1e-6, new Float32Array([
      0, 2, 0,
      0, -2, 0,
    ]))).toBe(false);
  });
});
