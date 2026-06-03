import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CAMERA, CONTROLS } from '../../theme';
import {
  applyTrackballModeTransition,
  applyTrackballViewVectors,
  clearTrackballMotion,
  createTrackballProjectionCamera,
  getTrackballInitialDistance,
  syncPerspectiveCameraFov,
} from './trackballCameraLifecyclePolicy';

describe('trackball camera lifecycle policy', () => {
  it('derives the initial orbit distance from scene radius and minimum distance', () => {
    expect(getTrackballInitialDistance(10)).toBeCloseTo(10 * CAMERA.initialDistanceMultiplier);
    expect(getTrackballInitialDistance(0)).toBe(CONTROLS.minDistance);
  });

  it('clears orbit and fly motion vectors in place', () => {
    const angularVelocity = { x: 1, y: -2 };
    const flyVelocity = new THREE.Vector3(3, 4, 5);

    clearTrackballMotion(angularVelocity, flyVelocity);

    expect(angularVelocity).toEqual({ x: 0, y: 0 });
    expect(flyVelocity.toArray()).toEqual([0, 0, 0]);
  });

  it('applies view vectors to camera position and quaternion', () => {
    const camera = new THREE.PerspectiveCamera();
    const target = new THREE.Vector3(1, 2, 3);
    const cameraQuaternion = new THREE.Quaternion();

    applyTrackballViewVectors(camera, target, cameraQuaternion, {
      offset: new THREE.Vector3(0, 0, 5),
      up: new THREE.Vector3(0, 1, 0),
    });

    expect(camera.position.toArray()).toEqual([1, 2, 8]);
    expect(camera.quaternion.equals(cameraQuaternion)).toBe(true);
  });

  it('syncs FOV only for perspective cameras', () => {
    const perspective = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    const perspectiveSpy = vi.spyOn(perspective, 'updateProjectionMatrix');
    const orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1);
    const orthographicSpy = vi.spyOn(orthographic, 'updateProjectionMatrix');

    syncPerspectiveCameraFov(perspective, 70);
    syncPerspectiveCameraFov(orthographic, 70);

    expect(perspective.fov).toBe(70);
    expect(perspectiveSpy).toHaveBeenCalledOnce();
    expect(orthographicSpy).not.toHaveBeenCalled();
  });

  it('creates projection cameras while preserving position and orientation', () => {
    const position = new THREE.Vector3(1, 2, 3);
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, 0.3));

    const perspective = createTrackballProjectionCamera({
      projection: 'perspective',
      cameraFov: 55,
      aspect: 2,
      distance: 10,
      position,
      quaternion,
    });
    const orthographic = createTrackballProjectionCamera({
      projection: 'orthographic',
      cameraFov: 55,
      aspect: 2,
      distance: 10,
      position,
      quaternion,
    });

    expect(perspective).toBeInstanceOf(THREE.PerspectiveCamera);
    if (!(perspective instanceof THREE.PerspectiveCamera)) {
      throw new Error('Expected a perspective camera');
    }
    expect(perspective.fov).toBe(55);
    expect(perspective.aspect).toBe(2);
    expect(perspective.position.equals(position)).toBe(true);
    expect(perspective.quaternion.equals(quaternion)).toBe(true);

    expect(orthographic).toBeInstanceOf(THREE.OrthographicCamera);
    if (!(orthographic instanceof THREE.OrthographicCamera)) {
      throw new Error('Expected an orthographic camera');
    }
    expect(orthographic.left).toBe(-20);
    expect(orthographic.right).toBe(20);
    expect(orthographic.top).toBe(10);
    expect(orthographic.bottom).toBe(-10);
    expect(orthographic.position.equals(position)).toBe(true);
    expect(orthographic.quaternion.equals(quaternion)).toBe(true);
  });

  it('applies mode transition side effects without changing fly distance state', () => {
    const camera = new THREE.PerspectiveCamera();
    const keysPressed = new Set(['w', 'shift']);
    const flyVelocity = new THREE.Vector3(1, 2, 3);
    const angularVelocity = { x: 4, y: 5 };
    const cameraQuaternion = new THREE.Quaternion();
    const target = new THREE.Vector3();

    const result = applyTrackballModeTransition({
      cameraMode: 'fly',
      camera,
      keysPressed,
      flyVelocity,
      target,
      cameraQuaternion,
      distance: 7,
      angularVelocity,
    });

    expect(result).toBeNull();
    expect(keysPressed.size).toBe(0);
    expect(flyVelocity.toArray()).toEqual([0, 0, 0]);
    expect(angularVelocity).toEqual({ x: 0, y: 0 });
    expect(cameraQuaternion.equals(camera.quaternion)).toBe(true);
  });

  it('applies orbit mode target and distance state from the current camera orientation', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 2, 3);
    camera.lookAt(new THREE.Vector3(1, 2, 0));

    const target = new THREE.Vector3();
    const cameraQuaternion = new THREE.Quaternion();
    const angularVelocity = { x: 4, y: 5 };

    const nextDistance = applyTrackballModeTransition({
      cameraMode: 'orbit',
      camera,
      keysPressed: new Set(['w']),
      flyVelocity: new THREE.Vector3(1, 1, 1),
      target,
      cameraQuaternion,
      distance: 6,
      angularVelocity,
    });

    expect(nextDistance).toBe(6);
    expect(target.toArray()).toEqual([1, 2, -3]);
    expect(cameraQuaternion.equals(camera.quaternion)).toBe(true);
    expect(angularVelocity).toEqual({ x: 0, y: 0 });
  });
});
