import * as THREE from 'three';
import type { AutoRotateMode, HorizonLockMode } from '../../store/types';

export interface XYVelocity {
  x: number;
  y: number;
}

export interface OrbitDistanceStep {
  distance: number;
  changed: boolean;
}

export function getCappedFrameDeltaMs(now: number, lastFrameTime: number, maxDeltaMs: number): number {
  return Math.min(now - lastFrameTime, maxDeltaMs);
}

export function getFrameDamping(baseDamping: number, frameDeltaMs: number, frameTimeMs: number): number {
  return Math.pow(baseDamping, frameDeltaMs / frameTimeMs);
}

export function shouldApplyAngularVelocity(velocity: XYVelocity, minVelocity: number): boolean {
  return Math.abs(velocity.x) > minVelocity || Math.abs(velocity.y) > minVelocity;
}

export function getOrbitDistanceStep(
  currentDistance: number,
  targetDistance: number,
  threshold: number,
  transitionFactor: number
): OrbitDistanceStep {
  if (Math.abs(targetDistance - currentDistance) <= threshold) {
    return { distance: currentDistance, changed: false };
  }

  return {
    distance: currentDistance + (targetDistance - currentDistance) * transitionFactor,
    changed: true,
  };
}

export function getAutoRotateDelta(mode: AutoRotateMode, speed: number, frameDeltaMs: number): number {
  if (mode === 'off') return 0;

  const direction = mode === 'cw' ? 1 : -1;
  return direction * speed * (frameDeltaMs / 1000);
}

/**
 * Above this |forward · worldUp| the interpolated look direction is (anti)parallel to the
 * world up, so a lookAt basis is ill-defined; the frame falls back to the raw slerp.
 */
const GOTO_LEVEL_DEGENERATE_DOT = 1 - 1e-6;

const GOTO_FORWARD = new THREE.Vector3();
const GOTO_ORIGIN = new THREE.Vector3(0, 0, 0);
const GOTO_LOOK_MATRIX = new THREE.Matrix4();

/**
 * Orientation of the go-to (fly-to) camera for one interpolated frame.
 *
 * When horizon lock is OFF this is a plain shortest-arc slerp between the start and end
 * orientations — byte-identical to the previous behavior.
 *
 * When horizon lock is ON (or 'flip'), a raw slerp between two horizon-level orientations
 * takes the shortest 3D arc, which rolls the horizon mid-flight and re-levels only at the
 * end (a visible wobble). To keep every frame level we slerp only to derive the interpolated
 * LOOK direction, then rebuild the orientation with a lookAt against the effective world up,
 * forcing the roll to zero throughout. 'flip' is handled exactly like 'on': the caller passes
 * the already-flipped effective up in `worldUp` (see TrackballControls' worldUpVec), so the
 * goto matches how interactive orbiting levels the frame.
 *
 * Degenerate guard: if the interpolated look direction is (anti)parallel to `worldUp`, the
 * lookAt basis is undefined, so that single frame falls back to the raw slerp.
 *
 * `out` is mutated in place and returned (no per-frame allocation). `out` must NOT alias
 * `endQuaternion` — slerpQuaternions overwrites `out` before reading its second argument.
 * (The sole caller passes the camera quaternion with cloned endpoints, which is safe.)
 */
export function computeGotoFrameQuaternion(
  out: THREE.Quaternion,
  startQuaternion: THREE.Quaternion,
  endQuaternion: THREE.Quaternion,
  easedProgress: number,
  horizonLock: HorizonLockMode,
  worldUp: THREE.Vector3
): THREE.Quaternion {
  out.slerpQuaternions(startQuaternion, endQuaternion, easedProgress);
  if (horizonLock === 'off') {
    return out;
  }

  const forward = GOTO_FORWARD.set(0, 0, -1).applyQuaternion(out);
  if (Math.abs(forward.dot(worldUp)) >= GOTO_LEVEL_DEGENERATE_DOT) {
    return out; // degenerate lookAt — keep the raw slerp for this frame
  }

  GOTO_LOOK_MATRIX.lookAt(GOTO_ORIGIN, forward, worldUp);
  return out.setFromRotationMatrix(GOTO_LOOK_MATRIX);
}
