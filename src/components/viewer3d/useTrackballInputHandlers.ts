import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import type { AutoRotateMode, CameraMode } from '../../store/types';
import {
  type TouchGesture,
  type TouchPointer,
} from './trackballControlsViewModel';
import type { TrackballAnimationTarget } from './useTrackballFlyTo';
import { useTrackballKeyboardHandlers } from './useTrackballKeyboardHandlers';
import { useTrackballPointerHandlers } from './useTrackballPointerHandlers';
import { useTrackballTouchHandlers } from './useTrackballTouchHandlers';
import { useTrackballWheelHandlers } from './useTrackballWheelHandlers';

interface XYValue {
  x: number;
  y: number;
}

interface TrackballInputHandlersOptions {
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
  zoomSpeed: number;
  applyRotation: (deltaX: number, deltaY: number) => void;
  updateCamera: () => void;
  isDraggingRef: MutableRefObject<boolean>;
  isPanningRef: MutableRefObject<boolean>;
  pointerLockRequestedRef: MutableRefObject<boolean>;
  targetVecRef: MutableRefObject<THREE.Vector3>;
  cameraQuatRef: MutableRefObject<THREE.Quaternion>;
  distanceRef: MutableRefObject<number>;
  targetDistanceRef: MutableRefObject<number>;
  orthoZoomRef: MutableRefObject<number>;
  angularVelocityRef: MutableRefObject<XYValue>;
  smoothedVelocityRef: MutableRefObject<XYValue>;
  lastMouseRef: MutableRefObject<XYValue>;
  lastTimeRef: MutableRefObject<number>;
  keysPressedRef: MutableRefObject<Set<string>>;
  wheelHandledRef: MutableRefObject<boolean>;
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
    setAutoRotateMode: (mode: AutoRotateMode) => void;
    clearNavigationHistory: () => void;
  };
  camerasActions: {
    setScale: (scale: number) => void;
  };
  pointsActions: {
    setSize: (size: number) => void;
  };
}

export function useTrackballInputHandlers({
  canvas,
  camera,
  cameraMode,
  flySpeed,
  pointerLock,
  pickingMode,
  radius,
  autoRotateMode,
  touchMode,
  rotateSpeed,
  panSpeed,
  zoomSpeed,
  applyRotation,
  updateCamera,
  isDraggingRef: isDragging,
  isPanningRef: isPanning,
  pointerLockRequestedRef: pointerLockRequested,
  targetVecRef: targetVec,
  cameraQuatRef: cameraQuat,
  distanceRef: distance,
  targetDistanceRef: targetDistance,
  orthoZoomRef: orthoZoom,
  angularVelocityRef: angularVelocity,
  smoothedVelocityRef: smoothedVelocity,
  lastMouseRef: lastMouse,
  lastTimeRef: lastTime,
  keysPressedRef: keysPressed,
  wheelHandledRef: wheelHandled,
  animationTargetRef: animationTarget,
  touchPointersRef: touchPointers,
  touchGestureRef: touchGesture,
  initialPinchDistanceRef: initialPinchDistance,
  initialPinchZoomRef: initialPinchZoom,
  lastTouchCenterRef: lastTouchCenter,
  lastDoubleTapTimeRef: lastDoubleTapTime,
  lastTapPositionRef: lastTapPosition,
  dragStartPositionRef: dragStartPosition,
  hasDragThresholdPassedRef: hasDragThresholdPassed,
  enabledRef: enabled,
  draggingRef: dragging,
  navActions,
  camerasActions,
  pointsActions,
}: TrackballInputHandlersOptions): void {
  useTrackballTouchHandlers({
    canvas,
    camera,
    cameraMode,
    flySpeed,
    radius,
    touchMode,
    rotateSpeed,
    panSpeed,
    applyRotation,
    updateCamera,
    isDraggingRef: isDragging,
    isPanningRef: isPanning,
    targetVecRef: targetVec,
    cameraQuatRef: cameraQuat,
    distanceRef: distance,
    targetDistanceRef: targetDistance,
    orthoZoomRef: orthoZoom,
    angularVelocityRef: angularVelocity,
    smoothedVelocityRef: smoothedVelocity,
    lastMouseRef: lastMouse,
    lastTimeRef: lastTime,
    animationTargetRef: animationTarget,
    touchPointersRef: touchPointers,
    touchGestureRef: touchGesture,
    initialPinchDistanceRef: initialPinchDistance,
    initialPinchZoomRef: initialPinchZoom,
    lastTouchCenterRef: lastTouchCenter,
    lastDoubleTapTimeRef: lastDoubleTapTime,
    lastTapPositionRef: lastTapPosition,
    dragStartPositionRef: dragStartPosition,
    hasDragThresholdPassedRef: hasDragThresholdPassed,
    enabledRef: enabled,
    draggingRef: dragging,
    navActions,
  });

  useTrackballKeyboardHandlers({
    enabledRef: enabled,
    keysPressedRef: keysPressed,
    animationTargetRef: animationTarget,
    navActions,
  });

  useTrackballWheelHandlers({
    canvas,
    camera,
    cameraMode,
    flySpeed,
    radius,
    zoomSpeed,
    cameraQuatRef: cameraQuat,
    targetDistanceRef: targetDistance,
    orthoZoomRef: orthoZoom,
    wheelHandledRef: wheelHandled,
    animationTargetRef: animationTarget,
    enabledRef: enabled,
    navActions,
    camerasActions,
    pointsActions,
  });

  useTrackballPointerHandlers({
    canvas,
    camera,
    cameraMode,
    flySpeed,
    pointerLock,
    pickingMode,
    radius,
    autoRotateMode,
    touchMode,
    rotateSpeed,
    panSpeed,
    applyRotation,
    updateCamera,
    isDraggingRef: isDragging,
    isPanningRef: isPanning,
    pointerLockRequestedRef: pointerLockRequested,
    targetVecRef: targetVec,
    cameraQuatRef: cameraQuat,
    distanceRef: distance,
    angularVelocityRef: angularVelocity,
    smoothedVelocityRef: smoothedVelocity,
    lastMouseRef: lastMouse,
    lastTimeRef: lastTime,
    animationTargetRef: animationTarget,
    enabledRef: enabled,
    draggingRef: dragging,
    navActions,
  });
}
