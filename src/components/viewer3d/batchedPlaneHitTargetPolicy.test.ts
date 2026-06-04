import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  composePlaneHitTargetMatrix,
  getBatchedPlaneHitTargetMeshKey,
  getPlaneHitTargetScale,
} from './batchedPlaneHitTargetPolicy';

describe('batched plane hit-target policy', () => {
  it('derives desktop, touch, and selected hit-target scale', () => {
    const planeSize = { width: 2, height: 3 };

    expect(getPlaneHitTargetScale({
      planeSize,
      isSelected: false,
      touchMode: false,
      touchHitTargetScale: 1.5,
    })).toEqual([2, 3, 1]);
    expect(getPlaneHitTargetScale({
      planeSize,
      isSelected: false,
      touchMode: true,
      touchHitTargetScale: 1.5,
    })).toEqual([3, 4.5, 1]);
    expect(getPlaneHitTargetScale({
      planeSize,
      isSelected: true,
      touchMode: true,
      touchHitTargetScale: 1.5,
    })).toEqual([0, 0, 0]);
  });

  it('composes an identity-orientation matrix at the image-plane depth', () => {
    const matrix = composePlaneHitTargetMatrix({
      matrix: new THREE.Matrix4(),
      targetPosition: new THREE.Vector3(),
      targetForward: new THREE.Vector3(),
      targetScale: new THREE.Vector3(),
      frustumPosition: new THREE.Vector3(1, 2, 3),
      frustumQuaternion: new THREE.Quaternion(),
      planeSize: { width: 2, height: 3, depth: 4, offsetX: 0, offsetY: 0 },
      isSelected: false,
      touchMode: false,
    });
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    matrix.decompose(position, quaternion, scale);

    expect(position.toArray()).toEqual([1, 2, 7]);
    expect(scale.toArray()).toEqual([2, 3, 1]);
  });

  it('uses frustum orientation for the depth offset', () => {
    const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const matrix = composePlaneHitTargetMatrix({
      matrix: new THREE.Matrix4(),
      targetPosition: new THREE.Vector3(),
      targetForward: new THREE.Vector3(),
      targetScale: new THREE.Vector3(),
      frustumPosition: new THREE.Vector3(1, 2, 3),
      frustumQuaternion: quaternion,
      planeSize: { width: 2, height: 3, depth: 4, offsetX: 0, offsetY: 0 },
      isSelected: false,
      touchMode: false,
    });
    const position = new THREE.Vector3();
    const actualQuaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    matrix.decompose(position, actualQuaternion, scale);

    expect(position.x).toBeCloseTo(5);
    expect(position.y).toBeCloseTo(2);
    expect(position.z).toBeCloseTo(3);
    expect(actualQuaternion.angleTo(quaternion)).toBeCloseTo(0);
  });

  it('includes principal-point offsets in the image-plane center', () => {
    const matrix = composePlaneHitTargetMatrix({
      matrix: new THREE.Matrix4(),
      targetPosition: new THREE.Vector3(),
      targetForward: new THREE.Vector3(),
      targetScale: new THREE.Vector3(),
      frustumPosition: new THREE.Vector3(1, 2, 3),
      frustumQuaternion: new THREE.Quaternion(),
      planeSize: { width: 2, height: 3, depth: 4, offsetX: -0.25, offsetY: 0.5 },
      isSelected: false,
      touchMode: false,
    });
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    matrix.decompose(position, quaternion, scale);

    expect(position.toArray()).toEqual([0.75, 2.5, 7]);
    expect(scale.toArray()).toEqual([2, 3, 1]);
  });

  it('builds stable mesh keys from count and first image id', () => {
    expect(getBatchedPlaneHitTargetMeshKey(3, 42)).toBe('3-42');
    expect(getBatchedPlaneHitTargetMeshKey(3, null)).toBe('3-0');
  });
});
