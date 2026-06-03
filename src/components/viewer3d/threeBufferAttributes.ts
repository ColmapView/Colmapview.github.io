import * as THREE from 'three';

export type Float32BufferAttribute = THREE.BufferAttribute & {
  array: Float32Array;
};

export function isFloat32BufferAttribute(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined
): attribute is Float32BufferAttribute {
  return attribute instanceof THREE.BufferAttribute && attribute.array instanceof Float32Array;
}

export function getFloat32BufferAttribute(
  geometry: THREE.BufferGeometry,
  name: string
): Float32BufferAttribute | null {
  const attribute = geometry.getAttribute(name);
  return isFloat32BufferAttribute(attribute) ? attribute : null;
}
