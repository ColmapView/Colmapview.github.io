import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getAxisPosition, getAxisRotation } from './originAxesGeometry';

describe('origin axes geometry helpers', () => {
  it('places axis cylinders at the midpoint of the directed axis', () => {
    expect(getAxisPosition([1, 0, 0], 10)).toEqual([5, 0, 0]);
    expect(getAxisPosition([0, -1, 0], 8)).toEqual([0, -4, 0]);
    expect(getAxisPosition([0, 0, 1], 6)).toEqual([0, 0, 3]);
  });

  it('rotates the default Y-axis cylinder onto target axes', () => {
    expectRotatedUpToEqual([0, 1, 0], [0, 1, 0]);
    expectRotatedUpToEqual([0, -1, 0], [0, -1, 0]);
    expectRotatedUpToEqual([1, 0, 0], [1, 0, 0]);
    expectRotatedUpToEqual([0, 0, 1], [0, 0, 1]);
  });
});

function expectRotatedUpToEqual(
  direction: [number, number, number],
  expected: [number, number, number]
) {
  const rotated = new THREE.Vector3(0, 1, 0).applyEuler(getAxisRotation(direction));
  expect(rotated.x).toBeCloseTo(expected[0], 6);
  expect(rotated.y).toBeCloseTo(expected[1], 6);
  expect(rotated.z).toBeCloseTo(expected[2], 6);
}
