import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  syncPointRaycasterThreshold,
  syncSceneBackgroundColor,
  syncSceneBackgroundTransparent,
} from './threeObjectMutations';

describe('Three object mutations', () => {
  it('syncs scene background colors only when they change', () => {
    const scene = new THREE.Scene();

    expect(syncSceneBackgroundColor(scene, '#112233')).toBe(true);
    expect(scene.background).toBeInstanceOf(THREE.Color);
    expect((scene.background as THREE.Color).getHexString()).toBe('112233');

    expect(syncSceneBackgroundColor(scene, '#112233')).toBe(false);
    expect(syncSceneBackgroundColor(scene, new THREE.Color('#ffffff'))).toBe(true);
    expect((scene.background as THREE.Color).getHexString()).toBe('ffffff');
  });

  it('replaces non-color backgrounds with a color', () => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Texture();

    expect(syncSceneBackgroundColor(scene, '#445566')).toBe(true);
    expect(scene.background).toBeInstanceOf(THREE.Color);
    expect((scene.background as THREE.Color).getHexString()).toBe('445566');
  });

  it('syncs transparent scene backgrounds only when needed', () => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#112233');

    expect(syncSceneBackgroundTransparent(scene)).toBe(true);
    expect(scene.background).toBeNull();
    expect(syncSceneBackgroundTransparent(scene)).toBe(false);
  });

  it('syncs point raycaster threshold only when it changes', () => {
    const raycaster = new THREE.Raycaster();

    expect(syncPointRaycasterThreshold(raycaster, 0.4)).toBe(true);
    expect(raycaster.params.Points.threshold).toBe(0.4);

    expect(syncPointRaycasterThreshold(raycaster, 0.4)).toBe(false);
    expect(syncPointRaycasterThreshold(raycaster, 0.8)).toBe(true);
    expect(raycaster.params.Points.threshold).toBe(0.8);
  });
});
