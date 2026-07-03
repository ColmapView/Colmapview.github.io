import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPhotosphereGeometry } from './photosphereGeometry';
import { getPhotosphereRenderConfig } from './photosphereRenderConfig';

/**
 * Pins the photosphere geometry to COLMAP's panorama convention (2026-07-02
 * live checks): the mesh wears the RAW COLMAP cam-to-world quaternion (x
 * right, y DOWN, z forward) and textures load with flipY=false, so:
 * - image center column (uv.x = 0.5) must face camera FORWARD (+z),
 * - uv.x = 0.75 must face camera RIGHT (+x),
 * - the seam (uv.x ∈ {0,1}) must face camera BACK (−z),
 * - the image TOP row (uv.y = 0) must be at the camera-UP pole (−y).
 * A stock SphereGeometry gets the azimuth wrong by 90° (image center at +x);
 * the phiStart = −π/2 construction fixes exactly that. The vertical axis was
 * always correct — do not touch V.
 */
describe('createPhotosphereGeometry', () => {
  function equatorDirectionAt(targetU: number): THREE.Vector3 {
    const geo = createPhotosphereGeometry();
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    let best: THREE.Vector3 | null = null;
    let bestScore = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const du = Math.abs(uv.getX(i) - targetU);
      const dv = Math.abs(uv.getY(i) - 0.5); // equator
      const score = du * 10 + dv;
      if (score < bestScore) {
        bestScore = score;
        best = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      }
    }
    geo.dispose();
    return best!;
  }

  it('places the image center column (u=0.5) at camera forward (+z)', () => {
    const dir = equatorDirectionAt(0.5);
    expect(dir.z).toBeGreaterThan(0.99);
    expect(Math.abs(dir.x)).toBeLessThan(0.1);
  });

  it('places u=0.75 at camera right (+x)', () => {
    const dir = equatorDirectionAt(0.75);
    expect(dir.x).toBeGreaterThan(0.99);
  });

  it('places the seam (u=0) at camera back (−z)', () => {
    const dir = equatorDirectionAt(0);
    expect(dir.z).toBeLessThan(-0.99);
  });

  it('keeps the vertical axis: image top row (uv.y=0) at the camera-up (−y) pole', () => {
    const geo = createPhotosphereGeometry();
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    let yAtMinV = 1;
    let minV = Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (uv.getY(i) < minV) {
        minV = uv.getY(i);
        yAtMinV = pos.getY(i);
      }
    }
    expect(minV).toBe(0);
    expect(yAtMinV).toBeLessThan(0); // −y pole = camera up (COLMAP y is down)
    geo.dispose();
  });
});

describe('getPhotosphereRenderConfig', () => {
  it('renders a normal opaque, depth-tested sphere when NOT a background (U off, outside view)', () => {
    // U off: the inspection sphere is viewed from outside and must occlude/depth-test
    // like normal geometry.
    expect(getPhotosphereRenderConfig(false)).toEqual({
      renderOrder: 0,
      depthWrite: true,
      depthTest: true,
    });
  });

  it('renders a non-occluding background when true (U on, viewer inside the panorama)', () => {
    // U on: the viewer sits at the capture center INSIDE the sphere, so the photosphere
    // must never hide the points/scene — draw first (renderOrder −1) and ignore depth.
    expect(getPhotosphereRenderConfig(true)).toEqual({
      renderOrder: -1,
      depthWrite: false,
      depthTest: false,
    });
  });
});
