import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { CAMERA, CONTROLS, TOUCH } from '../../theme';
import type { CameraMode } from '../../store/types';
import {
  getPanMultiplier,
  getPanOffset,
  getPinchScale,
  getPinchZoomValue,
  getPointDistance,
  getSmoothedVelocityComponent,
  getTouchCenter,
  getTouchDistance,
  hasPointerDelta,
  isDoubleTap,
  shouldApplyPinchScale,
  shouldClearMomentum,
  type TouchGesture,
  type TouchPointer,
} from './trackballControlsViewModel';
import type { TrackballAnimationTarget } from './useTrackballFlyTo';
import { moveCamera, setOrthographicZoom } from './trackballCameraMutations';

export interface XYValue {
  x: number;
  y: number;
}

export interface TrackballTouchHandlersOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  cameraMode: CameraMode;
  flySpeed: number;
  radius: number;
  touchMode: boolean;
  rotateSpeed: number;
  panSpeed: number;
  applyRotation: (deltaX: number, deltaY: number) => void;
  updateCamera: () => void;
  isDraggingRef: MutableRefObject<boolean>;
  isPanningRef: MutableRefObject<boolean>;
  targetVecRef: MutableRefObject<THREE.Vector3>;
  cameraQuatRef: MutableRefObject<THREE.Quaternion>;
  distanceRef: MutableRefObject<number>;
  targetDistanceRef: MutableRefObject<number>;
  orthoZoomRef: MutableRefObject<number>;
  angularVelocityRef: MutableRefObject<XYValue>;
  smoothedVelocityRef: MutableRefObject<XYValue>;
  lastMouseRef: MutableRefObject<XYValue>;
  lastTimeRef: MutableRefObject<number>;
  animationTargetRef: MutableRefObject<TrackballAnimationTarget | null>;
  touchPointersRef: MutableRefObject<Map<number, TouchPointer>>;
  touchGestureRef: MutableRefObject<TouchGesture>;
  initialPinchDistanceRef: MutableRefObject<number>;
  initialPinchZoomRef: MutableRefObject<number>;
  lastTouchCenterRef: MutableRefObject<XYValue>;
  lastDoubleTapTimeRef: MutableRefObject<number>;
  lastTapPositionRef: MutableRefObject<XYValue>;
  dragStartPositionRef: MutableRefObject<XYValue>;
  hasDragThresholdPassedRef: MutableRefObject<boolean>;
  enabledRef: MutableRefObject<boolean>;
  draggingRef: MutableRefObject<boolean>;
  navActions: {
    clearNavigationHistory: () => void;
  };
}

export interface TrackballTouchStartOptions extends TrackballTouchHandlersOptions {
  event: TouchEvent;
  resetView: () => void;
}

export interface TrackballTouchMoveOptions extends TrackballTouchHandlersOptions {
  event: TouchEvent;
}

export interface TrackballTouchEndOptions extends TrackballTouchHandlersOptions {
  event: TouchEvent;
}

