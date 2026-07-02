import * as THREE from 'three';

/**
 * Unit sphere for equirectangular panoramas — STOCK three.js UV mapping.
 *
 * Orientation was verified against the labeled synthetic dataset AND a real
 * spherical SfM reconstruction (2026-07-02): with the COLMAP camera quaternion
 * applied, the stock mapping already aligns the panorama with the world
 * (pano sky toward world up, azimuth bands toward the matching points).
 *
 * DO NOT flip V here. That was tried and it inverted the true alignment
 * (pano sky ended up facing the floor points). The "upside down" impression
 * that motivated it came from the fly-to re-orienting the VIEWER to a wrong
 * world-up (COLMAP gravity is often +Y = three.js down) — fixed in
 * useTrackballFlyTo by preserving the viewer's current roll instead.
 *
 * Note on the outside view: a world-aligned panorama viewed from OUTSIDE a
 * FrontSide sphere necessarily reads mirrored (you are looking at the back of
 * the image). That is inherent, accepted by design (alignment-to-points wins);
 * BackSide (looking through at the far inner wall) reads normally.
 */
export function createPhotosphereGeometry(): THREE.SphereGeometry {
  return new THREE.SphereGeometry(1, 64, 32);
}
