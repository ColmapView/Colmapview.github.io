import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  getFloat32BufferAttribute,
  isFloat32BufferAttribute,
} from './threeBufferAttributes';

describe('Three buffer attribute guards', () => {
  it('returns Float32 buffer attributes from geometry', () => {
    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(new Float32Array([1, 2, 3]), 3);

    geometry.setAttribute('color', attribute);

    expect(getFloat32BufferAttribute(geometry, 'color')).toBe(attribute);
    expect(isFloat32BufferAttribute(attribute)).toBe(true);
  });

  it('rejects missing, interleaved, and non-Float32 attributes', () => {
    const geometry = new THREE.BufferGeometry();
    const uintAttribute = new THREE.BufferAttribute(new Uint16Array([1, 2, 3]), 3);
    const interleaved = new THREE.InterleavedBufferAttribute(
      new THREE.InterleavedBuffer(new Float32Array([1, 2, 3, 4]), 2),
      1,
      0
    );

    geometry.setAttribute('indexLike', uintAttribute);
    geometry.setAttribute('interleaved', interleaved);

    expect(getFloat32BufferAttribute(geometry, 'missing')).toBeNull();
    expect(getFloat32BufferAttribute(geometry, 'indexLike')).toBeNull();
    expect(getFloat32BufferAttribute(geometry, 'interleaved')).toBeNull();
    expect(isFloat32BufferAttribute(uintAttribute)).toBe(false);
    expect(isFloat32BufferAttribute(interleaved)).toBe(false);
  });
});
