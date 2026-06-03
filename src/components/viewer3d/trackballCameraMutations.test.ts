import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { moveCamera, setOrthographicZoom } from './trackballCameraMutations';

describe('trackball camera mutations', () => {
  it('moves a camera by an offset vector', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);

    moveCamera(camera, new THREE.Vector3(4, -1, 2));

    expect(camera.position.toArray()).toEqual([5, 1, 5]);
  });

  it('updates orthographic zoom and projection matrix', () => {
    const camera = new THREE.OrthographicCamera();
    const updateProjectionMatrix = vi.spyOn(camera, 'updateProjectionMatrix');

    setOrthographicZoom(camera, 2.5);

    expect(camera.zoom).toBe(2.5);
    expect(updateProjectionMatrix).toHaveBeenCalledOnce();
  });
});
