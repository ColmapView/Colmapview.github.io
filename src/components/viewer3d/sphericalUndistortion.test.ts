import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  computeSphericalBillboardLayout,
  directionToEquirectUV,
  SPHERICAL_UNDISTORT_FRAGMENT_SHADER,
} from './sphericalUndistortion';
import { createPhotosphereGeometry } from './photosphereGeometry';

describe('directionToEquirectUV', () => {
  it('exactly inverts the photosphere geometry mapping (every vertex) — proves sphere and billboard stay in sync', () => {
    // Both surfaces must encode the same COLMAP panorama convention: the
    // billboard samples by direction, the photosphere by vertex UV. Sweep
    // every sphere vertex and assert the formula reproduces its UV.
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

  it('the GLSL fragment shader carries the identical formula', () => {
    // Cheap structural pin: both terms of the mapping appear verbatim in the
    // shader (numerical CPU<->GPU parity is impossible in jsdom; the shared
    // formula + this pin keep the two from drifting apart silently).
    expect(SPHERICAL_UNDISTORT_FRAGMENT_SHADER).toContain('0.5 + atan(d.x, d.z) / (2.0 * PI)');
    expect(SPHERICAL_UNDISTORT_FRAGMENT_SHADER).toContain('1.0 - acos(clamp(d.y, -1.0, 1.0)) / PI');
  });
});

describe('computeSphericalBillboardLayout', () => {
  it('fills the sphere silhouette (hand-derived value)', () => {
    // D = 2.5r, r = 2: d = r = 2; s = (5 + 2)·tan(asin(2/5))
    //   tan(asin(0.4)) = 0.4/sqrt(1 - 0.16) = 0.4/0.91652 = 0.436436
    //   s = 7 · 0.436436 = 3.055050 (recomputed independently)
    const layout = computeSphericalBillboardLayout(5, 2);
    expect(layout).not.toBeNull();
    expect(layout!.d).toBeCloseTo(2, 12);
    expect(layout!.s).toBeCloseTo(3.05505, 4);
  });

  it('scales with viewer distance (closer viewer -> wider silhouette disk angle)', () => {
    const near = computeSphericalBillboardLayout(3, 2)!;
    const far = computeSphericalBillboardLayout(50, 2)!;
    // Angular half-size of the disk from the viewer = atan(s / (D + d)) = asin(r/D):
    expect(Math.atan(near.s / (3 + near.d))).toBeCloseTo(Math.asin(2 / 3), 12);
    expect(Math.atan(far.s / (50 + far.d))).toBeCloseTo(Math.asin(2 / 50), 12);
  });

  it('returns null when the viewer is at or inside the sphere', () => {
    expect(computeSphericalBillboardLayout(2, 2)).toBeNull(); // on the surface
    expect(computeSphericalBillboardLayout(1, 2)).toBeNull(); // inside
    expect(computeSphericalBillboardLayout(2.05, 2)).toBeNull(); // within the guard band
    expect(computeSphericalBillboardLayout(0, 2)).toBeNull();
    expect(computeSphericalBillboardLayout(5, 0)).toBeNull(); // degenerate radius
  });
});
