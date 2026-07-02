import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  composeSphericalHitTargetMatrix,
  getSphericalHitTargetMeshKey,
  resolveSphericalHitTargetImageId,
} from './sphericalHitTargetPolicy';

describe('spherical hit-target policy', () => {
  describe('resolveSphericalHitTargetImageId', () => {
    const frustums = [
      { image: { imageId: 10 } },
      { image: { imageId: 20 } },
      { image: { imageId: 30 } },
    ];

    it('maps a raycast instanceId to the frustum imageId at that array index', () => {
      expect(resolveSphericalHitTargetImageId(frustums, 0)).toBe(10);
      expect(resolveSphericalHitTargetImageId(frustums, 1)).toBe(20);
      expect(resolveSphericalHitTargetImageId(frustums, 2)).toBe(30);
    });

    it('returns null for an undefined instanceId (raycast miss)', () => {
      expect(resolveSphericalHitTargetImageId(frustums, undefined)).toBeNull();
    });

    it('returns null for an out-of-range instanceId', () => {
      expect(resolveSphericalHitTargetImageId(frustums, 99)).toBeNull();
      expect(resolveSphericalHitTargetImageId([], 0)).toBeNull();
    });
  });

  describe('composeSphericalHitTargetMatrix', () => {
    it('sizes the unit sphere via a uniform cameraScale and preserves position', () => {
      const matrix = composeSphericalHitTargetMatrix(
        new THREE.Matrix4(),
        new THREE.Vector3(),
        new THREE.Vector3(1, 2, 3),
        new THREE.Quaternion(),
        0.25
      );
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      matrix.decompose(position, quaternion, scale);

      expect(position.toArray()).toEqual([1, 2, 3]);
      expect(scale.x).toBeCloseTo(0.25);
      expect(scale.y).toBeCloseTo(0.25);
      expect(scale.z).toBeCloseTo(0.25);
    });

    it('re-composing with a new cameraScale changes scale only, not position (slider tick)', () => {
      const scaleVec = new THREE.Vector3();
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3(4, 5, 6);
      const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1);

      composeSphericalHitTargetMatrix(matrix, scaleVec, position, quaternion, 1);
      composeSphericalHitTargetMatrix(matrix, scaleVec, position, quaternion, 2);

      const outPos = new THREE.Vector3();
      const outQuat = new THREE.Quaternion();
      const outScale = new THREE.Vector3();
      matrix.decompose(outPos, outQuat, outScale);

      expect(outPos.toArray()).toEqual([4, 5, 6]);
      expect(outScale.x).toBeCloseTo(2);
      expect(outScale.y).toBeCloseTo(2);
      expect(outScale.z).toBeCloseTo(2);
    });
  });

  describe('getSphericalHitTargetMeshKey', () => {
    it('builds a stable key from instance count and first image id', () => {
      expect(getSphericalHitTargetMeshKey(3, 42)).toBe('3-42');
    });

    it('falls back to 0 for a missing first image id', () => {
      expect(getSphericalHitTargetMeshKey(3, null)).toBe('3-0');
      expect(getSphericalHitTargetMeshKey(0, undefined)).toBe('0-0');
    });
  });
});
