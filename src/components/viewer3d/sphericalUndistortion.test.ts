import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { directionToEquirectUV } from './sphericalUndistortion';
import { createPhotosphereGeometry } from './photosphereGeometry';

describe('directionToEquirectUV', () => {
  it('exactly inverts the photosphere geometry mapping (every vertex) — proves sphere and billboard stay in sync', () => {
    // Both surfaces must encode the same COLMAP panorama convention: a
    // direction-sampled surface samples by direction, the photosphere by vertex
    // UV. Sweep every sphere vertex and assert the formula reproduces its UV.
    const geo = createPhotosphereGeometry();
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;

    let checked = 0;
    for (let i = 0; i < pos.count; i++) {
      const dir = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      // Poles: azimuth is degenerate (sinθ = 0) — u is arbitrary there.
      if (Math.abs(dir.y) > 0.999999) continue;

      const { u, v } = directionToEquirectUV(dir);
      // u is periodic: the seam column exists twice (u=0 and u=1).
      const du = Math.abs(u - uv.getX(i));
      expect(Math.min(du, 1 - du)).toBeLessThan(1e-6);
      expect(v).toBeCloseTo(uv.getY(i), 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(1500); // sanity: we actually swept the sphere
    geo.dispose();
  });

  it('maps the COLMAP camera axes to the panorama columns/rows', () => {
    // COLMAP camera frame: x right, y DOWN, z forward. COLMAP equirect:
    // image center = forward; u increases toward camera right; seam at back.
    // flipY=false: uv.y=0 = image top = camera up (−y).
    expect(directionToEquirectUV({ x: 0, y: 0, z: 1 }).u).toBeCloseTo(0.5, 9); // forward = center
    expect(directionToEquirectUV({ x: 1, y: 0, z: 0 }).u).toBeCloseTo(0.75, 9); // right
    expect(directionToEquirectUV({ x: -1, y: 0, z: 0 }).u).toBeCloseTo(0.25, 9); // left
    expect(directionToEquirectUV({ x: 0, y: 0, z: 1 }).v).toBeCloseTo(0.5, 9); // equator
    expect(directionToEquirectUV({ x: 0, y: -1, z: 0 }).v).toBeCloseTo(0, 9); // up = image top
    expect(directionToEquirectUV({ x: 0, y: 1, z: 0 }).v).toBeCloseTo(1, 9); // down = image bottom
    // Seam at camera back; wrap keeps u in [0, 1).
    const seam = directionToEquirectUV({ x: 0, y: 0, z: -1 });
    expect(seam.u).toBeGreaterThanOrEqual(0);
    expect(seam.u).toBeLessThan(1e-9);
  });
});
