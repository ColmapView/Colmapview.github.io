import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useNavigationNode, useAxesNode, useCamerasNode } from '../../nodes';
import { useNavigationNodeActions, useCamerasNodeActions, usePointsNodeActions } from '../../nodes';
import { getCameraScaleValue } from './cameraFrustumViewModel';
import type { CameraViewState } from '../../store/types';
import { getWorldUp } from '../../utils/coordinateSystems';
import { CONTROLS } from '../../theme';
import type { ViewDirection } from '../../store/stores/uiStore';
import {
  buildCameraViewState,
  type TouchGesture,
  type TouchPointer,
} from './trackballControlsViewModel';
import {
  useTrackballModeSync,
  useTrackballProjectionSync,
  useTrackballViewResets,
  useTrackballViewStateSync,
} from './useTrackballCameraLifecycle';
import { useTrackballFlyTo, type TrackballAnimationTarget } from './useTrackballFlyTo';
import { useTrackballFrameLoop } from './useTrackballFrameLoop';
import { useTrackballInputHandlers } from './useTrackballInputHandlers';
import { useTrackballControlsStoreFacade } from './useTrackballControlsStoreFacade';

export interface TrackballControlsProps {
  target: [number, number, number];
  radius: number;
  resetTrigger: number;
  viewDirection?: ViewDirection | null;
  viewTrigger?: number;
}

