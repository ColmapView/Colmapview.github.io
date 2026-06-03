import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  hasCameraPoseMoved,
  shouldResumeFrustumTextureCache,
} from './useFrustumTextureCachePause';

describe('frustum texture cache pause policy', () => {
  it('detects meaningful camera pose movement', () => {
    const position = new THREE.Vector3(0, 0, 0);
    const quaternion = new THREE.Quaternion();

    expect(hasCameraPoseMoved(
      position,
      quaternion,
      new THREE.Vector3(0.005, 0, 0),
      quaternion
    )).toBe(false);

    expect(hasCameraPoseMoved(
      position,
      quaternion,
      new THREE.Vector3(0.02, 0, 0),
      quaternion
    )).toBe(true);

    expect(hasCameraPoseMoved(
      position,
      quaternion,
      position,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.002)
    )).toBe(true);
  });

  it('resumes texture loading only after the movement debounce elapses', () => {
    expect(shouldResumeFrustumTextureCache(false, 200, 0, 100)).toBe(false);
    expect(shouldResumeFrustumTextureCache(true, 50, 0, 100)).toBe(false);
    expect(shouldResumeFrustumTextureCache(true, 101, 0, 100)).toBe(true);
  });
});
