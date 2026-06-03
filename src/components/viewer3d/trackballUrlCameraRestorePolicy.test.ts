import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { CameraViewState } from '../../store/types';
import {
  applyTrackballUrlCameraState,
  shouldApplyTrackballUrlCameraState,
  shouldStartTrackballUrlCameraRestore,
} from './trackballUrlCameraRestorePolicy';

describe('trackball URL camera restore policy', () => {
  it('starts restore only when reconstruction, hash, and restore state allow it', () => {
    expect(shouldStartTrackballUrlCameraRestore({
      hasRestoredFromUrl: false,
      hasReconstruction: true,
      hash: '#camera=1',
    })).toBe(true);
    expect(shouldStartTrackballUrlCameraRestore({
      hasRestoredFromUrl: true,
      hasReconstruction: true,
      hash: '#camera=1',
    })).toBe(false);
    expect(shouldStartTrackballUrlCameraRestore({
      hasRestoredFromUrl: false,
      hasReconstruction: false,
      hash: '#camera=1',
    })).toBe(false);
    expect(shouldStartTrackballUrlCameraRestore({
      hasRestoredFromUrl: false,
      hasReconstruction: true,
      hash: '',
    })).toBe(false);
  });

  it('applies decoded state only for live, unrestored effects with a state', () => {
    const state = buildCameraState();

    expect(shouldApplyTrackballUrlCameraState({
      disposed: false,
      hasRestoredFromUrl: false,
      state,
    })).toBe(true);
    expect(shouldApplyTrackballUrlCameraState({
      disposed: true,
      hasRestoredFromUrl: false,
      state,
    })).toBe(false);
    expect(shouldApplyTrackballUrlCameraState({
      disposed: false,
      hasRestoredFromUrl: true,
      state,
    })).toBe(false);
    expect(shouldApplyTrackballUrlCameraState({
      disposed: false,
      hasRestoredFromUrl: false,
      state: null,
    })).toBe(false);
  });

  it('applies decoded camera state to camera and trackball refs', () => {
    const state = buildCameraState();
    const camera = new THREE.PerspectiveCamera();
    const target = new THREE.Vector3();
    const cameraQuaternion = new THREE.Quaternion();
    const distance = { current: 1 };
    const targetDistance = { current: 2 };

    applyTrackballUrlCameraState({
      state,
      camera,
      target,
      cameraQuaternion,
      distance,
      targetDistance,
    });

    expect(target.toArray()).toEqual(state.target);
    expect(cameraQuaternion.toArray()).toEqual(state.quaternion);
    expect(distance.current).toBe(state.distance);
    expect(targetDistance.current).toBe(state.distance);
    expect(camera.position.toArray()).toEqual(state.position);
    expect(camera.quaternion.toArray()).toEqual(state.quaternion);
  });
});

function buildCameraState(): CameraViewState {
  return {
    position: [1, 2, 3],
    target: [4, 5, 6],
    quaternion: [0, 0.25, 0.5, 1],
    distance: 12,
  };
}
