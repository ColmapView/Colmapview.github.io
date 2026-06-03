import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  disposeMaterial,
  syncMaterialColor,
  syncMaterialOpacity,
} from './threeMaterialMutations';

describe('Three material mutations', () => {
  it('syncs opacity only when it changes', () => {
    const material = new THREE.MeshBasicMaterial({ opacity: 0.4 });

    expect(syncMaterialOpacity(material, 0.4)).toBe(false);
    expect(material.opacity).toBe(0.4);

    expect(syncMaterialOpacity(material, 0.8)).toBe(true);
    expect(material.opacity).toBe(0.8);
  });

  it('syncs colors from strings and Three colors', () => {
    const material = new THREE.LineBasicMaterial({ color: '#ff0000' });

    expect(syncMaterialColor(material, '#ff0000')).toBe(false);
    expect(syncMaterialColor(material, new THREE.Color('#00ff00'))).toBe(true);
    expect(material.color.getHexString()).toBe('00ff00');
  });

  it('disposes single materials and material arrays', () => {
    const single = new THREE.MeshBasicMaterial();
    const first = new THREE.MeshBasicMaterial();
    const second = new THREE.LineBasicMaterial();

    expect(disposeMaterial(single)).toBe(1);
    expect(disposeMaterial([first, second])).toBe(2);
  });
});
