import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { CAMERA, CONTROLS } from '../../theme';
import type { AutoRotateMode, CameraMode } from '../../store/types';
import {
  getClampedPointerDelta,
  getPanMultiplier,
  getPanOffset,
  getPointerDragInteraction,
  getSmoothedVelocityComponent,
  hasPointerDelta,
  shouldClearMomentum,
  shouldRequestPointerLock,
} from './trackballControlsViewModel';
import { moveCamera } from './trackballCameraMutations';
import type { TrackballAnimationTarget } from './useTrackballFlyTo';

export interface XYValue {
  x: number;
  y: number;
}

export interface TrackballPointerHandlersOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  cameraMode: CameraMode;
  flySpeed: number;
  pointerLock: boolean;
  pickingMode: string;
  radius: number;
  autoRotateMode: AutoRotateMode;
  touchMode: boolean;
  rotateSpeed: number;
  panSpeed: number;
  applyRotation: (deltaX: number, deltaY: number) => void;
  updateCamera: () => void;
  isDraggingRef: MutableRefObject<boolean>;
  isPanningRef: MutableRefObject<boolean>;
  pointerLockRequestedRef: MutableRefObject<boolean>;
  targetVecRef: MutableRefObject<THREE.Vector3>;
  cameraQuatRef: MutableRefObject<THREE.Quaternion>;
  distanceRef: MutableRefObject<number>;
  angularVelocityRef: MutableRefObject<XYValue>;
  smoothedVelocityRef: MutableRefObject<XYValue>;
  lastMouseRef: MutableRefObject<XYValue>;
  lastTimeRef: MutableRefObject<number>;
  animationTargetRef: MutableRefObject<TrackballAnimationTarget | null>;
  enabledRef: MutableRefObject<boolean>;
  draggingRef: MutableRefObject<boolean>;
  navActions: {
    setAutoRotateMode: (mode: AutoRotateMode) => void;
    clearNavigationHistory: () => void;
  };
}

export interface TrackballPointerDownOptions extends TrackballPointerHandlersOptions {
  event: PointerEvent;
}

export interface TrackballPointerMoveOptions extends TrackballPointerHandlersOptions {
  event: MouseEvent;
}

export function handleTrackballPointerDown({
  event,
  touchMode,
  autoRotateMode,
  lastMouseRef,
  lastTimeRef,
  isDraggingRef,
  isPanningRef,
  pointerLockRequestedRef,
  angularVelocityRef,
  smoothedVelocityRef,
  animationTargetRef,
  enabledRef,
  draggingRef,
  navActions,
}: TrackballPointerDownOptions): void {
  if (touchMode && event.pointerType === 'touch') return;

  const button = event.button;
  lastMouseRef.current = { x: event.clientX, y: event.clientY };
  lastTimeRef.current = performance.now();

  Promise.resolve().then(() => {
    if (!enabledRef.current) return;

    animationTargetRef.current = null;
    const interaction = getPointerDragInteraction(button);

    if (interaction === 'rotate') {
      isDraggingRef.current = true;
      draggingRef.current = true;
      angularVelocityRef.current.x = 0;
      angularVelocityRef.current.y = 0;
      smoothedVelocityRef.current.x = 0;
      smoothedVelocityRef.current.y = 0;
      pointerLockRequestedRef.current = false;
    } else if (interaction === 'pan') {
      isPanningRef.current = true;
      draggingRef.current = true;
      if (autoRotateMode !== 'off') navActions.setAutoRotateMode('off');
    }
  });
}

export function handleTrackballPointerUp({
  canvas,
  applyRotation,
  updateCamera,
  isDraggingRef,
  isPanningRef,
  pointerLockRequestedRef,
  angularVelocityRef,
  lastTimeRef,
  enabledRef,
  draggingRef,
}: TrackballPointerHandlersOptions): void {
  if (!isDraggingRef.current && !isPanningRef.current) return;

  draggingRef.current = false;

  if (!enabledRef.current) {
    angularVelocityRef.current.x = 0;
    angularVelocityRef.current.y = 0;
    isDraggingRef.current = false;
    isPanningRef.current = false;
    pointerLockRequestedRef.current = false;
    return;
  }

  const timeSinceLastMove = performance.now() - lastTimeRef.current;
  const moveThresholdMs = 50;

  if (shouldClearMomentum(timeSinceLastMove, moveThresholdMs)) {
    angularVelocityRef.current.x = 0;
    angularVelocityRef.current.y = 0;
  } else {
    applyRotation(angularVelocityRef.current.x, angularVelocityRef.current.y);
    updateCamera();
  }

  isDraggingRef.current = false;
  isPanningRef.current = false;
  pointerLockRequestedRef.current = false;

  if (document.pointerLockElement === canvas) {
    document.exitPointerLock();
  }
}

