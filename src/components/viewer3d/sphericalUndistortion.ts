/**
 * Undistorted (perspective) view of a spherical camera — math + shaders.
 *
 * Principle ("like regular cameras"): the equirect panorama is the complete
 * ray field captured at the camera center C with orientation R (the COLMAP
 * cam-to-world rotation). Its undistorted image is what a virtual
 * distortion-free PINHOLE camera placed at C would render. A billboard plane
 * that displays, at each surface point p, the panorama color for direction
 * R⁻¹·normalize(p − C) reproduces exact perspective alignment: every world
 * point W lies on the ray C→W, which pierces the plane precisely where W's
 * color is shown. (Alignment is exact through the capture center C — the same
 * contract as the pinhole image planes, which also align exactly only through
 * their projection center; off-axis viewer parallax is inherent without
 * depth.)
 *
 * The virtual pinhole aims along the current viewing axis (viewer → C), so
 * the visible slice tracks the view while orbiting; the plane sits on the far
 * side of C at depth d = r (tangent to the sphere's far pole) and is cropped
 * to a disk that exactly fills the sphere's silhouette from the current
 * viewer distance.
 */
import * as THREE from 'three';

/** Plane depth beyond the sphere center, as a multiple of the sphere radius. */
export const SPHERICAL_UNDISTORT_PLANE_DEPTH_FACTOR = 1.0;

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
 * Disk size/placement so the billboard exactly fills the sphere's silhouette.
 *
 * Viewer at distance D from C sees the sphere (radius r) under half-angle
 * asin(r/D). The plane sits at distance d beyond C, i.e. (D + d) from the
 * viewer, so the silhouette-filling disk radius is s = (D + d)·tan(asin(r/D)).
 * (Hand-check: D = 2.5r, d = r ⇒ s = 3.5r·tan(asin(0.4)) = 3.5r·0.43644 ≈ 1.5275r.)
 *
 * Returns null when the viewer is inside/at the sphere (no silhouette).
 */
export function computeSphericalBillboardLayout(
  viewerDistance: number,
  radius: number
): SphericalBillboardLayout | null {
  if (!(radius > 0) || !(viewerDistance > radius * MIN_VIEWER_DISTANCE_FACTOR)) {
    return null;
  }
  const d = SPHERICAL_UNDISTORT_PLANE_DEPTH_FACTOR * radius;
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
varying vec3 vWorldPos;

#define PI 3.141592653589793

void main() {
  // VIEWER-RAY (portal) sampling: show the panorama content along the ray
  // from the viewer's eye through this fragment ("what you would see if the
  // panorama were painted on the world"). This is the overlay-correct choice:
  // distant content aligns with the point cloud from ANY viewpoint (exact at
  // infinity; error for content at distance L is bounded by the small
  // viewer-to-center baseline over L — same contract as looking through a
  // window). A capture-center projection was tried first and is NOT
  // overlay-correct from outside the sphere: it compresses a wide panorama
  // slice into the silhouette (crystal-ball look) and never converges to the
  // points, because its only exact viewpoint is the center itself — which is
  // inside the (culled) sphere. cameraPosition is three.js's built-in eye
  // uniform.
  vec3 d = uCamRotInv * normalize(vWorldPos - cameraPosition);

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
      uS: { value: 1 },
    },
    vertexShader: SPHERICAL_UNDISTORT_VERTEX_SHADER,
    fragmentShader: SPHERICAL_UNDISTORT_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}
