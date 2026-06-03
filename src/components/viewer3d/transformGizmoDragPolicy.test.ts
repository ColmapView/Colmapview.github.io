import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Sim3dEuler } from '../../types/sim3d';
import {
  createTransformDragState,
  getGizmoAxisVector,
  getGizmoDragPlane,
  getGizmoDragTransform,
  getPointerWorldPosition,
  getTransformRotation,
  isTransformGizmoHandleHighlighted,
  snapshotTransform,
  type TransformDragState,
} from './transformGizmoDragPolicy';

const IDENTITY_TRANSFORM: Sim3dEuler = {
  scale: 1,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  translationX: 0,
  translationY: 0,
  translationZ: 0,
};

describe('transform gizmo drag policy', () => {
  it('returns independent world axis vectors', () => {
    const first = getGizmoAxisVector('x');
    const second = getGizmoAxisVector('x');

    first.set(9, 9, 9);

    expect(second.toArray()).toEqual([1, 0, 0]);
    expect(getGizmoAxisVector('y').toArray()).toEqual([0, 1, 0]);
    expect(getGizmoAxisVector('z').toArray()).toEqual([0, 0, 1]);
  });

  it('captures transform snapshots and local rotation quaternions', () => {
    const transform = {
      ...IDENTITY_TRANSFORM,
      rotationZ: Math.PI / 2,
      translationX: 4,
      translationY: 5,
      translationZ: 6,
    };

    expect(snapshotTransform(transform)).toEqual({
      rotationX: 0,
      rotationY: 0,
      rotationZ: Math.PI / 2,
      translationX: 4,
      translationY: 5,
      translationZ: 6,
    });
    expect(getTransformRotation(transform).angleTo(new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI / 2
    ))).toBeCloseTo(0);
  });

  it('creates independent drag-start snapshots', () => {
    const center: [number, number, number] = [4, 5, 6];
    const startPoint = new THREE.Vector3(1, 2, 3);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -7);
    const transform = {
      ...IDENTITY_TRANSFORM,
      rotationY: Math.PI / 4,
      translationZ: 9,
    };
    const expectedRotation = getTransformRotation(transform);

    const state = createTransformDragState({
      axis: 'y',
      mode: 'rotate',
      startPoint,
      center,
      transform,
      plane,
    });

    startPoint.set(9, 9, 9);
    center[0] = 99;
    transform.rotationY = 0;
    plane.constant = 99;

    expect(state.axis).toBe('y');
    expect(state.mode).toBe('rotate');
    expect(state.startPoint.toArray()).toEqual([1, 2, 3]);
    expect(state.startCenter.toArray()).toEqual([4, 5, 6]);
    expect(state.startTransform.rotationY).toBeCloseTo(Math.PI / 4);
    expect(state.startTransform.translationZ).toBe(9);
    expect(state.startRotation.angleTo(expectedRotation)).toBeCloseTo(0);
    expect(state.plane.constant).toBe(-7);
  });

  it('highlights the hovered or actively dragged handle', () => {
    expect(isTransformGizmoHandleHighlighted({
      axis: 'x',
      mode: 'translate',
      hoveredAxis: 'x',
      hoveredMode: 'translate',
      activeDragHandle: null,
    })).toBe(true);

    expect(isTransformGizmoHandleHighlighted({
      axis: 'z',
      mode: 'rotate',
      hoveredAxis: null,
      hoveredMode: null,
      activeDragHandle: { axis: 'z', mode: 'rotate' },
    })).toBe(true);

    expect(isTransformGizmoHandleHighlighted({
      axis: 'y',
      mode: 'translate',
      hoveredAxis: 'y',
      hoveredMode: 'rotate',
      activeDragHandle: { axis: 'x', mode: 'translate' },
    })).toBe(false);
  });

  it('builds drag planes through the gizmo center', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const center = [1, 2, 3] as const;

    const rotationPlane = getGizmoDragPlane('x', 'rotate', center, camera);
    const translationPlane = getGizmoDragPlane('y', 'translate', center, camera);

    expect(rotationPlane.normal.toArray()).toEqual([1, 0, 0]);
    expect(rotationPlane.distanceToPoint(new THREE.Vector3(...center))).toBeCloseTo(0);
    expect(translationPlane.distanceToPoint(new THREE.Vector3(...center))).toBeCloseTo(0);
    expect(translationPlane.normal.length()).toBeCloseTo(1);
  });

  it('maps pointer positions onto the selected drag plane', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const point = getPointerWorldPosition({
      clientX: 50,
      clientY: 50,
      rect: { left: 0, top: 0, width: 100, height: 100 },
      camera,
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    });

    expect(point?.x).toBeCloseTo(0);
    expect(point?.y).toBeCloseTo(0);
    expect(point?.z).toBeCloseTo(0);
  });

  it('projects translation drags onto the active world axis', () => {
    const update = getGizmoDragTransform(buildDragState({
      axis: 'x',
      mode: 'translate',
      startTransform: {
        ...IDENTITY_TRANSFORM,
        translationX: 1,
        translationY: 2,
        translationZ: 3,
      },
    }), new THREE.Vector3(5, 8, 0));

    expect(update).toEqual({
      translationX: 6,
      translationY: 2,
      translationZ: 3,
    });
  });

  it('rotates around the active world axis and preserves the pivot point', () => {
    const update = getGizmoDragTransform(buildDragState({
      axis: 'z',
      mode: 'rotate',
      startCenter: new THREE.Vector3(2, 0, 0),
      startPoint: new THREE.Vector3(3, 0, 0),
      startTransform: {
        ...IDENTITY_TRANSFORM,
        translationX: 1,
      },
    }), new THREE.Vector3(2, 1, 0));

    expect(update.translationX).toBeCloseTo(2);
    expect(update.translationY).toBeCloseTo(-1);
    expect(update.translationZ).toBeCloseTo(0);
    expect(update.rotationX).toBeCloseTo(0);
    expect(update.rotationY).toBeCloseTo(0);
    expect(update.rotationZ).toBeCloseTo(Math.PI / 2);
  });
});

function buildDragState(overrides: Partial<TransformDragState> = {}): TransformDragState {
  const startTransform = overrides.startTransform ?? snapshotTransform(IDENTITY_TRANSFORM);

  return {
    axis: 'x',
    mode: 'translate',
    startPoint: new THREE.Vector3(0, 0, 0),
    startCenter: new THREE.Vector3(0, 0, 0),
    startTransform,
    startRotation: getTransformRotation(startTransform),
    plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    ...overrides,
  };
}
