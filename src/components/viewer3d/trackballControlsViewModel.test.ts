import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildCameraViewState,
  buildCameraViewStateHash,
  clampValue,
  easeOutCubic,
  getClampedPointerDelta,
  getFlyWheelMoveAmount,
  getKeyboardMovementAcceleration,
  getKeyboardMoveSpeed,
  getOrthoWheelZoom,
  getPanMultiplier,
  getPanOffset,
  getPerspectiveWheelDistance,
  getPinchScale,
  getPinchZoomValue,
  getPointerDragInteraction,
  getPointDistance,
  getResetViewVectors,
  getSmoothedVelocityComponent,
  getTouchCenter,
  getTouchDistance,
  getWheelAdjustedValue,
  hasPointerDelta,
  isDoubleTap,
  getViewDirectionVectors,
  getWheelIntent,
  isMovementKey,
  isTextEntryTarget,
  shouldApplyPinchScale,
  shouldCaptureMovementKey,
  shouldClearMomentum,
  shouldRequestPointerLock,
  type TouchPointer,
} from './trackballControlsViewModel';

function touch(x: number, y: number): TouchPointer {
  return { id: x + y, x, y, startX: x, startY: y };
}

describe('trackball controls view-model helpers', () => {
  it('computes touch geometry for gesture handling', () => {
    expect(getTouchDistance(touch(0, 0), touch(3, 4))).toBe(5);
    expect(getPointDistance({ x: -1, y: 2 }, { x: 2, y: 6 })).toBe(5);
    expect(getTouchCenter(touch(2, 4), touch(6, 10))).toEqual({ x: 4, y: 7 });
  });

  it('eases fly-to transitions with a cubic out curve', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
  });

  it('captures movement keys only outside text entry and shortcut chords', () => {
    const input = document.createElement('input');
    const contentEditable = document.createElement('div');
    contentEditable.contentEditable = 'true';

    expect(isMovementKey('W')).toBe(true);
    expect(isMovementKey('Escape')).toBe(false);
    expect(isTextEntryTarget(input)).toBe(true);
    expect(isTextEntryTarget(contentEditable)).toBe(true);
    expect(shouldCaptureMovementKey({ key: 'w', ctrlKey: false, metaKey: false, target: document.body })).toBe(true);
    expect(shouldCaptureMovementKey({ key: 'w', ctrlKey: true, metaKey: false, target: document.body })).toBe(false);
    expect(shouldCaptureMovementKey({ key: 'w', ctrlKey: false, metaKey: false, target: input })).toBe(false);
  });

  it('builds keyboard acceleration from pressed movement keys', () => {
    const basis = {
      forward: new THREE.Vector3(0, 0, -1),
      right: new THREE.Vector3(1, 0, 0),
      up: new THREE.Vector3(0, 1, 0),
    };

    expect(getKeyboardMoveSpeed(10, 0.01, 2, 4, new Set(['shift']))).toBeCloseTo(0.8);
    expect(getKeyboardMovementAcceleration(new Set(['w', 'd', 'e']), basis, 2).toArray()).toEqual([2, 2, -2]);
    expect(getKeyboardMovementAcceleration(new Set(['s', 'a', 'q']), basis, 3).toArray()).toEqual([-3, -3, 3]);
  });

  it('clamps pointer deltas and smooths momentum velocity', () => {
    expect(clampValue(12, 0, 10)).toBe(10);
    expect(clampValue(-2, 0, 10)).toBe(0);
    expect(getClampedPointerDelta(80, -90, 50)).toEqual({ x: 50, y: -50 });
    expect(hasPointerDelta({ x: 0, y: 0 })).toBe(false);
    expect(hasPointerDelta({ x: 1, y: 0 })).toBe(true);
    expect(getSmoothedVelocityComponent(10, 20, 0.25)).toBe(17.5);
    expect(shouldClearMomentum(51, 50)).toBe(true);
    expect(shouldClearMomentum(50, 50)).toBe(false);
  });

  it('derives pointer, wheel, and pan input policy', () => {
    expect(getPointerDragInteraction(0)).toBe('rotate');
    expect(getPointerDragInteraction(1)).toBe('pan');
    expect(getPointerDragInteraction(2)).toBe('pan');
    expect(getPointerDragInteraction(3)).toBe('none');

    expect(shouldRequestPointerLock(true, 'off', false, false)).toBe(true);
    expect(shouldRequestPointerLock(false, 'off', false, false)).toBe(false);
    expect(shouldRequestPointerLock(true, 'origin-1pt', false, false)).toBe(false);
    expect(shouldRequestPointerLock(true, 'off', true, false)).toBe(false);
    expect(shouldRequestPointerLock(true, 'off', false, true)).toBe(false);

    expect(getWheelIntent(true, true)).toBe('cameraScale');
    expect(getWheelIntent(false, true)).toBe('pointSize');
    expect(getWheelIntent(false, false)).toBe('navigation');

    expect(getPanMultiplier({
      cameraMode: 'orbit',
      distance: 10,
      radius: 20,
      panSpeed: 0.01,
      flySpeed: 2,
      shiftKey: true,
      shiftSpeedBoost: 4,
    })).toBeCloseTo(0.1);
    expect(getPanMultiplier({
      cameraMode: 'fly',
      distance: 10,
      radius: 20,
      panSpeed: 0.01,
      flySpeed: 2,
      shiftKey: true,
      shiftSpeedBoost: 4,
    })).toBeCloseTo(1.6);
    expect(getPanMultiplier({
      cameraMode: 'fly',
      distance: 10,
      radius: 20,
      panSpeed: 0.01,
      flySpeed: 2,
      sensitivity: 0.5,
    })).toBeCloseTo(0.2);
  });

  it('derives pan, wheel, and pinch adjustments', () => {
    const right = new THREE.Vector3(1, 0, 0);
    const up = new THREE.Vector3(0, 1, 0);

    expect(getPanOffset(right, up, 2, 3, 0.5).toArray()).toEqual([-1, 1.5, 0]);
    expect(getWheelAdjustedValue(5, 1, 0.01, 10)).toBe(4.5);
    expect(getWheelAdjustedValue(5, -1, 0.01, 10)).toBe(5.5);
    expect(getFlyWheelMoveAmount(2, 10, 0.01, 3)).toBeCloseTo(-0.6);
    expect(getOrthoWheelZoom(2, 10, 0.01)).toBeCloseTo(2 / 1.1);
    expect(getPerspectiveWheelDistance(10, 10, 0.01, 2)).toBe(11);
    // Zoom-in still floors at minDistance on the normal path.
    expect(getPerspectiveWheelDistance(2.1, -10, 0.01, 2)).toBe(2);
    // The floor never clamps UPWARD: a fly-to landing closer than minDistance
    // (spherical U-mode orbits at 0.02x sphere radius) must zoom out smoothly,
    // not snap to the global floor on the first tick...
    expect(getPerspectiveWheelDistance(0.005, 10, 0.01, 0.1)).toBeCloseTo(0.0055, 10);
    // ...and zoom-in from below the floor holds position instead of jumping up.
    expect(getPerspectiveWheelDistance(0.005, -10, 0.01, 0.1)).toBe(0.005);
    expect(getPinchScale(100, 50)).toBe(2);
    expect(getPinchScale(100, 0)).toBe(1);
    expect(shouldApplyPinchScale(1.2, 0.1)).toBe(true);
    expect(shouldApplyPinchScale(1.05, 0.1)).toBe(false);
    expect(getPinchZoomValue(6, 2, 0.1, 10)).toBe(10);
  });

  it('detects double taps by time and distance', () => {
    expect(isDoubleTap(140, 100, { x: 12, y: 12 }, { x: 10, y: 10 }, 250, 30)).toBe(true);
    expect(isDoubleTap(400, 100, { x: 12, y: 12 }, { x: 10, y: 10 }, 250, 30)).toBe(false);
    expect(isDoubleTap(140, 100, { x: 100, y: 100 }, { x: 10, y: 10 }, 250, 30)).toBe(false);
  });

  it('builds stable serializable camera view state and hashes', () => {
    const state = buildCameraViewState(
      new THREE.Vector3(1, 2, 3),
      new THREE.Quaternion(0, 0.25, 0.5, 1),
      new THREE.Vector3(4, 5, 6),
      7
    );

    expect(state).toEqual({
      position: [1, 2, 3],
      quaternion: [0, 0.25, 0.5, 1],
      target: [4, 5, 6],
      distance: 7,
    });
    expect(buildCameraViewStateHash(state)).toBe('1,2,3,4,5,6,0,0.25,0.5,1');
  });

  it('builds reset view vectors for free and horizon-locked modes', () => {
    const free = getResetViewVectors(10, false, new THREE.Vector3(0, 1, 0));
    const locked = getResetViewVectors(10, true, new THREE.Vector3(0, 1, 0));

    expect(free.offset.length()).toBeCloseTo(10);
    expect(free.up.toArray()).toEqual([
      expect.closeTo(0.5),
      expect.closeTo(-Math.SQRT1_2),
      expect.closeTo(0.5),
    ]);
    expect(locked.offset.length()).toBeCloseTo(10);
    expect(locked.up.toArray()).toEqual([0, 1, 0]);
  });

  it('builds axis view vectors without sharing mutable constants', () => {
    const first = getViewDirectionVectors('x', 4, false, new THREE.Vector3(0, 1, 0));
    const second = getViewDirectionVectors('x', 4, false, new THREE.Vector3(0, 1, 0));

    expect(first.offset.toArray()).toEqual([4, 0, 0]);
    expect(first.up.toArray()).toEqual([0, 1, 0]);
    expect(first.offset).not.toBe(second.offset);
    expect(first.up).not.toBe(second.up);
  });

  it('uses world up for horizon-locked positive Y axis views', () => {
    const view = getViewDirectionVectors('y', 3, true, new THREE.Vector3(0, 0, 1));

    expect(view.offset.toArray()).toEqual([0, 0, 3]);
    expect(view.up.toArray()).toEqual([0, 0, -1]);
  });
});