export function handleTrackballPointerLockChange({
  canvas,
  isDraggingRef,
  isPanningRef,
  pointerLockRequestedRef,
  angularVelocityRef,
  smoothedVelocityRef,
  draggingRef,
}: TrackballPointerHandlersOptions): void {
  if (document.pointerLockElement !== canvas && isDraggingRef.current) {
    angularVelocityRef.current.x = 0;
    angularVelocityRef.current.y = 0;
    smoothedVelocityRef.current.x = 0;
    smoothedVelocityRef.current.y = 0;
    isDraggingRef.current = false;
    isPanningRef.current = false;
    draggingRef.current = false;
    pointerLockRequestedRef.current = false;
  }
}

export function handleTrackballPointerMove({
  event,
  canvas,
  camera,
  cameraMode,
  flySpeed,
  pointerLock,
  pickingMode,
  radius,
  rotateSpeed,
  panSpeed,
  applyRotation,
  updateCamera,
  isDraggingRef,
  isPanningRef,
  pointerLockRequestedRef,
  targetVecRef,
  cameraQuatRef,
  distanceRef,
  angularVelocityRef,
  smoothedVelocityRef,
  lastMouseRef,
  lastTimeRef,
  enabledRef,
  draggingRef,
  navActions,
}: TrackballPointerMoveOptions): void {
  if (!enabledRef.current) {
    if (isDraggingRef.current || isPanningRef.current) {
      angularVelocityRef.current.x = 0;
      angularVelocityRef.current.y = 0;
      isDraggingRef.current = false;
      isPanningRef.current = false;
      draggingRef.current = false;
    }
    return;
  }

  const now = performance.now();
  const isLocked = document.pointerLockElement === canvas;
  const deltaX = isLocked ? event.movementX : event.clientX - lastMouseRef.current.x;
  const deltaY = isLocked ? event.movementY : event.clientY - lastMouseRef.current.y;
  lastMouseRef.current = { x: event.clientX, y: event.clientY };
  lastTimeRef.current = now;

  const delta = { x: deltaX, y: deltaY };

  if (isDraggingRef.current) {
    if (hasPointerDelta(delta)) {
      navActions.clearNavigationHistory();
    }

    if (shouldRequestPointerLock(pointerLock, pickingMode, pointerLockRequestedRef.current, isLocked)) {
      pointerLockRequestedRef.current = true;
      canvas.requestPointerLock();
    }

    const clampedDelta = getClampedPointerDelta(delta.x, delta.y, 50);
    const rotX = clampedDelta.x * rotateSpeed;
    const rotY = clampedDelta.y * rotateSpeed;
    applyRotation(rotX, rotY);
    updateCamera();

    const smoothing = CAMERA.velocitySmoothingFactor;
    smoothedVelocityRef.current.x = getSmoothedVelocityComponent(smoothedVelocityRef.current.x, rotX, smoothing);
    smoothedVelocityRef.current.y = getSmoothedVelocityComponent(smoothedVelocityRef.current.y, rotY, smoothing);
    angularVelocityRef.current.x = smoothedVelocityRef.current.x;
    angularVelocityRef.current.y = smoothedVelocityRef.current.y;
  }

  if (isPanningRef.current) {
    if (hasPointerDelta(delta)) {
      navActions.clearNavigationHistory();
    }

    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuatRef.current);
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuatRef.current);

    if (cameraMode === 'orbit') {
      const panMultiplier = getPanMultiplier({
        cameraMode,
        distance: distanceRef.current,
        radius,
        panSpeed,
        flySpeed,
      });
      const panOffset = getPanOffset(cameraRight, cameraUp, delta.x, delta.y, panMultiplier);

      targetVecRef.current.add(panOffset);
      updateCamera();
    } else {
      const panMultiplier = getPanMultiplier({
        cameraMode,
        distance: distanceRef.current,
        radius,
        panSpeed,
        flySpeed,
        shiftKey: event.shiftKey,
        shiftSpeedBoost: CONTROLS.shiftSpeedBoost,
      });
      const panOffset = getPanOffset(cameraRight, cameraUp, delta.x, delta.y, panMultiplier);

      moveCamera(camera, panOffset);
    }
  }
}

export function handleTrackballContextMenu(event: MouseEvent): void {
  event.preventDefault();
}
