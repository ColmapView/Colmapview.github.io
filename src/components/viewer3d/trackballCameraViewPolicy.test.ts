import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildCameraViewState,
  buildCameraViewStateHash,
  getResetViewVectors,
  getViewDirectionVectors,
} from './trackballCameraViewPolicy';

describe('trackball camera view policy', () => {
  it('builds stable serializable camera view state and hashes', () => {
    const state = buildCameraViewState(
      new THREE.Vector3(1, 2, 3),
      new THREE.Quaternion(0, 0.25, 0.5, 1),
      new THREE.Vector3(4, 5, 6),
      7
    );

    expect(state).toEqual({
      position: [1, 2, 3],
      quaternion: [0, 0.25, 0.5, 1],
      target: [4, 5, 6],
      distance: 7,
    });
    expect(buildCameraViewStateHash(state)).toBe('1,2,3,4,5,6,0,0.25,0.5,1');
  });

  it('builds reset view vectors for free and horizon-locked modes', () => {
    const free = getResetViewVectors(10, false, new THREE.Vector3(0, 1, 0));
    const locked = getResetViewVectors(10, true, new THREE.Vector3(0, 1, 0));

    expect(free.offset.length()).toBeCloseTo(10);
    expect(free.up.toArray()).toEqual([
      expect.closeTo(0.5),
      expect.closeTo(-Math.SQRT1_2),
      expect.closeTo(0.5),
    ]);
    expect(locked.offset.length()).toBeCloseTo(10);
    expect(locked.up.toArray()).toEqual([0, 1, 0]);
  });

  it('builds axis view vectors without sharing mutable constants', () => {
    const first = getViewDirectionVectors('x', 4, false, new THREE.Vector3(0, 1, 0));
    const second = getViewDirectionVectors('x', 4, false, new THREE.Vector3(0, 1, 0));
    const lockedY = getViewDirectionVectors('y', 3, true, new THREE.Vector3(0, 0, 1));

    expect(first.offset.toArray()).toEqual([4, 0, 0]);
    expect(first.up.toArray()).toEqual([0, 1, 0]);
    expect(first.offset).not.toBe(second.offset);
    expect(first.up).not.toBe(second.up);
    expect(lockedY.offset.toArray()).toEqual([0, 0, 3]);
    expect(lockedY.up.toArray()).toEqual([0, 0, -1]);
  });
});
