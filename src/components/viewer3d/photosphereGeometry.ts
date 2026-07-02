import * as THREE from 'three';

/**
 * Unit sphere for equirectangular panoramas, following COLMAP's convention.
 *
 * Frame facts (all verified in code + live checks 2026-07-02):
 * - The photosphere mesh wears the RAW COLMAP cam-to-world quaternion
 *   (getImageWorldQuaternion has no axis flip), so mesh-local axes ARE the
 *   COLMAP camera axes: x right, y DOWN, z forward.
 * - Frustum textures load with flipY = false (frustumTextureCache), so
 *   uv.y = 0 is the image TOP row.
 * - COLMAP's equirect convention: image center column = camera forward (+z),
 *   u increases toward camera right (+x); the image's left/right edges (the
 *   seam) are camera-back (−z).
 *
 * A STOCK three.js SphereGeometry places the image-center column on its +X
 * meridian — a 90° azimuth rotation relative to COLMAP's center-forward
 * convention (this is what the live check exposed: sky correct, content
 * rotated). Constructing the sphere with phiStart = −π/2 rotates the
 * parameterization so texel u sits at azimuth φ = 2πu − π from +z:
 * u=0.5 → +z (forward), u=0.75 → +x (right), u=0/1 → −z (seam at back).
 * Derivation: three.js places vertex(u) at x = −cos(phiStart + 2πu)·sinθ,
 * z = sin(phiStart + 2πu)·sinθ; phiStart = −π/2 gives x = sin(2πu−π)·sinθ,
 * z = cos(2πu−π)·sinθ. The vertical axis is untouched (uv.y = 1 − θ/π; with
 * flipY=false the image top lands at the −y pole = camera up) — it was
 * correct all along and stays byte-identical.
 *
 * DO NOT "fix" orientation by flipping V or mirroring U: the vertical axis is
 * validated, and the azimuth error was a pure rotation (det +1), not a mirror.
 * directionToEquirectUV (sphericalUndistortion.ts) is the exact inverse of
 * this mapping; its unit test cross-validates against every vertex of this
 * geometry, which also guarantees the photosphere and the (U) undistorted
 * billboard display identically per direction.
 */
export function createPhotosphereGeometry(): THREE.SphereGeometry {
  return new THREE.SphereGeometry(1, 64, 32, -Math.PI / 2);
}
