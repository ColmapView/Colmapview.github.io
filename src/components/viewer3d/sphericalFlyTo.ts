import * as THREE from 'three';

/**
 * Distance from a spherical camera's photosphere CENTER at which the fly-to stops,
 * expressed as a multiple of the sphere's world radius.
 *
 * The photosphere is rendered THREE.FrontSide (outward faces), so a viewer AT the
 * center sees every face back-face-culled — nothing but the grid lines. The fly-to
 * must therefore stop OUTSIDE the sphere looking in.
 *
 * This constant is the single source of truth for that viewing distance: the auto-FOV
 * fit (getAutoAdjustedFov, spherical branch) frames the sphere from this exact distance
 * (planeDistance = SPHERICAL_FLYTO_DISTANCE_FACTOR * cameraScale), so the fit and the
 * fly-to always agree.
 *
 * At factor 2.5 the sphere subtends 2*asin(1/2.5) = 2*asin(0.4) ≈ 47.16°
 * (node: 2*Math.asin(0.4)*180/Math.PI = 47.1564), comfortably framed at fill 0.8
 * (landscape target FOV = 2*atan((2r/0.8)/(2*2.5r))*180/PI = 2*atan(0.5)*180/PI ≈ 53.13°).
 */
export const SPHERICAL_FLYTO_DISTANCE_FACTOR = 2.5;

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
 * Compute the outside-stop pose for flying to a spherical (360°) camera.
 *
 * The viewer stops at `SPHERICAL_FLYTO_DISTANCE_FACTOR * radius` from the sphere center,
 * along the direction from the center toward the CURRENT viewer position (so the fly-to
 * feels like "pull back to frame it" rather than teleporting to a fixed side). When the
 * current viewer sits at the center (degenerate), it falls back to world +Z.
 *
 * Pure and side-effect free: inputs are never mutated.
 */
export function computeSphericalFlyToPose(
  center: THREE.Vector3,
  currentViewerPos: THREE.Vector3,
  radius: number
): SphericalFlyToPose {
  const distance = SPHERICAL_FLYTO_DISTANCE_FACTOR * radius;

  const dir = currentViewerPos.clone().sub(center);
  if (dir.lengthSq() < MIN_APPROACH_DISTANCE * MIN_APPROACH_DISTANCE) {
    dir.copy(FALLBACK_DIRECTION);
  } else {
    dir.normalize();
  }

  const position = center.clone().add(dir.multiplyScalar(distance));
  return { position, lookAt: center.clone(), distance };
}
