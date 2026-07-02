import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPhotosphereGeometry } from './photosphereGeometry';

/**
 * Pins the photosphere's UV mapping to the STOCK three.js SphereGeometry.
 *
 * History (2026-07-02 visual check, synthetic labeled dataset + real spherical
 * SfM reconstruction): the stock mapping under the COLMAP camera quaternion is
 * already world-aligned. A V-flip was tried — because the panorama LOOKED
 * upside down — and it inverted the true alignment (sky faced the floor
 * points). The upside-down impression was the fly-to re-orienting the viewer
 * to a wrong world-up, fixed in useTrackballFlyTo (roll preservation).
 * This test exists so nobody "fixes" the mapping again without re-running the
 * visual check in docs/spherical-visual-check.md.
 */
describe('createPhotosphereGeometry', () => {
  it('uses the stock three.js SphereGeometry UV mapping (no U or V flip)', () => {
    const geo = createPhotosphereGeometry();
    const stock = new THREE.SphereGeometry(1, 64, 32);
    const gUv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const sUv = stock.getAttribute('uv') as THREE.BufferAttribute;

    expect(gUv.count).toBe(sUv.count);
    for (let i = 0; i < gUv.count; i++) {
      expect(gUv.getX(i)).toBe(sUv.getX(i));
      expect(gUv.getY(i)).toBe(sUv.getY(i));
    }

    geo.dispose();
    stock.dispose();
  });
});
