import * as THREE from 'three';

export function cloneCameraForScreenshotRender(
  camera: THREE.Camera,
  aspect: number
): THREE.Camera {
  const clonedCamera = camera.clone();

  if (clonedCamera instanceof THREE.PerspectiveCamera) {
    clonedCamera.aspect = aspect;
    clonedCamera.updateProjectionMatrix();
  }

  return clonedCamera;
}