export function handleTrackballTouchStart({
  event,
  camera,
  targetDistanceRef,
  orthoZoomRef,
  angularVelocityRef,
  smoothedVelocityRef,
  lastMouseRef,
  lastTimeRef,
  animationTargetRef,
  touchPointersRef,
  touchGestureRef,
  initialPinchDistanceRef,
  initialPinchZoomRef,
  lastTouchCenterRef,
  lastDoubleTapTimeRef,
  lastTapPositionRef,
  dragStartPositionRef,
  hasDragThresholdPassedRef,
  enabledRef,
  draggingRef,
  isDraggingRef,
  isPanningRef,
  resetView,
}: TrackballTouchStartOptions): void {
  if (!enabledRef.current) return;

  for (const touch of Array.from(event.changedTouches)) {
    touchPointersRef.current.set(touch.identifier, {
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      startX: touch.clientX,
      startY: touch.clientY,
    });
  }

  const pointerCount = touchPointersRef.current.size;

  if (pointerCount === 1) {
    const touch = Array.from(touchPointersRef.current.values())[0];
    const now = performance.now();

    if (isDoubleTap(now, lastDoubleTapTimeRef.current, touch, lastTapPositionRef.current, TOUCH.doubleTapDelay, 30)) {
      resetView();
      lastDoubleTapTimeRef.current = 0;
      lastTapPositionRef.current = { x: 0, y: 0 };
      touchPointersRef.current.clear();
      touchGestureRef.current = 'none';
      return;
    }

    lastDoubleTapTimeRef.current = now;
    lastTapPositionRef.current = { x: touch.x, y: touch.y };

    touchGestureRef.current = 'drag';
    isDraggingRef.current = true;
    draggingRef.current = true;
    hasDragThresholdPassedRef.current = false;
    angularVelocityRef.current.x = 0;
    angularVelocityRef.current.y = 0;
    smoothedVelocityRef.current.x = 0;
    smoothedVelocityRef.current.y = 0;

    dragStartPositionRef.current = { x: touch.x, y: touch.y };
    lastMouseRef.current = { x: touch.x, y: touch.y };
    lastTimeRef.current = performance.now();

    animationTargetRef.current = null;
  } else if (pointerCount === 2) {
    const touches = Array.from(touchPointersRef.current.values());
    initialPinchDistanceRef.current = getTouchDistance(touches[0], touches[1]);
    initialPinchZoomRef.current = camera instanceof THREE.OrthographicCamera
      ? orthoZoomRef.current
      : targetDistanceRef.current;
    lastTouchCenterRef.current = getTouchCenter(touches[0], touches[1]);

    touchGestureRef.current = 'pinch';
    isDraggingRef.current = false;
    isPanningRef.current = true;
    draggingRef.current = true;
  }
}

export function handleTrackballTouchMove({
  event,
  camera,
  cameraMode,
  flySpeed,
  radius,
  rotateSpeed,
  panSpeed,
  applyRotation,
  updateCamera,
  targetVecRef,
  cameraQuatRef,
  distanceRef,
  targetDistanceRef,
  orthoZoomRef,
  angularVelocityRef,
  smoothedVelocityRef,
  lastMouseRef,
  lastTimeRef,
  touchPointersRef,
  touchGestureRef,
  initialPinchDistanceRef,
  initialPinchZoomRef,
  lastTouchCenterRef,
  dragStartPositionRef,
  hasDragThresholdPassedRef,
  enabledRef,
  navActions,
}: TrackballTouchMoveOptions): void {
  if (!enabledRef.current) return;

  for (const touch of Array.from(event.changedTouches)) {
    const tracked = touchPointersRef.current.get(touch.identifier);
    if (tracked) {
      tracked.x = touch.clientX;
      tracked.y = touch.clientY;
    }
  }

  const pointerCount = touchPointersRef.current.size;

  if (pointerCount === 1 && touchGestureRef.current === 'drag') {
    const touch = Array.from(touchPointersRef.current.values())[0];

    if (!hasDragThresholdPassedRef.current) {
      const totalDragDistance = getPointDistance(dragStartPositionRef.current, touch);

      if (totalDragDistance < TOUCH.dragThreshold) {
        return;
      }
      hasDragThresholdPassedRef.current = true;
      lastMouseRef.current = { x: touch.x, y: touch.y };
    }

    const deltaX = touch.x - lastMouseRef.current.x;
    const deltaY = touch.y - lastMouseRef.current.y;

    if (hasPointerDelta({ x: deltaX, y: deltaY })) {
      navActions.clearNavigationHistory();
    }

    const rotX = deltaX * rotateSpeed * TOUCH.orbitSensitivity;
    const rotY = deltaY * rotateSpeed * TOUCH.orbitSensitivity;
    applyRotation(rotX, rotY);
    updateCamera();

    const smoothing = CAMERA.velocitySmoothingFactor;
    smoothedVelocityRef.current.x = getSmoothedVelocityComponent(smoothedVelocityRef.current.x, rotX, smoothing);
    smoothedVelocityRef.current.y = getSmoothedVelocityComponent(smoothedVelocityRef.current.y, rotY, smoothing);
    angularVelocityRef.current.x = smoothedVelocityRef.current.x;
    angularVelocityRef.current.y = smoothedVelocityRef.current.y;

    lastMouseRef.current = { x: touch.x, y: touch.y };
    lastTimeRef.current = performance.now();
  } else if (pointerCount === 2 && (touchGestureRef.current === 'pinch' || touchGestureRef.current === 'pan')) {
    const touches = Array.from(touchPointersRef.current.values());
    const currentDistance = getTouchDistance(touches[0], touches[1]);
    const currentCenter = getTouchCenter(touches[0], touches[1]);

    if (initialPinchDistanceRef.current > 0) {
      const scale = getPinchScale(initialPinchDistanceRef.current, currentDistance);

      if (shouldApplyPinchScale(scale, TOUCH.pinchThreshold)) {
        if (camera instanceof THREE.OrthographicCamera) {
          orthoZoomRef.current = getPinchZoomValue(initialPinchZoomRef.current, scale, 0.1, 10);
          setOrthographicZoom(camera, orthoZoomRef.current);
        } else if (cameraMode === 'fly') {
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuatRef.current);
          const moveAmount = (1 - scale) * radius * flySpeed * TOUCH.zoomSensitivity;
          moveCamera(camera, forward.multiplyScalar(moveAmount));
        } else {
          targetDistanceRef.current = Math.max(
            CONTROLS.minDistance,
            initialPinchZoomRef.current * scale
          );
        }
      }
    }

    const panDeltaX = currentCenter.x - lastTouchCenterRef.current.x;
    const panDeltaY = currentCenter.y - lastTouchCenterRef.current.y;

    if (hasPointerDelta({ x: panDeltaX, y: panDeltaY })) {
      navActions.clearNavigationHistory();

      const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuatRef.current);
      const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuatRef.current);

      if (cameraMode === 'orbit') {
        const panMultiplier = getPanMultiplier({
          cameraMode,
          distance: distanceRef.current,
          radius,
          panSpeed,
          flySpeed,
          sensitivity: TOUCH.panSensitivity,
        });
        const panOffset = getPanOffset(cameraRight, cameraUp, panDeltaX, panDeltaY, panMultiplier);
        targetVecRef.current.add(panOffset);
        updateCamera();
      } else {
        const panMultiplier = getPanMultiplier({
          cameraMode,
          distance: distanceRef.current,
          radius,
          panSpeed,
          flySpeed,
          sensitivity: TOUCH.panSensitivity,
        });
        const panOffset = getPanOffset(cameraRight, cameraUp, panDeltaX, panDeltaY, panMultiplier);
        moveCamera(camera, panOffset);
      }
    }

    lastTouchCenterRef.current = currentCenter;
  }
}

