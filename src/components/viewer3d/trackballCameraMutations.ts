import * as THREE from 'three';

export function moveCamera(camera: THREE.Camera, offset: THREE.Vector3): void {
  camera.position.add(offset);
}

export function setOrthographicZoom(camera: THREE.OrthographicCamera, zoom: number): void {
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
}
