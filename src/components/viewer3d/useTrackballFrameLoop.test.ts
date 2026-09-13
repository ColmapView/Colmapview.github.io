import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CONTROLS } from '../../theme';
import { useTrackballFrameLoop } from './useTrackballFrameLoop';
import type { TrackballAnimationTarget } from './useTrackballFlyTo';

const frame = vi.hoisted(() => ({ tick: (_state: { invalidate: () => void }) => {}, priority: 0 }));
vi.mock('@react-three/fiber', () => ({ useFrame: (callback: typeof frame.tick, priority: number) => {
  frame.tick = callback;
  frame.priority = priority;
} }));

function createOptions(cameraMode: 'orbit' | 'fly' = 'orbit') {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 5);
  return {
    camera, cameraMode, radius: 2, flySpeed: 1, autoRotateMode: 'off' as const,
    autoRotateSpeed: 1, axesCoordinateSystem: 'colmap' as const,
    enabledRef: { current: true }, isDraggingRef: { current: false },
    horizonLockRef: { current: 'off' as const }, worldUpRef: { current: new THREE.Vector3(0, 1, 0) },
    targetVecRef: { current: new THREE.Vector3() }, cameraQuatRef: { current: new THREE.Quaternion() },
    distanceRef: { current: 5 }, targetDistanceRef: { current: 5 },
    angularVelocityRef: { current: { x: 0, y: 0 } }, flyVelocityRef: { current: new THREE.Vector3() },
    keysPressedRef: { current: new Set<string>() },
    animationTargetRef: { current: null as TrackballAnimationTarget | null },
  };
}

let now = 1000;
beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

function tick() {
  const invalidate = vi.fn();
  act(() => frame.tick({ invalidate }));
  return invalidate.mock.calls.length > 0;
}

function settle() {
  for (let count = 0; count < 1000; count++) {
    now += 1000 / 60;
    if (!tick()) return count;
  }
  throw new Error('Controls never settled');
}

describe('trackball demand frame continuation', () => {
  it.each(['orbit', 'fly'] as const)('settles %s inertia and restarts after a long idle without a large damping step', (mode) => {
    const options = createOptions(mode);
    const { unmount } = renderHook(() => useTrackballFrameLoop(options));
    expect(frame.priority).toBe(-2);
    expect(tick()).toBe(false);
    options.angularVelocityRef.current.x = 0.02;
    const before = options.camera.quaternion.clone();
    expect(settle()).toBeGreaterThan(1);
    expect(options.camera.quaternion.equals(before)).toBe(false);
    expect(Math.abs(options.angularVelocityRef.current.x)).toBeLessThanOrEqual(CONTROLS.minVelocity);
    now += 60000;
    options.angularVelocityRef.current.x = 0.02;
    expect(tick()).toBe(true);
    expect(options.angularVelocityRef.current.x).toBeCloseTo(0.02 * CONTROLS.damping, 5);
    unmount();
  });

  it('continues wheel zoom and held keys, then finishes damping after key release', () => {
    const options = createOptions();
    const { unmount } = renderHook(() => useTrackballFrameLoop(options));
    options.targetDistanceRef.current = 2;
    expect(settle()).toBeGreaterThan(1);
    expect(options.distanceRef.current).toBeCloseTo(2, 3);
    options.keysPressedRef.current.add(' ');
    for (let i = 0; i < 5; i++) { now += 16; expect(tick()).toBe(true); }
    expect(options.targetVecRef.current.length()).toBeGreaterThan(0);
    options.keysPressedRef.current.clear();
    expect(settle()).toBeGreaterThan(1);
    expect(options.flyVelocityRef.current.length()).toBeLessThanOrEqual(0.0001);
    unmount();
  });

  it('finishes goto and pauses its elapsed time while the document is hidden', () => {
    const options = createOptions();
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const { unmount } = renderHook(() => useTrackballFrameLoop(options));
    options.animationTargetRef.current = {
      startPosition: options.camera.position.clone(), endPosition: new THREE.Vector3(10, 0, 5),
      startQuaternion: new THREE.Quaternion(), endQuaternion: new THREE.Quaternion(),
      startTarget: new THREE.Vector3(), endTarget: new THREE.Vector3(10, 0, 0),
      startDistance: 5, endDistance: 5, startTime: now, duration: 500,
    };
    tick();
    now += 100;
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    now += 60000;
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(tick()).toBe(true);
    expect(options.camera.position.x).toBeCloseTo(4.88);
    expect(settle()).toBeGreaterThan(1);
    expect(options.animationTargetRef.current).toBeNull();
    expect(options.camera.position.x).toBe(10);
    unmount();
  });
});