export function handleTrackballTouchEnd({
  event,
  angularVelocityRef,
  touchPointersRef,
  touchGestureRef,
  initialPinchDistanceRef,
  lastMouseRef,
  lastTimeRef,
  smoothedVelocityRef,
  draggingRef,
  isDraggingRef,
  isPanningRef,
}: TrackballTouchEndOptions): void {
  for (const touch of Array.from(event.changedTouches)) {
    touchPointersRef.current.delete(touch.identifier);
  }

  const remainingCount = touchPointersRef.current.size;

  if (remainingCount === 0) {
    draggingRef.current = false;

    if (touchGestureRef.current === 'drag') {
      const timeSinceLastMove = performance.now() - lastTimeRef.current;
      if (shouldClearMomentum(timeSinceLastMove, 50)) {
        angularVelocityRef.current.x = 0;
        angularVelocityRef.current.y = 0;
      }
    }

    isDraggingRef.current = false;
    isPanningRef.current = false;
    touchGestureRef.current = 'none';
    initialPinchDistanceRef.current = 0;
  } else if (remainingCount === 1) {
    touchGestureRef.current = 'drag';
    isDraggingRef.current = true;
    isPanningRef.current = false;

    const touch = Array.from(touchPointersRef.current.values())[0];
    lastMouseRef.current = { x: touch.x, y: touch.y };
    angularVelocityRef.current.x = 0;
    angularVelocityRef.current.y = 0;
    smoothedVelocityRef.current.x = 0;
    smoothedVelocityRef.current.y = 0;
  }
}

export function handleTrackballTouchCancel(options: TrackballTouchEndOptions): void {
  handleTrackballTouchEnd(options);
}
