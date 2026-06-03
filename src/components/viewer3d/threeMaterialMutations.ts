import * as THREE from 'three';

const nextColor = new THREE.Color();

export function syncMaterialOpacity(material: THREE.Material, opacity: number): boolean {
  if (Object.is(material.opacity, opacity)) return false;

  material.opacity = opacity;
  return true;
}

export function syncMaterialColor(
  material: { color: THREE.Color },
  color: THREE.ColorRepresentation
): boolean {
  nextColor.set(color);
  if (material.color.equals(nextColor)) return false;

  material.color.copy(nextColor);
  return true;
}

export function disposeMaterial(material: THREE.Material | THREE.Material[]): number {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose());
    return material.length;
  }

  material.dispose();
  return 1;
}
