import * as THREE from 'three';
import type { RootState } from '@react-three/fiber';
import { CAMERA, CONTROLS } from '../../theme';
import type { CameraMode, CameraProjection } from '../../store/types';
import type { ViewVectors } from './trackballControlsViewModel';

export interface AngularVelocity {
  x: number;
  y: number;
}

export function getTrackballInitialDistance(radius: number): number {
  return Math.max(CONTROLS.minDistance, radius * CAMERA.initialDistanceMultiplier);
}

export function clearTrackballMotion(
  angularVelocity: AngularVelocity,
  flyVelocity: THREE.Vector3
): void {
  angularVelocity.x = 0;
  angularVelocity.y = 0;
  flyVelocity.set(0, 0, 0);
}

export function applyTrackballViewVectors(
  camera: THREE.Camera,
  target: THREE.Vector3,
  cameraQuaternion: THREE.Quaternion,
  { offset, up }: ViewVectors
): void {
  const cameraPosition = target.clone().add(offset);
  const lookMatrix = new THREE.Matrix4();
  lookMatrix.lookAt(cameraPosition, target, up);
  cameraQuaternion.setFromRotationMatrix(lookMatrix);

  camera.position.copy(cameraPosition);
  camera.quaternion.copy(cameraQuaternion);
}

export function syncPerspectiveCameraFov(camera: THREE.Camera, fov: number): void {
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

export interface CreateTrackballProjectionCameraOptions {
  projection: CameraProjection;
  cameraFov: number;
  aspect: number;
  distance: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export function createTrackballProjectionCamera({
  projection,
  cameraFov,
  aspect,
  distance,
  position,
  quaternion,
}: CreateTrackballProjectionCameraOptions): RootState['camera'] {
  const camera = projection === 'orthographic'
    ? createOrthographicTrackballCamera(distance, aspect)
    : new THREE.PerspectiveCamera(cameraFov, aspect, CAMERA.nearPlane, CAMERA.farPlane);

  camera.position.copy(position);
  camera.quaternion.copy(quaternion);
  return camera;
}

function createOrthographicTrackballCamera(distance: number, aspect: number): THREE.OrthographicCamera {
  const orthoFar = CAMERA.farPlane * 10;
  return new THREE.OrthographicCamera(
    -distance * aspect,
    distance * aspect,
    distance,
    -distance,
    -orthoFar,
    orthoFar
  );
}

export interface TrackballModeTransitionOptions {
  cameraMode: CameraMode;
  camera: THREE.Camera;
  keysPressed: Set<string>;
  flyVelocity: THREE.Vector3;
  target: THREE.Vector3;
  cameraQuaternion: THREE.Quaternion;
  distance: number;
  angularVelocity: AngularVelocity;
}

export function applyTrackballModeTransition({
  cameraMode,
  camera,
  keysPressed,
  flyVelocity,
  target,
  cameraQuaternion,
  distance,
  angularVelocity,
}: TrackballModeTransitionOptions): number | null {
  if (cameraMode === 'fly') {
    cameraQuaternion.copy(camera.quaternion);
    flyVelocity.set(0, 0, 0);
    keysPressed.clear();
    angularVelocity.x = 0;
    angularVelocity.y = 0;
    return null;
  }

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const nextDistance = Math.max(CONTROLS.minDistance, distance);
  target.copy(camera.position).add(forward.multiplyScalar(nextDistance));
  cameraQuaternion.copy(camera.quaternion);
  angularVelocity.x = 0;
  angularVelocity.y = 0;
  return nextDistance;
}
