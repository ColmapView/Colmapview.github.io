import * as THREE from 'three';
import type { Plane } from '../../utils/ransac';
import { flipPlaneNormal } from '../../utils/ransac';

export interface FloorPlaneWidgetData {
  position: THREE.Vector3;
  normalVec: THREE.Vector3;
  quaternion: THREE.Quaternion;
  radius: number;
  arrowRadius: number;
  shaftLength: number;
  shaftCenter: THREE.Vector3;
  shaftQuaternion: THREE.Quaternion;
  conePosition: THREE.Vector3;
  coneHeight: number;
  coneRadius: number;
  coneQuaternion: THREE.Quaternion;
  labelPosition: THREE.Vector3;
  fontSize: number;
}

export interface FloorPlaneWidgetDataOptions {
  boundsRadius: number;
  detectedPlane: Plane | null;
  normalFlipped: boolean;
  axesScale: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface FloorPlaneBlinkOpacityOptions {
  baseOpacity: number;
  elapsedTime: number;
  animationSpeed?: number;
}

export const FLOOR_PLANE_RENDER_ORDER = 50;
export const FLOOR_PLANE_BLINK_SPEED = 2;
const FLOOR_PLANE_BLINK_MIN_FACTOR = 0.35;
const FLOOR_PLANE_BLINK_MAX_FACTOR = 1.9;

export function getFloorPlaneWidgetData({
  boundsRadius,
  detectedPlane,
  normalFlipped,
  axesScale,
}: FloorPlaneWidgetDataOptions): FloorPlaneWidgetData | null {
  if (!detectedPlane) return null;

  const plane = normalFlipped ? flipPlaneNormal(detectedPlane) : detectedPlane;
  const { normal, centroid, radius } = plane;

  const position = new THREE.Vector3(centroid[0], centroid[1], centroid[2]);
  const normalVec = new THREE.Vector3(normal[0], normal[1], normal[2]);

  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normalVec);

  const axisSize = boundsRadius * axesScale;
  const arrowLength = axisSize * 0.5;
  const arrowRadius = axisSize * 0.005;
  const coneHeight = arrowRadius * 8;
  const coneRadius = arrowRadius * 3;
  const shaftLength = arrowLength - coneHeight;

  const shaftCenter = position.clone().add(normalVec.clone().multiplyScalar(shaftLength / 2));
  const conePosition = position.clone().add(normalVec.clone().multiplyScalar(shaftLength + coneHeight / 2));

  const coneQuaternion = new THREE.Quaternion();
  coneQuaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalVec);

  const shaftQuaternion = new THREE.Quaternion();
  shaftQuaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalVec);

  const labelOffset = arrowLength * 1.15;
  const labelPosition = position.clone().add(normalVec.clone().multiplyScalar(labelOffset));
  const fontSize = axisSize * 0.08;

  return {
    position,
    normalVec,
    quaternion,
    radius,
    arrowRadius,
    shaftLength,
    shaftCenter,
    shaftQuaternion,
    conePosition,
    coneHeight,
    coneRadius,
    coneQuaternion,
    labelPosition,
    fontSize,
  };
}

export function shouldClaimFloorPlaneContextPointer(button: number): boolean {
  return button === 2;
}

export function shouldOpenFloorModalOnHover(showFloorModal: boolean): boolean {
  return !showFloorModal;
}

export function getScreenPoint(clientX: number, clientY: number): ScreenPoint {
  return { x: clientX, y: clientY };
}

export function getFloorPlaneBlinkOpacity({
  baseOpacity,
  elapsedTime,
  animationSpeed = FLOOR_PLANE_BLINK_SPEED,
}: FloorPlaneBlinkOpacityOptions): number {
  if (baseOpacity <= 0 || !Number.isFinite(baseOpacity)) return 0;

  const blinkFactor = (Math.sin(elapsedTime * animationSpeed * 2) + 1) / 2;
  const minOpacity = baseOpacity * FLOOR_PLANE_BLINK_MIN_FACTOR;
  const maxOpacity = Math.min(1, baseOpacity * FLOOR_PLANE_BLINK_MAX_FACTOR);
  return minOpacity + (maxOpacity - minOpacity) * blinkFactor;
}
