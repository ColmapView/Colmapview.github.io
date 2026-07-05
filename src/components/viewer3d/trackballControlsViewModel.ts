import * as THREE from 'three';
import type { CameraMode } from '../../store/types';
export {
  buildCameraViewState,
  buildCameraViewStateHash,
  getResetViewVectors,
  getViewDirectionVectors,
  type ViewVectors,
} from './trackballCameraViewPolicy';

export interface TouchPointer {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
}

export type TouchGesture = 'none' | 'drag' | 'pinch' | 'pan';

export interface KeyboardCaptureEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  target: EventTarget | null;
}

export interface MovementBasis {
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface PointerDelta {
  x: number;
  y: number;
}

export type PointerDragInteraction = 'rotate' | 'pan' | 'none';

export type WheelIntent = 'cameraScale' | 'pointSize' | 'navigation';

export interface PanMultiplierOptions {
  cameraMode: CameraMode;
  distance: number;
  radius: number;
  panSpeed: number;
  flySpeed: number;
  shiftKey?: boolean;
  shiftSpeedBoost?: number;
  sensitivity?: number;
}

const MOVEMENT_KEYS = new Set([
  'w',
  'a',
  's',
  'd',
  'q',
  'e',
  ' ',
  'shift',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
]);

export function getTouchDistance(p1: TouchPointer, p2: TouchPointer): number {
  return getPointDistance(p1, p2);
}

export function getPointDistance(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function getTouchCenter(p1: TouchPointer, p2: TouchPointer): { x: number; y: number } {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getClampedPointerDelta(deltaX: number, deltaY: number, maxDelta: number): PointerDelta {
  return {
    x: clampValue(deltaX, -maxDelta, maxDelta),
    y: clampValue(deltaY, -maxDelta, maxDelta),
  };
}

export function hasPointerDelta(delta: PointerDelta): boolean {
  return delta.x !== 0 || delta.y !== 0;
}

export function getSmoothedVelocityComponent(previous: number, next: number, smoothing: number): number {
  return previous * smoothing + next * (1 - smoothing);
}

export function shouldClearMomentum(timeSinceLastMoveMs: number, thresholdMs: number): boolean {
  return timeSinceLastMoveMs > thresholdMs;
}

export function getPointerDragInteraction(button: number): PointerDragInteraction {
  if (button === 0) return 'rotate';
  if (button === 1 || button === 2) return 'pan';
  return 'none';
}

export function shouldRequestPointerLock(
  pointerLockEnabled: boolean,
  pickingMode: string,
  pointerLockAlreadyRequested: boolean,
  pointerAlreadyLocked: boolean
): boolean {
  return pointerLockEnabled &&
    pickingMode === 'off' &&
    !pointerLockAlreadyRequested &&
    !pointerAlreadyLocked;
}

export function getWheelIntent(altKey: boolean, ctrlKey: boolean): WheelIntent {
  if (altKey) return 'cameraScale';
  if (ctrlKey) return 'pointSize';
  return 'navigation';
}

export function getPanMultiplier({
  cameraMode,
  distance,
  radius,
  panSpeed,
  flySpeed,
  shiftKey = false,
  shiftSpeedBoost = 1,
  sensitivity = 1,
}: PanMultiplierOptions): number {
  if (cameraMode === 'orbit') {
    return distance * panSpeed * sensitivity;
  }

  const shiftMultiplier = shiftKey ? shiftSpeedBoost : 1;
  return radius * panSpeed * flySpeed * shiftMultiplier * sensitivity;
}

export function getPanOffset(
  cameraRight: THREE.Vector3,
  cameraUp: THREE.Vector3,
  deltaX: number,
  deltaY: number,
  panMultiplier: number
): THREE.Vector3 {
  return new THREE.Vector3()
    .addScaledVector(cameraRight, -deltaX * panMultiplier)
    .addScaledVector(cameraUp, deltaY * panMultiplier);
}

export function getWheelAdjustedValue(
  currentValue: number,
  deltaY: number,
  min: number,
  max: number
): number {
  const scaleFactor = deltaY > 0 ? 0.9 : 1.1;
  return clampValue(currentValue * scaleFactor, min, max);
}

export function getFlyWheelMoveAmount(
  deltaY: number,
  radius: number,
  wheelMoveMultiplier: number,
  flySpeed: number
): number {
  return -deltaY * radius * wheelMoveMultiplier * flySpeed;
}

export function getOrthoWheelZoom(
  currentZoom: number,
  deltaY: number,
  zoomSpeed: number,
  minZoom = 0.1,
  maxZoom = 10
): number {
  const zoomFactor = 1 + deltaY * zoomSpeed;
  return clampValue(currentZoom / zoomFactor, minZoom, maxZoom);
}

// Near-range floor for zoom-OUT (see getPerspectiveWheelDistance). Pure multiplicative zoom moves
// the camera by a fixed FRACTION of its current distance per notch, so when it is close each notch
// barely budges — a sluggish start. The far/terminal speed is fine, so we DON'T cap it; we only
// floor the effective distance that drives the proportional step at MIN * sceneRadius, so a very
// close camera still steps a sensible fraction of the scene per notch. Raise for a faster start.
export const ZOOM_OUT_REF_MIN_FRACTION = 0.35;

export function getPerspectiveWheelDistance(
  currentDistance: number,
  deltaY: number,
  zoomSpeed: number,
  minDistance: number,
  sceneRadius: number
): number {
  const zoomFactor = 1 + deltaY * zoomSpeed;
  if (deltaY > 0 && sceneRadius > 0) {
    // Zoom OUT: floor the near range only. The proportional step is driven by the current distance
    // floored at MIN * sceneRadius — so it stops crawling when very close, while mid/far keep the
    // natural multiplicative curve (terminal speed unchanged). Zoom-out always grows; no downward
    // floor needed here.
    const refDistance = Math.max(currentDistance, ZOOM_OUT_REF_MIN_FRACTION * sceneRadius);
    return currentDistance + refDistance * (zoomFactor - 1);
  }
  // Zoom IN (and the degenerate sceneRadius <= 0 fallback): keep the multiplicative model —
  // approaching a target should decelerate naturally.
  // The floor stops zoom-IN from collapsing the orbit — it must never clamp
  // UPWARD. A fly-to may legitimately land closer than minDistance (e.g. the
  // spherical U-mode orbits at 0.02x the sphere radius, well under the global
  // floor); snapping up on the first wheel tick would eject the eye from the
  // panorama. Cap the floor at the current distance so zoom-out always grows
  // smoothly from wherever the camera actually is.
  const effectiveMinDistance = Math.min(minDistance, currentDistance);
  return Math.max(effectiveMinDistance, currentDistance * zoomFactor);
}

export function getPinchScale(initialDistance: number, currentDistance: number): number {
  if (initialDistance <= 0 || currentDistance <= 0) return 1;
  return initialDistance / currentDistance;
}

export function shouldApplyPinchScale(scale: number, threshold: number): boolean {
  return Math.abs(1 - scale) > threshold;
}

export function getPinchZoomValue(
  initialZoom: number,
  scale: number,
  minZoom: number,
  maxZoom: number
): number {
  return clampValue(initialZoom * scale, minZoom, maxZoom);
}

export function isDoubleTap(
  now: number,
  lastTapTime: number,
  currentPosition: Point2D,
  lastTapPosition: Point2D,
  maxDelayMs: number,
  maxDistance: number
): boolean {
  return now - lastTapTime < maxDelayMs && getPointDistance(currentPosition, lastTapPosition) < maxDistance;
}

export function isMovementKey(key: string): boolean {
  return MOVEMENT_KEYS.has(key.toLowerCase());
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable === true ||
    target.contentEditable === 'true'
  );
}

export function shouldCaptureMovementKey(event: KeyboardCaptureEvent): boolean {
  if (event.ctrlKey || event.metaKey) return false;
  return isMovementKey(event.key) && !isTextEntryTarget(event.target);
}

export function getKeyboardMoveSpeed(
  radius: number,
  moveSpeedMultiplier: number,
  flySpeed: number,
  shiftSpeedBoost: number,
  keysPressed: ReadonlySet<string>
): number {
  const shiftMultiplier = keysPressed.has('shift') ? shiftSpeedBoost : 1;
  return radius * moveSpeedMultiplier * flySpeed * shiftMultiplier;
}

export function getKeyboardMovementAcceleration(
  keysPressed: ReadonlySet<string>,
  basis: MovementBasis,
  moveSpeed: number
): THREE.Vector3 {
  const acceleration = new THREE.Vector3();

  if (keysPressed.has('w')) acceleration.add(basis.forward.clone().multiplyScalar(moveSpeed));
  if (keysPressed.has('s')) acceleration.add(basis.forward.clone().multiplyScalar(-moveSpeed));
  if (keysPressed.has('a')) acceleration.add(basis.right.clone().multiplyScalar(-moveSpeed));
  if (keysPressed.has('d')) acceleration.add(basis.right.clone().multiplyScalar(moveSpeed));
  if (keysPressed.has('e') || keysPressed.has(' ')) acceleration.add(basis.up.clone().multiplyScalar(moveSpeed));
  if (keysPressed.has('q')) acceleration.add(basis.up.clone().multiplyScalar(-moveSpeed));

  return acceleration;
}
