/**
 * Spherical-camera equirect convention: direction → panorama texture UV.
 *
 * This module pins COLMAP's equirectangular panorama convention as the exact inverse
 * of the photosphere mesh's UV mapping (createPhotosphereGeometry). It is the single
 * hard-won source of truth for how a look direction maps to a column/row of the
 * panorama image; the unit test cross-validates it against every vertex of the
 * photosphere geometry, which also proves the sphere and any direction-sampled
 * surface display identically per direction. The convention doc comment below is
 * load-bearing — do not "simplify" the formula without re-running the visual check.
 */

/**
 * Direction (in the photosphere MESH frame = raw COLMAP camera frame:
 * x right, y DOWN, z forward) → equirect texture UV, following COLMAP's
 * panorama convention.
 *
 * Anchors (code-read + live checks 2026-07-02):
 * - The mesh wears the RAW cam-to-world quaternion (no axis flip) and the
 *   texture loads with flipY = false, so uv.y = 0 is the image TOP row.
 * - VERTICAL: `v = 1 − acos(d.y)/π` — algebraically identical to COLMAP's
 *   latitude convention under flipY=false (acos(y) = π/2 + lat with
 *   lat = atan2(−y, hypot(x,z))), and validated live (sky/ground correct
 *   through every iteration).
 * - AZIMUTH: COLMAP puts the image center at camera FORWARD (+z), u
 *   increasing toward camera RIGHT (+x): `u = 0.5 + atan2(d.x, d.z)/2π`.
 *   (The stock three.js sphere put image-center at +X — a 90° rotation that
 *   the live check exposed; an earlier "mirror" hypothesis was wrong.)
 *
 * Hand pins (mesh-frame d): (0,0,1) → u=0.5 (image center / camera forward);
 * (1,0,0) → u=0.75 (camera right); (−1,0,0) → u=0.25; (0,0,−1) → u=0 (seam
 * at camera back). This function is the exact inverse of
 * createPhotosphereGeometry's mapping — the unit test cross-validates every
 * sphere vertex, which also proves photosphere and any direction-sampled
 * surface display identically per direction.
 */
export function directionToEquirectUV(dir: { x: number; y: number; z: number }): {
  u: number;
  v: number;
} {
  let u = 0.5 + Math.atan2(dir.x, dir.z) / (2 * Math.PI);
  u -= Math.floor(u); // wrap to [0, 1)
  const v = 1 - Math.acos(Math.min(1, Math.max(-1, dir.y))) / Math.PI;
  return { u, v };
}
