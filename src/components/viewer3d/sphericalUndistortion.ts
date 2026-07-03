/**
 * Undistorted (perspective) view of a spherical camera — math + shaders.
 *
 * Principle ("like regular cameras"): the equirect panorama is the complete
 * ray field captured at the camera center C with orientation R (the COLMAP
 * cam-to-world rotation). Its undistorted image is what a virtual
 * distortion-free PINHOLE camera placed at C would render. A billboard disk
 * that displays, at each surface point p, the panorama color for the direction
 * R⁻¹·normalize(p − C) — the ray from C THROUGH p — reproduces perspective
 * alignment: a world point W on the ray C→W shows W's color precisely where
 * that ray pierces the disk. Alignment is exact through the capture center C
 * (the same contract as the pinhole image planes, which also align exactly only
 * through their projection center).
 *
 * DEPTH ANCHORING (the fix): a center-ray sample is exact only for content AT
 * the disk's plane depth. We place the disk at depth d = L*, the median distance
 * from C to the 3D points the image OBSERVES (group space, computed by
 * sphericalAnchorDepth.ts), so the highlighted reconstruction points overlay the
 * imagery from ANY viewpoint and do NOT drift while orbiting. Nearer content
 * renders in front of the disk via the depth buffer — desirable, and matching
 * the pinhole image-plane behavior. The disk is cropped to a circle that exactly
 * fills the sphere's silhouette from the current viewer distance.
 *
 * HISTORY / why not viewer-ray: an earlier version sampled by the VIEWER ray
 * (normalize(p − eye), three's built-in eye position). That is exact only for
 * content at infinity; a point at finite distance L misaligned by up to
 * (sphereRadius)/L radians in a viewer-DEPENDENT direction, so highlighted points
 * visibly slid across the imagery as the user orbited. Anchoring the disk at L*
 * and sampling through C fixes that for content near L*. The world-space center
 * uniform (uCenterWorld) reintroduced below existed in earlier history — see
 * `git log -p -- sphericalUndistortion.ts`; this is a clean reintroduction.
 *
 * RESIDUAL ERROR: for a point at distance L, with viewer baseline b = |eye − C|,
 * the angular overlay error scales as b·|1/L − 1/L*| — zero at L = L*, and always
 * zero at the exact viewpoint C. A smaller second-order term (∝ cosφ, φ the angle
 * off the viewer axis) survives because one flat plane cannot match a spherical
 * ray shell off-axis; the median RADIAL distance is the single anchor we pick.
 */
import * as THREE from 'three';

/**
 * Hide the billboard when the viewer is this close to (or inside) the sphere —
 * the silhouette geometry degenerates as D → r.
 */
const MIN_VIEWER_DISTANCE_FACTOR = 1.05;

export interface SphericalBillboardLayout {
  /** Plane distance beyond the sphere center along the away-from-viewer axis. */
  d: number;
  /** Crop-disk radius: fills the sphere silhouette seen from distance D. */
  s: number;
}

/**
 * Disk size/placement so the billboard exactly fills the sphere's silhouette,
 * with the plane depth supplied by the caller (the depth-anchor L*).
 *
 * Viewer at distance D from C sees the sphere (radius r) under half-angle
 * asin(r/D). The plane sits at distance planeDepth beyond C, i.e.
 * (D + planeDepth) from the viewer, so the silhouette-filling disk radius is
 *   s = (D + planeDepth)·tan(asin(r/D)).
 * (Hand-check: D = 5, r = 2, planeDepth = 8 ⇒ s = 13·tan(asin(0.4))
 *   = 13·0.436436 = 5.673665.)
 *
 * planeDepth generalizes the old fixed d = r; callers pass L* (already clamped
 * to ≥ 2r by computeMedianObservedPointDepth so the disk stays outside the
 * sphere). Returns null when the viewer is inside/at the sphere (no silhouette).
 */
export function computeSphericalBillboardLayout(
  viewerDistance: number,
  radius: number,
  planeDepth: number
): SphericalBillboardLayout | null {
  if (!(radius > 0) || !(viewerDistance > radius * MIN_VIEWER_DISTANCE_FACTOR)) {
    return null;
  }
  const d = planeDepth;
  const halfAngle = Math.asin(radius / viewerDistance);
  const s = (viewerDistance + d) * Math.tan(halfAngle);
  return { d, s };
}

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
 * sphere vertex, which also proves photosphere and billboard display
 * identically per direction.
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

export const SPHERICAL_UNDISTORT_VERTEX_SHADER = /* glsl */ `
uniform float uS;
varying vec3 vWorldPos;

void main() {
  // Unit CircleGeometry scaled to the crop radius in-shader (mesh scale stays 1;
  // the mesh sets frustumCulled=false since its bounding sphere ignores uS).
  vec4 worldPos = modelMatrix * vec4(position.xy * uS, 0.0, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const SPHERICAL_UNDISTORT_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uMap;
uniform mat3 uCamRotInv; // world -> panorama-camera rotation (same frame the photosphere mesh uses)
uniform vec3 uCenterWorld; // world-space capture center C = parent.localToWorld(frustum.position)
varying vec3 vWorldPos;

#define PI 3.141592653589793

void main() {
  // CENTER-RAY sampling: show the panorama content along the ray from the CAPTURE
  // CENTER C (uCenterWorld) through this fragment — a virtual pinhole at C. With
  // the disk anchored at the observed points' median depth L*, points near L*
  // overlay the point cloud from ANY viewpoint (no drift while orbiting), and
  // nearer content renders in front of the disk via the depth buffer. (Sampling
  // by the viewer eye instead is exact only at infinity and slides finite-depth
  // content across the image as you orbit — the bug this replaced.)
  vec3 d = uCamRotInv * normalize(vWorldPos - uCenterWorld);

  // COLMAP panorama convention: image center = camera forward (+z), u toward
  // camera right (+x). MUST stay identical to directionToEquirectUV in
  // sphericalUndistortion.ts (cross-validated against the photosphere geometry).
  float u = 0.5 + atan(d.x, d.z) / (2.0 * PI);
  u = fract(u);
  float v = 1.0 - acos(clamp(d.y, -1.0, 1.0)) / PI;

  // NOTE: fract() makes u discontinuous across the panorama seam; with a
  // clamped shared texture a hairline column can appear when the view crosses
  // the seam (BACK direction). Accepted for v1 (the sphere had the same seam).
  vec4 texColor = texture2D(uMap, vec2(u, v));
  gl_FragColor = vec4(texColor.rgb, 1.0);
  #include <colorspace_fragment>
}
`;

/** Build the ShaderMaterial for the undistorted spherical billboard. */
export function createSphericalUndistortMaterial(texture: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uCamRotInv: { value: new THREE.Matrix3() },
      uCenterWorld: { value: new THREE.Vector3() },
      uS: { value: 1 },
    },
    vertexShader: SPHERICAL_UNDISTORT_VERTEX_SHADER,
    fragmentShader: SPHERICAL_UNDISTORT_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}
