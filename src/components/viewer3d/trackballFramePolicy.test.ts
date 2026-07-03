import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  computeGotoFrameQuaternion,
  getAutoRotateDelta,
  getCappedFrameDeltaMs,
  getFrameDamping,
  getOrbitDistanceStep,
  shouldApplyAngularVelocity,
} from './trackballFramePolicy';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** A horizon-level orientation looking along (yaw, pitch), built via lookAt so its roll is 0. */
function levelQuat(yawDeg: number, pitchDeg: number, up: THREE.Vector3 = WORLD_UP): THREE.Quaternion {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const forward = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  ).normalize();
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), forward, up);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

describe('trackball frame policy', () => {
  it('caps frame deltas before deriving damping', () => {
    expect(getCappedFrameDeltaMs(250, 100, 100)).toBe(100);
    expect(getCappedFrameDeltaMs(125, 100, 100)).toBe(25);
    expect(getFrameDamping(0.9, 16, 16)).toBeCloseTo(0.9);
    expect(getFrameDamping(0.9, 32, 16)).toBeCloseTo(0.81);
  });

  it('applies angular velocity only above the configured threshold', () => {
    expect(shouldApplyAngularVelocity({ x: 0.02, y: 0 }, 0.01)).toBe(true);
    expect(shouldApplyAngularVelocity({ x: 0, y: -0.02 }, 0.01)).toBe(true);
    expect(shouldApplyAngularVelocity({ x: 0.01, y: -0.01 }, 0.01)).toBe(false);
  });

  it('steps orbit distance only when the target distance is meaningfully different', () => {
    expect(getOrbitDistanceStep(10, 10.00005, 0.0001, 0.2)).toEqual({
      distance: 10,
      changed: false,
    });
    expect(getOrbitDistanceStep(10, 20, 0.0001, 0.2)).toEqual({
      distance: 12,
      changed: true,
    });
  });

  it('derives auto-rotate direction from mode and frame time', () => {
    expect(getAutoRotateDelta('off', 2, 500)).toBe(0);
    expect(getAutoRotateDelta('cw', 2, 500)).toBe(1);
    expect(getAutoRotateDelta('ccw', 2, 500)).toBe(-1);
  });
});

describe('computeGotoFrameQuaternion', () => {
  it('keeps the horizon level at the animation midpoint when locked (right stays perpendicular to world up)', () => {
    const start = levelQuat(0, 20);
    const end = levelQuat(120, -30);

    // Premise of the bug: a raw slerp between two level orientations with different
    // pitches TILTS the horizon mid-flight — its midpoint right is NOT perpendicular to up.
    const rawMid = new THREE.Quaternion().slerpQuaternions(start, end, 0.5);
    const rawRight = new THREE.Vector3(1, 0, 0).applyQuaternion(rawMid);
    expect(Math.abs(rawRight.dot(WORLD_UP))).toBeGreaterThan(1e-3);

    // Locked: the leveled midpoint keeps the camera right perpendicular to world up.
    const q = computeGotoFrameQuaternion(new THREE.Quaternion(), start, end, 0.5, 'on', WORLD_UP);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    expect(Math.abs(right.dot(WORLD_UP))).toBeLessThan(1e-6);
  });

  it('is a byte-identical raw slerp when horizon lock is off', () => {
    const start = levelQuat(0, 20);
    const end = levelQuat(120, -30);
    const ref = new THREE.Quaternion().slerpQuaternions(start, end, 0.37);
    const q = computeGotoFrameQuaternion(new THREE.Quaternion(), start, end, 0.37, 'off', WORLD_UP);
    expect(q.x).toBe(ref.x);
    expect(q.y).toBe(ref.y);
    expect(q.z).toBe(ref.z);
    expect(q.w).toBe(ref.w);
  });

  it("treats 'flip' like 'on' but levels against the flipped effective up", () => {
    const flippedUp = WORLD_UP.clone().negate();
    const start = levelQuat(0, 20, flippedUp);
    const end = levelQuat(120, -30, flippedUp);

    const q = computeGotoFrameQuaternion(new THREE.Quaternion(), start, end, 0.5, 'flip', flippedUp);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    // Level w.r.t. the flipped up (right stays perpendicular to up regardless of its sign)...
    expect(Math.abs(right.dot(flippedUp))).toBeLessThan(1e-6);
    // ...and the camera up follows the flipped effective up.
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    expect(camUp.dot(flippedUp)).toBeGreaterThan(0);
  });

  it('falls back to raw slerp when the interpolated look direction is parallel to world up', () => {
    // A frame whose forward points straight up (parallel to world up) => lookAt is degenerate.
    const straightUp = new THREE.Matrix4().lookAt(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0), // forward = world up
      new THREE.Vector3(0, 0, 1)
    );
    const degenerate = new THREE.Quaternion().setFromRotationMatrix(straightUp);
    const ref = new THREE.Quaternion().slerpQuaternions(degenerate, degenerate, 0.5);
    const q = computeGotoFrameQuaternion(new THREE.Quaternion(), degenerate, degenerate, 0.5, 'on', WORLD_UP);
    expect(q.angleTo(ref)).toBeLessThan(1e-9);
  });
});
