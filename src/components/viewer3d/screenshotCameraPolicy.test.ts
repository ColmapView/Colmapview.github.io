import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cloneCameraForScreenshotRender } from './screenshotCameraPolicy';

describe('screenshot camera policy', () => {
  it('clones perspective cameras and updates the clone aspect', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(1, 2, 3);
    const originalProjection = camera.projectionMatrix.clone();

    const clone = cloneCameraForScreenshotRender(camera, 16 / 9);

    expect(clone).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(clone).not.toBe(camera);
    expect(clone.position.toArray()).toEqual([1, 2, 3]);
    expect(camera.aspect).toBe(1);
    expect(camera.projectionMatrix.equals(originalProjection)).toBe(true);

    if (clone instanceof THREE.PerspectiveCamera) {
      expect(clone.aspect).toBe(16 / 9);
      expect(clone.projectionMatrix.equals(originalProjection)).toBe(false);
    }
  });

  it('clones non-perspective cameras without adding perspective-only state', () => {
    const camera = new THREE.OrthographicCamera(-2, 2, 1, -1, 0.1, 100);

    const clone = cloneCameraForScreenshotRender(camera, 2);

    expect(clone).toBeInstanceOf(THREE.OrthographicCamera);
    expect(clone).not.toBe(camera);
    expect('aspect' in clone).toBe(false);
  });
});
