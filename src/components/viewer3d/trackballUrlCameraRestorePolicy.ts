import * as THREE from 'three';
import type { CameraViewState } from '../../store/types';

interface MutableValue<T> {
  current: T;
}

interface StartRestoreRequest {
  hasRestoredFromUrl: boolean;
  hasReconstruction: boolean;
  hash: string;
}

interface ApplyRestoreRequest {
  disposed: boolean;
  hasRestoredFromUrl: boolean;
  state: CameraViewState | null;
}

interface ApplyUrlCameraStateRequest {
  state: CameraViewState;
  camera: THREE.Camera;
  target: THREE.Vector3;
  cameraQuaternion: THREE.Quaternion;
  distance: MutableValue<number>;
  targetDistance: MutableValue<number>;
}

export function shouldStartTrackballUrlCameraRestore({
  hasRestoredFromUrl,
  hasReconstruction,
  hash,
}: StartRestoreRequest): boolean {
  return !hasRestoredFromUrl && hasReconstruction && hash !== '';
}

export function shouldApplyTrackballUrlCameraState({
  disposed,
  hasRestoredFromUrl,
  state,
}: ApplyRestoreRequest): boolean {
  return !disposed && !hasRestoredFromUrl && state !== null;
}

export function applyTrackballUrlCameraState({
  state,
  camera,
  target,
  cameraQuaternion,
  distance,
  targetDistance,
}: ApplyUrlCameraStateRequest): void {
  target.set(...state.target);
  cameraQuaternion.set(...state.quaternion);
  distance.current = state.distance;
  targetDistance.current = state.distance;
  camera.position.set(...state.position);
  camera.quaternion.set(...state.quaternion);
}
