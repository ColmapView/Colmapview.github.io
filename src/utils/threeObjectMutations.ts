import * as THREE from 'three';

const nextBackgroundColor = new THREE.Color();

export function syncSceneBackgroundColor(
  scene: Pick<THREE.Scene, 'background'>,
  color: THREE.ColorRepresentation
): boolean {
  nextBackgroundColor.set(color);
  if (scene.background instanceof THREE.Color && scene.background.equals(nextBackgroundColor)) {
    return false;
  }

  scene.background = nextBackgroundColor.clone();
  return true;
}

export function syncPointRaycasterThreshold(
  raycaster: THREE.Raycaster,
  threshold: number
): boolean {
  if (Object.is(raycaster.params.Points.threshold, threshold)) {
    return false;
  }

  raycaster.params.Points.threshold = threshold;
  return true;
}
