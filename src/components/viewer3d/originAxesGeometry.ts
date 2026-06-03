import * as THREE from 'three';

export function getAxisRotation(direction: [number, number, number]): THREE.Euler {
  const dir = new THREE.Vector3(...direction).normalize();
  const up = new THREE.Vector3(0, 1, 0);

  if (Math.abs(dir.y) > 0.999) {
    return new THREE.Euler(0, 0, dir.y > 0 ? 0 : Math.PI);
  }

  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(up, dir);
  return new THREE.Euler().setFromQuaternion(quaternion);
}

export function getAxisPosition(
  direction: [number, number, number],
  length: number
): [number, number, number] {
  return [
    direction[0] * length / 2,
    direction[1] * length / 2,
    direction[2] * length / 2,
  ];
}
