import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Sim3d } from '../types/sim3d';
import {
  computeDistanceScale,
  computeNormalAlignment,
  computeOriginTranslation,
  computePlaneAlignment,
} from './sim3dAlignment';

function applySim3d(sim3d: Sim3d, point: THREE.Vector3): THREE.Vector3 {
  return point
    .clone()
    .applyQuaternion(sim3d.rotation)
    .multiplyScalar(sim3d.scale)
    .add(sim3d.translation);
}

function triangleNormal(
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3
): THREE.Vector3 {
  return new THREE.Vector3()
    .subVectors(p2, p1)
    .cross(new THREE.Vector3().subVectors(p3, p1))
    .normalize();
}

function expectIdentity(sim3d: Sim3d): void {
  expect(sim3d.scale).toBe(1);
  expect(sim3d.translation.length()).toBeCloseTo(0);
  expect(sim3d.rotation.equals(new THREE.Quaternion())).toBe(true);
}

describe('sim3d alignment helpers', () => {
  it('translates a selected point to the origin', () => {
    const point = new THREE.Vector3(3.2, -1.7, 4.5);
    const sim3d = computeOriginTranslation(point);

    expect(applySim3d(sim3d, point).length()).toBeCloseTo(0);
  });

  it('scales two points about their midpoint to a target distance', () => {
    const point1 = new THREE.Vector3(1, 0, 0);
    const point2 = new THREE.Vector3(4, 4, 0);
    const midpoint = point1.clone().add(point2).multiplyScalar(0.5);
    const sim3d = computeDistanceScale(point1, point2, 10);

    const next1 = applySim3d(sim3d, point1);
    const next2 = applySim3d(sim3d, point2);

    expect(next1.distanceTo(next2)).toBeCloseTo(10);
    expect(applySim3d(sim3d, midpoint).distanceTo(midpoint)).toBeCloseTo(0);
    expect(sim3d.scale).toBeCloseTo(2);
  });

  it('returns identity for degenerate distance scaling and collinear alignment', () => {
    expectIdentity(computeDistanceScale(
      new THREE.Vector3(1, 1, 1),
      new THREE.Vector3(1, 1, 1),
      5
    ));

    expectIdentity(computeNormalAlignment(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(2, 0, 0)
    ));
  });

  it('aligns a triangle normal to targetUp while keeping the centroid fixed', () => {
    const point1 = new THREE.Vector3(0, 0, 0);
    const point2 = new THREE.Vector3(1, 0, 0);
    const point3 = new THREE.Vector3(0, 1, 1);
    const targetUp = new THREE.Vector3(0, 1, 0);
    const centroid = point1.clone().add(point2).add(point3).divideScalar(3);

    const sim3d = computeNormalAlignment(point1, point2, point3, false, targetUp);
    const next1 = applySim3d(sim3d, point1);
    const next2 = applySim3d(sim3d, point2);
    const next3 = applySim3d(sim3d, point3);

    expect(Math.abs(triangleNormal(next1, next2, next3).dot(targetUp))).toBeCloseTo(1);
    expect(applySim3d(sim3d, centroid).distanceTo(centroid)).toBeCloseTo(0);
  });

  it('flips a triangle normal before alignment when requested', () => {
    const point1 = new THREE.Vector3(0, 0, 0);
    const point2 = new THREE.Vector3(1, 0, 0);
    const point3 = new THREE.Vector3(0, 0, 1);
    const targetUp = new THREE.Vector3(0, 1, 0);

    const sim3d = computeNormalAlignment(point1, point2, point3, true, targetUp);
    const normal = triangleNormal(
      applySim3d(sim3d, point1),
      applySim3d(sim3d, point2),
      applySim3d(sim3d, point3)
    );

    expect(normal.dot(targetUp)).toBeCloseTo(-1);
  });

  it('aligns a detected plane to targetUp and moves it through the origin', () => {
    const normal: [number, number, number] = [0.3, 0.8, -0.2];
    const centroid: [number, number, number] = [1, 2, 3];
    const targetUp = new THREE.Vector3(0, 1, 0);
    const sim3d = computePlaneAlignment(normal, centroid, targetUp);

    const transformedNormal = new THREE.Vector3(...normal)
      .normalize()
      .applyQuaternion(sim3d.rotation);
    const transformedCentroid = applySim3d(sim3d, new THREE.Vector3(...centroid));

    expect(transformedNormal.dot(targetUp)).toBeCloseTo(1);
    expect(transformedCentroid.dot(targetUp)).toBeCloseTo(0);
  });
});