export function TrackballControls({ target, radius, resetTrigger, viewDirection, viewTrigger = 0 }: TrackballControlsProps) {
  const { camera, gl, set, size } = useThree();
  const {
    data: {
      reconstruction,
      pickingMode,
      transform,
      touchMode,
    },
  } = useTrackballControlsStoreFacade();

  // Node hooks for reading state
  const nav = useNavigationNode();
  const axesNode = useAxesNode();
  const camerasNode = useCamerasNode();
  const navActions = useNavigationNodeActions();
  const camerasActions = useCamerasNodeActions();
  const pointsActions = usePointsNodeActions();

  // World-space frustum/photosphere scale (base × factor); drives the spherical outside-stop fly-to.
  const cameraScale = getCameraScaleValue(camerasNode.scale, camerasNode.scaleFactor);

  // Extract navigation state for convenience
  const {
    mode: cameraMode,
    projection: cameraProjection,
    fov: cameraFov,
    horizonLock,
    flySpeed,
    flyTransitionDuration,
    pointerLock,
    autoRotateMode,
    autoRotateSpeed,
    flyToImageId,
    flyToViewState,
  } = nav;

  // Coordinate system from axes node
  const axesCoordinateSystem = axesNode.coordinateSystem;

  // Compute world up vector based on coordinate system and horizon lock mode
  const worldUpVec = useMemo(() => {
    const up = getWorldUp(axesCoordinateSystem);
    const vec = new THREE.Vector3(...up);
    // Flip the up vector when in 'flip' mode
    if (horizonLock === 'flip') {
      vec.negate();
    }
    return vec;
  }, [axesCoordinateSystem, horizonLock]);

  const isDragging = useRef(false);
  const isPanning = useRef(false);
  const pointerLockRequested = useRef(false);
  const targetVec = useRef(new THREE.Vector3(...target));
  const cameraQuat = useRef(new THREE.Quaternion());
  const distance = useRef(5);
  const targetDistance = useRef(5);
  const orthoZoom = useRef(1); // Zoom level for orthographic camera
  const angularVelocity = useRef({ x: 0, y: 0 });
  const smoothedVelocity = useRef({ x: 0, y: 0 });
  const lastMouse = useRef({ x: 0, y: 0 });
  // Initialize with 0, will be set on first frame/interaction
  const lastTime = useRef(0);

  // Fly mode state
  const keysPressed = useRef<Set<string>>(new Set());
  const flyVelocity = useRef(new THREE.Vector3());

  // Ref to allow other components to signal that they handled a wheel event
  const wheelHandled = useRef(false);

  // Animation target for smooth fly-to transitions
  const animationTarget = useRef<TrackballAnimationTarget | null>(null);

  // Touch gesture state for multi-touch handling
  const touchPointers = useRef<Map<number, TouchPointer>>(new Map());
  const touchGesture = useRef<TouchGesture>('none');
  const initialPinchDistance = useRef(0);
  const initialPinchZoom = useRef(1);
  const lastTouchCenter = useRef({ x: 0, y: 0 });
  const lastDoubleTapTime = useRef(0);
  const lastTapPosition = useRef({ x: 0, y: 0 });
  const dragStartPosition = useRef({ x: 0, y: 0 });
  const hasDragThresholdPassed = useRef(false);

  // Ref for horizonLock to avoid stale closure in event handlers
  const horizonLockRef = useRef(horizonLock);

  // Ref for worldUpVec to avoid stale closure in event handlers
  const worldUpRef = useRef(worldUpVec);

  useEffect(() => {
    horizonLockRef.current = horizonLock;
    worldUpRef.current = worldUpVec;
  }, [horizonLock, worldUpVec]);

  // Controls enabled state - can be disabled by external components (e.g., TransformGizmo)
  const enabled = useRef(true);
  // Track dragging state - shared with other components to disable interactions during orbit
  const dragging = useRef(false);

  const rotateSpeed = CONTROLS.rotateSpeed;
  const panSpeed = CONTROLS.panSpeed;
  const zoomSpeed = CONTROLS.zoomSpeed;

  const { applyRotation, updateCamera } = useTrackballFrameLoop({
    camera,
    cameraMode,
    radius,
    flySpeed,
    autoRotateMode,
    autoRotateSpeed,
    axesCoordinateSystem,
    enabledRef: enabled,
    isDraggingRef: isDragging,
    horizonLockRef,
    worldUpRef,
    targetVecRef: targetVec,
    cameraQuatRef: cameraQuat,
    distanceRef: distance,
    targetDistanceRef: targetDistance,
    angularVelocityRef: angularVelocity,
    flyVelocityRef: flyVelocity,
    keysPressedRef: keysPressed,
    animationTargetRef: animationTarget,
  });

  useTrackballViewResets({
    target,
    radius,
    resetTrigger,
    viewDirection,
    viewTrigger,
    camera,
    horizonLock,
    worldUpVec,
    horizonLockRef,
    worldUpRef,
    targetVecRef: targetVec,
    cameraQuatRef: cameraQuat,
    distanceRef: distance,
    targetDistanceRef: targetDistance,
    angularVelocityRef: angularVelocity,
    flyVelocityRef: flyVelocity,
  });

  useTrackballProjectionSync({
    cameraProjection,
    cameraFov,
    camera,
    size,
    setTrackballState: set,
    distanceRef: distance,
    orthoZoomRef: orthoZoom,
    cameraQuatRef: cameraQuat,
  });

  useTrackballFlyTo({
    flyToImageId,
    flyToViewState,
    reconstruction,
    transform,
    horizonLock,
    worldUpVec,
    flyTransitionDuration,
    cameraScale,
    camera,
    targetVecRef: targetVec,
    cameraQuatRef: cameraQuat,
    distanceRef: distance,
    targetDistanceRef: targetDistance,
    angularVelocityRef: angularVelocity,
    flyVelocityRef: flyVelocity,
    animationTargetRef: animationTarget,
    navActions,
  });

  useTrackballModeSync({
    cameraMode,
    camera,
    keysPressedRef: keysPressed,
    flyVelocityRef: flyVelocity,
    targetVecRef: targetVec,
    cameraQuatRef: cameraQuat,
    distanceRef: distance,
    targetDistanceRef: targetDistance,
    angularVelocityRef: angularVelocity,
  });

  // Helper to get current view state
  const getCurrentViewState = useCallback(
    (): CameraViewState => buildCameraViewState(camera.position, cameraQuat.current, targetVec.current, distance.current),
    [camera]
  );

  useTrackballViewStateSync({
    camera,
    hasReconstruction: Boolean(reconstruction),
    enabledRef: enabled,
    draggingRef: dragging,
    wheelHandledRef: wheelHandled,
    isAnimatingRef: animationTarget,
    getCurrentViewState,
    setTrackballState: set,
    navActions,
    targetVecRef: targetVec,
    cameraQuatRef: cameraQuat,
    distanceRef: distance,
    targetDistanceRef: targetDistance,
  });

  useTrackballInputHandlers({
    canvas: gl.domElement,
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
  });

  return null;
}
