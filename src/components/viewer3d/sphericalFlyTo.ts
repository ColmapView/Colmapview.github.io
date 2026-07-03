import * as THREE from 'three';

/**
 * Distance from a spherical camera's photosphere CENTER at which the fly-to stops,
 * expressed as a multiple of the sphere's world radius.
 *
 * The photosphere is designed to be viewed from OUTSIDE: the selected camera shows
 * a BackSide sphere (look through at the far inner wall) or, in (U) undistortion
 * mode, a portal disk cropped to the sphere's silhouette — both need an exterior
 * viewpoint, so the fly-to stops OUTSIDE the sphere looking in.
 *
 * This constant is the single source of truth for that OUTSIDE viewing distance
 * (position = center + factor * radius). It sets WHERE the fly-to stops; the FOV is NOT
 * auto-framed from it. (getAutoAdjustedFov used to re-frame the sphere from this exact
 * distance, but that clobbered the user's manual panorama-lens zoom every time they flew
 * between spherical cameras, so its spherical branch now returns null and the lens FOV
 * stays under manual control.)
 *
 * At factor 2.5 the sphere subtends 2*asin(1/2.5) = 2*asin(0.4) ≈ 47.16°
 * (node: 2*Math.asin(0.4)*180/Math.PI = 47.1564), comfortably framed inside the default
 * 60° lens FOV.
 */
export const SPHERICAL_FLYTO_DISTANCE_FACTOR = 2.5;

/**
 * Orbit radius (as a multiple of the sphere radius) when the (U) undistortion mode
 * steps INSIDE the panorama and flies to the capture center C.
 *
 * At the exact center the eye coincides with the camera that captured the panorama,
 * so every 3D point overlays its imagery at every depth and look direction with ZERO
 * parallax — the guarantee a single reprojection plane can never give off-center. The
 * orbit radius is a tiny epsilon rather than 0 for two reasons:
 *  - the trackball orbits the eye on a sphere of `distance` around the target; a 0
 *    radius is a degenerate pivot, whereas 0.02·r keeps look-around well-defined while
 *    the eye stays effectively at C (parallax ≤ 2% of the sphere radius — imperceptible);
 *  - wheel zoom is multiplicative on the orbit distance (`distance * zoomFactor`), so a
 *    non-zero start lets zoom-out grow the radius and progressively reintroduce parallax
 *    (the documented "zoom out while inside" behavior); 0 could never grow.
 * The 0.02 factor is well below the outside stop (2.5·r), so entering reads as diving to
 * the middle of the sphere, and exiting (U-off) pops back to the 2.5·r inspection stop.
 */
export const SPHERICAL_INSIDE_ORBIT_DISTANCE_FACTOR = 0.02;

/** Deterministic approach direction when the viewer coincides with the sphere center. */
const FALLBACK_DIRECTION = new THREE.Vector3(0, 0, 1); // world +Z

/** Below this |viewer - center| the approach direction is undefined; use the fallback. */
const MIN_APPROACH_DISTANCE = 1e-6;

export interface SphericalFlyToPose {
  /** Outside-the-sphere viewer position. */
  position: THREE.Vector3;
  /** Point the camera looks at / orbits around — the sphere center. */
  lookAt: THREE.Vector3;
  /** Distance from position to center (= orbit radius = factor * radius). */
  distance: number;
}

/**
 * Compute the fly-to pose for a spherical (360°) camera.
 *
 * The viewer stops at `distanceFactor * radius` from the sphere center, along the
 * direction from the center toward the CURRENT viewer position (so the fly-to feels
 * like "pull back to frame it" rather than teleporting to a fixed side). When the
 * current viewer sits at the center (degenerate), it falls back to world +Z.
 *
 * `distanceFactor` defaults to the OUTSIDE inspection stop (SPHERICAL_FLYTO_DISTANCE_FACTOR);
 * (U) undistortion passes SPHERICAL_INSIDE_ORBIT_DISTANCE_FACTOR to fly INSIDE to the
 * capture center instead. The direction/look-at/quaternion construction is identical for
 * both — only the orbit radius differs — so entering the panorama is the same motion as
 * the outside stop scaled down to an epsilon radius.
 *
 * Pure and side-effect free: inputs are never mutated.
 */
export function computeSphericalFlyToPose(
  center: THREE.Vector3,
  currentViewerPos: THREE.Vector3,
  radius: number,
  distanceFactor: number = SPHERICAL_FLYTO_DISTANCE_FACTOR
): SphericalFlyToPose {
  const distance = distanceFactor * radius;

  const dir = currentViewerPos.clone().sub(center);
  if (dir.lengthSq() < MIN_APPROACH_DISTANCE * MIN_APPROACH_DISTANCE) {
    dir.copy(FALLBACK_DIRECTION);
  } else {
    dir.normalize();
  }

  const position = center.clone().add(dir.multiplyScalar(distance));
  return { position, lookAt: center.clone(), distance };
}
