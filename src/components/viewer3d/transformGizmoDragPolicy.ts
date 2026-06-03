import * as THREE from 'three';
import type { Sim3dEuler } from '../../types/sim3d';
import type { GizmoAxis, GizmoMode } from './TransformGizmoHandles';

export type ActiveGizmoAxis = Exclude<GizmoAxis, null>;
export type ActiveGizmoMode = Exclude<GizmoMode, null>;

export type TransformDragSnapshot = Pick<
  Sim3dEuler,
  | 'translationX'
  | 'translationY'
  | 'translationZ'
  | 'rotationX'
  | 'rotationY'
  | 'rotationZ'
>;

export interface TransformDragState {
  axis: ActiveGizmoAxis;
  mode: ActiveGizmoMode;
  startPoint: THREE.Vector3;
  startCenter: THREE.Vector3;
  startTransform: TransformDragSnapshot;
  startRotation: THREE.Quaternion;
  plane: THREE.Plane;
}

export type ActiveTransformGizmoHandle = Pick<TransformDragState, 'axis' | 'mode'>;

export interface CreateTransformDragStateOptions {
  axis: ActiveGizmoAxis;
  mode: ActiveGizmoMode;
  startPoint: THREE.Vector3;
  center: readonly [number, number, number];
  transform: Sim3dEuler;
  plane: THREE.Plane;
}

export interface TransformGizmoHandleHighlightOptions {
  axis: ActiveGizmoAxis;
  mode: ActiveGizmoMode;
  hoveredAxis: GizmoAxis;
  hoveredMode: GizmoMode;
  activeDragHandle: ActiveTransformGizmoHandle | null;
}

export interface PointerWorldPositionOptions {
  clientX: number;
  clientY: number;
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
  camera: THREE.Camera;
  plane: THREE.Plane;
}

export function getGizmoAxisVector(axis: ActiveGizmoAxis): THREE.Vector3 {
  switch (axis) {
    case 'x':
      return new THREE.Vector3(1, 0, 0);
    case 'y':
      return new THREE.Vector3(0, 1, 0);
    case 'z':
      return new THREE.Vector3(0, 0, 1);
  }
}

export function getTransformRotation(transform: Pick<Sim3dEuler, 'rotationX' | 'rotationY' | 'rotationZ'>): THREE.Quaternion {
  const euler = new THREE.Euler(transform.rotationX, transform.rotationY, transform.rotationZ, 'XYZ');
  return new THREE.Quaternion().setFromEuler(euler);
}

export function snapshotTransform(transform: Sim3dEuler): TransformDragSnapshot {
  return {
    translationX: transform.translationX,
    translationY: transform.translationY,
    translationZ: transform.translationZ,
    rotationX: transform.rotationX,
    rotationY: transform.rotationY,
    rotationZ: transform.rotationZ,
  };
}

export function createTransformDragState({
  axis,
  mode,
  startPoint,
  center,
  transform,
  plane,
}: CreateTransformDragStateOptions): TransformDragState {
  const startTransform = snapshotTransform(transform);

  return {
    axis,
    mode,
    startPoint: startPoint.clone(),
    startCenter: new THREE.Vector3(...center),
    startTransform,
    startRotation: getTransformRotation(startTransform),
    plane: plane.clone(),
  };
}

export function isTransformGizmoHandleHighlighted({
  axis,
  mode,
  hoveredAxis,
  hoveredMode,
  activeDragHandle,
}: TransformGizmoHandleHighlightOptions): boolean {
  return (
    (hoveredAxis === axis && hoveredMode === mode) ||
    (activeDragHandle?.axis === axis && activeDragHandle.mode === mode)
  );
}

export function getGizmoDragPlane(
  axis: ActiveGizmoAxis,
  mode: ActiveGizmoMode,
  center: readonly [number, number, number],
  camera: THREE.Camera
): THREE.Plane {
  const gizmoCenter = new THREE.Vector3(...center);
  const axisDir = getGizmoAxisVector(axis);

  if (mode === 'rotate') {
    return new THREE.Plane().setFromNormalAndCoplanarPoint(axisDir, gizmoCenter);
  }

  const cameraDir = new THREE.Vector3();
  camera.getWorldDirection(cameraDir);

  let planeNormal = axisDir.clone().cross(cameraDir).cross(axisDir).normalize();
  if (planeNormal.lengthSq() < 0.001) {
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    planeNormal = axisDir.clone().cross(cameraUp).cross(axisDir).normalize();
  }

  return new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, gizmoCenter);
}

export function getPointerWorldPosition({
  clientX,
  clientY,
  rect,
  camera,
  plane,
}: PointerWorldPositionOptions): THREE.Vector3 | null {
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

  const intersection = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, intersection) ? intersection : null;
}

export function getGizmoDragTransform({
  axis,
  mode,
  startPoint,
  startCenter,
  startTransform,
  startRotation,
}: TransformDragState, currentPoint: THREE.Vector3): Partial<Sim3dEuler> {
  if (mode === 'translate') {
    const axisDir = getGizmoAxisVector(axis);
    const delta = currentPoint.clone().sub(startPoint);
    const movement = delta.dot(axisDir);
    const worldMovement = axisDir.clone().multiplyScalar(movement);

    return {
      translationX: startTransform.translationX + worldMovement.x,
      translationY: startTransform.translationY + worldMovement.y,
      translationZ: startTransform.translationZ + worldMovement.z,
    };
  }

  const pivotPoint = startCenter;
  const startDir = startPoint.clone().sub(pivotPoint).normalize();
  const currentDir = currentPoint.clone().sub(pivotPoint).normalize();
  const worldAxis = getGizmoAxisVector(axis);
  const cross = startDir.clone().cross(currentDir);
  const dot = startDir.dot(currentDir);
  let angle = Math.atan2(cross.length(), dot);

  if (cross.dot(worldAxis) < 0) {
    angle = -angle;
  }

  const deltaRotationWorld = new THREE.Quaternion().setFromAxisAngle(worldAxis, angle);
  const newRotation = deltaRotationWorld.clone().multiply(startRotation);
  const startTranslation = new THREE.Vector3(
    startTransform.translationX,
    startTransform.translationY,
    startTransform.translationZ
  );
  const pivotOffset = pivotPoint.clone().sub(startTranslation);
  const rotatedOffset = pivotOffset.clone().applyQuaternion(deltaRotationWorld);
  const newTranslation = pivotPoint.clone().sub(rotatedOffset);
  const euler = new THREE.Euler().setFromQuaternion(newRotation, 'XYZ');

  return {
    translationX: newTranslation.x,
    translationY: newTranslation.y,
    translationZ: newTranslation.z,
    rotationX: euler.x,
    rotationY: euler.y,
    rotationZ: euler.z,
  };
}
