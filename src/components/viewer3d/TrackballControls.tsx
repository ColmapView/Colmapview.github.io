import { useRef, useEffect, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useReconstructionStore, useTransformStore, usePointPickingStore, useCameraStore, usePointCloudStore, useUIStore } from '../../store';
import { useNavigationNode, useAxesNode } from '../../nodes';
import { useNavigationNodeActions, useCamerasNodeActions, usePointsNodeActions } from '../../nodes';
import { decodeCameraState } from '../../hooks/useUrlState';
import type { CameraViewState } from '../../store/types';
import { getImageWorldPose } from '../../utils/colmapTransforms';
import { createSim3dFromEuler } from '../../utils/sim3dTransforms';
import { getWorldUp } from '../../utils/coordinateSystems';
import { CAMERA, CONTROLS, TOUCH } from '../../theme';
import type { ViewDirection } from '../../store/stores/uiStore';

// Touch gesture state for multi-touch handling
interface TouchPointer {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
}

type TouchGesture = 'none' | 'drag' | 'pinch' | 'pan';

// Calculate distance between two touch points
function getTouchDistance(p1: TouchPointer, p2: TouchPointer): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Calculate center point between two touches
function getTouchCenter(p1: TouchPointer, p2: TouchPointer): { x: number; y: number } {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

// Easing function for smooth camera transitions
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Animation target type for fly-to transitions
interface AnimationTarget {
  startPosition: THREE.Vector3;
  startQuaternion: THREE.Quaternion;
  startTarget: THREE.Vector3;
  startDistance: number;
  endPosition: THREE.Vector3;
  endQuaternion: THREE.Quaternion;
  endTarget: THREE.Vector3;
  endDistance: number;
  startTime: number;
  duration: number;
}

// Camera offset and up vectors for each axis view
const AXIS_VIEWS: Record<'x' | 'y' | 'z' | '-x' | '-y' | '-z', { offset: THREE.Vector3; up: THREE.Vector3 }> = {
  'x': { offset: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  'y': { offset: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
  'z': { offset: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  '-x': { offset: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  '-y': { offset: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
  '-z': { offset: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
};

export interface TrackballControlsProps {
  target: [number, number, number];
  radius: number;
  resetTrigger: number;
  viewDirection?: ViewDirection | null;
  viewTrigger?: number;
}

export function TrackballControls({ target, radius, resetTrigger, viewDirection, viewTrigger = 0 }: TrackballControlsProps) {
  const { camera, gl, set, size } = useThree();
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const transform = useTransformStore((s) => s.transform);

  // Node hooks for reading state
  const nav = useNavigationNode();
  const axesNode = useAxesNode();
  const navActions = useNavigationNodeActions();
  const camerasActions = useCamerasNodeActions();
  const pointsActions = usePointsNodeActions();

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
  const lastResetTrigger = useRef(resetTrigger);
  const lastViewTrigger = useRef(viewTrigger);
  const lastProjection = useRef(cameraProjection);
  const orthoZoom = useRef(1); // Zoom level for orthographic camera
  const angularVelocity = useRef({ x: 0, y: 0 });
  const smoothedVelocity = useRef({ x: 0, y: 0 });
  const lastMouse = useRef({ x: 0, y: 0 });
  // Initialize with 0, will be set on first frame/interaction
  const lastTime = useRef(0);
  const lastFrameTime = useRef(0);
  const quatX = useRef(new THREE.Quaternion());
  const quatY = useRef(new THREE.Quaternion());

  // Fly mode state
  const keysPressed = useRef<Set<string>>(new Set());
  const flyVelocity = useRef(new THREE.Vector3());

  // Ref to allow other components to signal that they handled a wheel event
  const wheelHandled = useRef(false);

  // Animation target for smooth fly-to transitions
  const animationTarget = useRef<AnimationTarget | null>(null);

  // Touch gesture state for multi-touch handling
  const touchMode = useUIStore((s) => s.touchMode);
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
  horizonLockRef.current = horizonLock; // Keep ref in sync

  // Ref for worldUpVec to avoid stale closure in event handlers
  const worldUpRef = useRef(worldUpVec);
  worldUpRef.current = worldUpVec; // Keep ref in sync

  // Controls enabled state - can be disabled by external components (e.g., TransformGizmo)
  const enabled = useRef(true);
  // Track dragging state - shared with other components to disable interactions during orbit
  const dragging = useRef(false);

  const rotateSpeed = CONTROLS.rotateSpeed;
  const panSpeed = CONTROLS.panSpeed;
  const zoomSpeed = CONTROLS.zoomSpeed;
  const damping = CONTROLS.damping;
  const minVelocity = CONTROLS.minVelocity;
  const flyDamping = CONTROLS.flyDamping;

  const applyRotation = (deltaX: number, deltaY: number) => {
    if (Math.abs(deltaX) < 1e-10 && Math.abs(deltaY) < 1e-10) return;

    if (horizonLockRef.current !== 'off') {
      // Horizon lock: rotate around world up axis for horizontal, camera X for vertical
      const worldUp = worldUpRef.current.clone();
      const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuat.current);

      // Check current elevation to prevent flipping
      // Project forward onto world up to get elevation
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuat.current);
      const forwardDotUp = forward.dot(worldUp);
      const currentElevation = Math.asin(Math.max(-1, Math.min(1, -forwardDotUp)));

      // Clamp vertical rotation to prevent going past ±89 degrees
      const maxElevation = Math.PI / 2 - 0.02; // ~89 degrees
      const newElevation = currentElevation + deltaY;
      const clampedDeltaY = newElevation > maxElevation ? maxElevation - currentElevation :
                           newElevation < -maxElevation ? -maxElevation - currentElevation : deltaY;

      quatY.current.setFromAxisAngle(worldUp, -deltaX);
      quatX.current.setFromAxisAngle(localX, -clampedDeltaY);

      cameraQuat.current.premultiply(quatX.current);
      cameraQuat.current.premultiply(quatY.current);
      cameraQuat.current.normalize();
    } else {
      // Free rotation: rotate around camera-local axes
      const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuat.current);
      const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuat.current);

      quatY.current.setFromAxisAngle(localY, -deltaX);
      quatX.current.setFromAxisAngle(localX, -deltaY);

      cameraQuat.current.premultiply(quatX.current);
      cameraQuat.current.premultiply(quatY.current);
      cameraQuat.current.normalize();
    }
  };

  const updateCamera = () => {
    if (cameraMode === 'orbit') {
      const offset = new THREE.Vector3(0, 0, distance.current);
      offset.applyQuaternion(cameraQuat.current);

      camera.position.copy(targetVec.current).add(offset);
      camera.quaternion.copy(cameraQuat.current);
    } else {
      // Fly mode: camera position is independent, just update quaternion
      camera.quaternion.copy(cameraQuat.current);
    }
  };

  // Get the absolute (unflipped) world up for movement controls
  const absoluteWorldUp = useMemo(() => {
    const up = getWorldUp(axesCoordinateSystem);
    return new THREE.Vector3(...up);
  }, [axesCoordinateSystem]);

  const updateKeyboardMovement = (frameFlyDamping?: number) => {
    // Shift = speed boost
    const shiftMultiplier = keysPressed.current.has('shift') ? CONTROLS.shiftSpeedBoost : 1;
    const moveSpeed = radius * CONTROLS.moveSpeedMultiplier * flySpeed * shiftMultiplier;
    const acceleration = new THREE.Vector3();

    // Get camera direction vectors
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuat.current);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuat.current);
    // Use absolute world up for movement (not affected by horizon lock flip)
    const up = absoluteWorldUp.clone();

    // WASD movement
    if (keysPressed.current.has('w')) {
      acceleration.add(forward.clone().multiplyScalar(moveSpeed));
    }
    if (keysPressed.current.has('s')) {
      acceleration.add(forward.clone().multiplyScalar(-moveSpeed));
    }
    if (keysPressed.current.has('a')) {
      acceleration.add(right.clone().multiplyScalar(-moveSpeed));
    }
    if (keysPressed.current.has('d')) {
      acceleration.add(right.clone().multiplyScalar(moveSpeed));
    }
    // Q/E for down/up, Space also for up
    if (keysPressed.current.has('e') || keysPressed.current.has(' ')) {
      acceleration.add(up.clone().multiplyScalar(moveSpeed));
    }
    if (keysPressed.current.has('q')) {
      acceleration.add(up.clone().multiplyScalar(-moveSpeed));
    }

    // Apply acceleration and frame-rate independent damping
    flyVelocity.current.add(acceleration);
    flyVelocity.current.multiplyScalar(frameFlyDamping ?? flyDamping);

    // Update based on mode
    if (flyVelocity.current.length() > 0.0001) {
      if (cameraMode === 'fly') {
        // Fly mode: move camera position directly
        camera.position.add(flyVelocity.current);
      } else {
        // Orbit mode: move target (and camera follows)
        targetVec.current.add(flyVelocity.current);
      }
      return true;
    }
    return false;
  };

  useFrame(() => {
    // Skip ALL updates when disabled by external component (e.g., gizmo)
    if (!enabled.current) {
      // Clear momentum immediately when disabled
      angularVelocity.current.x = 0;
      angularVelocity.current.y = 0;
      flyVelocity.current.set(0, 0, 0);
      // Cancel any ongoing animation
      animationTarget.current = null;
      return;
    }

    // Handle smooth fly-to animation
    if (animationTarget.current) {
      const anim = animationTarget.current;
      const now = performance.now();
      const elapsed = now - anim.startTime;
      const progress = Math.min(elapsed / anim.duration, 1);
      const easedProgress = easeOutCubic(progress);

      // Interpolate position
      camera.position.lerpVectors(anim.startPosition, anim.endPosition, easedProgress);

      // Slerp quaternion
      camera.quaternion.slerpQuaternions(anim.startQuaternion, anim.endQuaternion, easedProgress);

      // Interpolate target and distance
      targetVec.current.lerpVectors(anim.startTarget, anim.endTarget, easedProgress);
      distance.current = anim.startDistance + (anim.endDistance - anim.startDistance) * easedProgress;
      targetDistance.current = distance.current;

      // Update internal quaternion ref to match
      cameraQuat.current.copy(camera.quaternion);

      // Animation complete
      if (progress >= 1) {
        animationTarget.current = null;
      }

      // Skip normal momentum updates during animation
      return;
    }

    let needsUpdate = false;

    // Calculate frame-rate independent damping factor
    const now = performance.now();
    const dt = Math.min(now - lastFrameTime.current, 100); // Cap at 100ms to handle tab switches
    lastFrameTime.current = now;
    const frameDamping = Math.pow(damping, dt / CAMERA.frameTimeMs);
    const frameFlyDamping = Math.pow(flyDamping, dt / CAMERA.frameTimeMs);

    if (cameraMode === 'orbit') {
      // Smooth zoom transition
      if (Math.abs(targetDistance.current - distance.current) > 0.0001) {
        distance.current += (targetDistance.current - distance.current) * CAMERA.zoomTransitionFactor;
        needsUpdate = true;
      }

      // Apply rotation inertia when not dragging
      if (!isDragging.current) {
        const vx = angularVelocity.current.x;
        const vy = angularVelocity.current.y;

        if (Math.abs(vx) > minVelocity || Math.abs(vy) > minVelocity) {
          applyRotation(vx, vy);
          needsUpdate = true;

          angularVelocity.current.x *= frameDamping;
          angularVelocity.current.y *= frameDamping;
        } else if (autoRotateMode !== 'off') {
          // Auto-rotate around world up axis when no user input
          const direction = autoRotateMode === 'cw' ? 1 : -1;
          const autoRotateDelta = direction * autoRotateSpeed * (dt / 1000); // Convert to per-frame
          // Rotate around world up axis (horizontal rotation only)
          quatY.current.setFromAxisAngle(worldUpRef.current, autoRotateDelta);
          cameraQuat.current.premultiply(quatY.current);
          cameraQuat.current.normalize();
          needsUpdate = true;
        }
      }

      // Handle keyboard movement (pans target in orbit mode)
      const keyboardMoved = updateKeyboardMovement(frameFlyDamping);
      if (keyboardMoved) {
        needsUpdate = true;
      }

      if (needsUpdate) {
        updateCamera();
      }
    } else {
      // Fly mode
      let needsQuatUpdate = false;

      // Apply rotation inertia when not dragging
      if (!isDragging.current) {
        const vx = angularVelocity.current.x;
        const vy = angularVelocity.current.y;

        if (Math.abs(vx) > minVelocity || Math.abs(vy) > minVelocity) {
          applyRotation(vx, vy);
          needsQuatUpdate = true;

          angularVelocity.current.x *= frameDamping;
          angularVelocity.current.y *= frameDamping;
        }
      }

      // Update position from keyboard/scroll movement
      updateKeyboardMovement(frameFlyDamping);

      // Only update quaternion once if needed
      if (needsQuatUpdate) {
        camera.quaternion.copy(cameraQuat.current);
      }
    }
  });

  useEffect(() => {
    targetVec.current.set(...target);
    const isReset = resetTrigger !== lastResetTrigger.current;
    lastResetTrigger.current = resetTrigger;

    if (isReset || distance.current === 5) {
      distance.current = Math.max(CONTROLS.minDistance, radius * CAMERA.initialDistanceMultiplier);
      targetDistance.current = distance.current;

      const sqrt2_2 = Math.SQRT1_2;
      let camOffset: THREE.Vector3;
      let upDir: THREE.Vector3;

      if (horizonLockRef.current !== 'off') {
        // Horizon lock mode: use world up from coordinate system
        const worldUp = worldUpRef.current.clone();
        camOffset = new THREE.Vector3(
          -0.5,
          -sqrt2_2 * worldUp.y,
          -0.5
        ).normalize().multiplyScalar(distance.current);
        upDir = worldUp;
      } else {
        // Regular mode: use original isometric view
        camOffset = new THREE.Vector3(-0.5, -sqrt2_2, -0.5).normalize()
          .multiplyScalar(distance.current);
        upDir = new THREE.Vector3(0.5, -sqrt2_2, 0.5).normalize();
      }

      const camPos = targetVec.current.clone().add(camOffset);
      const lookMatrix = new THREE.Matrix4();
      lookMatrix.lookAt(camPos, targetVec.current, upDir);
      cameraQuat.current.setFromRotationMatrix(lookMatrix);

      // Reset camera position and quaternion directly for both modes
      camera.position.copy(camPos);
      camera.quaternion.copy(cameraQuat.current);

      // Clear any movement velocities
      angularVelocity.current.x = 0;
      angularVelocity.current.y = 0;
      flyVelocity.current.set(0, 0, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally using array elements to avoid object reference issues
  }, [target[0], target[1], target[2], radius, resetTrigger, camera]);

  // Handle view direction changes (X/Y/Z axis views and reset)
  useEffect(() => {
    const isTriggered = viewTrigger !== lastViewTrigger.current;
    lastViewTrigger.current = viewTrigger;

    if (!isTriggered || !viewDirection) return;

    targetVec.current.set(...target);
    distance.current = Math.max(CONTROLS.minDistance, radius * CAMERA.initialDistanceMultiplier);
    targetDistance.current = distance.current;

    let camOffset: THREE.Vector3;
    let upDir: THREE.Vector3;

    if (viewDirection !== 'reset' && AXIS_VIEWS[viewDirection]) {
      // Axis view: position camera along axis looking at target
      const view = AXIS_VIEWS[viewDirection];

      if (horizonLockRef.current !== 'off') {
        // Horizon lock mode: use world up from coordinate system
        const worldUp = worldUpRef.current.clone();
        if (viewDirection === 'y') {
          // Looking along Y axis - use world up direction
          camOffset = worldUp.clone().multiplyScalar(distance.current);
          upDir = new THREE.Vector3(0, 0, -1);
        } else {
          camOffset = view.offset.clone().multiplyScalar(distance.current);
          upDir = worldUp.clone();
        }
      } else {
        // Regular mode: use original axis views
        camOffset = view.offset.clone().multiplyScalar(distance.current);
        upDir = view.up.clone();
      }
    } else {
      // Reset view
      const sqrt2_2 = Math.SQRT1_2;

      if (horizonLockRef.current !== 'off') {
        // Horizon lock mode: use world up from coordinate system
        const worldUp = worldUpRef.current.clone();
        camOffset = new THREE.Vector3(
          -0.5,
          -sqrt2_2 * worldUp.y,
          -0.5
        ).normalize().multiplyScalar(distance.current);
        upDir = worldUp.clone();
      } else {
        // Regular mode: use original isometric view
        camOffset = new THREE.Vector3(-0.5, -sqrt2_2, -0.5).normalize()
          .multiplyScalar(distance.current);
        upDir = new THREE.Vector3(0.5, -sqrt2_2, 0.5).normalize();
      }
    }

    const camPos = targetVec.current.clone().add(camOffset);
    const lookMatrix = new THREE.Matrix4();
    lookMatrix.lookAt(camPos, targetVec.current, upDir);
    cameraQuat.current.setFromRotationMatrix(lookMatrix);

    camera.position.copy(camPos);
    camera.quaternion.copy(cameraQuat.current);

    // Clear any movement velocities
    angularVelocity.current.x = 0;
    angularVelocity.current.y = 0;
    flyVelocity.current.set(0, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally using array elements to avoid object reference issues
  }, [target[0], target[1], target[2], radius, viewTrigger, viewDirection, camera]);

  // Handle camera projection switching (perspective <-> orthographic)
  useEffect(() => {
    if (cameraProjection === lastProjection.current) return;
    lastProjection.current = cameraProjection;

    const aspect = size.width / size.height;
    const currentPosition = camera.position.clone();
    const currentQuaternion = camera.quaternion.clone();

    if (cameraProjection === 'orthographic') {
      // Calculate frustum size based on current distance
      const frustumSize = distance.current;
      orthoZoom.current = 1;
      // Use larger far plane for orthographic (no perspective depth compression)
      const orthoFar = CAMERA.farPlane * 10;
      const newCamera = new THREE.OrthographicCamera(
        -frustumSize * aspect,
        frustumSize * aspect,
        frustumSize,
        -frustumSize,
        -orthoFar, // Negative near plane to see things behind camera
        orthoFar
      );
      newCamera.position.copy(currentPosition);
      newCamera.quaternion.copy(currentQuaternion);
      set({ camera: newCamera });
    } else {
      const newCamera = new THREE.PerspectiveCamera(
        cameraFov,
        aspect,
        CAMERA.nearPlane,
        CAMERA.farPlane
      );
      newCamera.position.copy(currentPosition);
      newCamera.quaternion.copy(currentQuaternion);
      set({ camera: newCamera });
    }

    // Update the cameraQuat ref to match
    cameraQuat.current.copy(currentQuaternion);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cameraFov intentionally omitted; FOV changes are handled by separate useEffect
  }, [cameraProjection, camera, set, size.width, size.height]);

  // Handle FOV changes for perspective camera
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = cameraFov;
      camera.updateProjectionMatrix();
    }
  }, [cameraFov, camera]);

  // Track previous horizon lock state
  const lastHorizonLock = useRef(horizonLock);

  // Reset view when horizon lock mode changes
  useEffect(() => {
    const modeChanged = lastHorizonLock.current !== horizonLock;
    lastHorizonLock.current = horizonLock;

    // Skip on initial mount
    if (!modeChanged) return;

    // Reset view with appropriate mode
    distance.current = Math.max(CONTROLS.minDistance, radius * CAMERA.initialDistanceMultiplier);
    targetDistance.current = distance.current;

    const sqrt2_2 = Math.SQRT1_2;
    let camOffset: THREE.Vector3;
    let upDir: THREE.Vector3;

    if (horizonLock !== 'off') {
      // Horizon lock mode: use world up from coordinate system
      const worldUp = worldUpVec.clone();
      camOffset = new THREE.Vector3(
        -0.5,
        -sqrt2_2 * worldUp.y,
        -0.5
      ).normalize().multiplyScalar(distance.current);
      upDir = worldUp;
    } else {
      // Regular mode: use original isometric view
      camOffset = new THREE.Vector3(-0.5, -sqrt2_2, -0.5).normalize()
        .multiplyScalar(distance.current);
      upDir = new THREE.Vector3(0.5, -sqrt2_2, 0.5).normalize();
    }

    const camPos = targetVec.current.clone().add(camOffset);
    const lookMatrix = new THREE.Matrix4();
    lookMatrix.lookAt(camPos, targetVec.current, upDir);
    cameraQuat.current.setFromRotationMatrix(lookMatrix);

    camera.position.copy(camPos);
    camera.quaternion.copy(cameraQuat.current);

    // Clear any momentum
    angularVelocity.current.x = 0;
    angularVelocity.current.y = 0;
    flyVelocity.current.set(0, 0, 0);
  }, [horizonLock, camera, worldUpVec, radius]);

  useEffect(() => {
    if (flyToImageId === null || !reconstruction) return;

    const image = reconstruction.images.get(flyToImageId);
    if (!image) {
      navActions.clearFlyTo();
      return;
    }

    const { position: camPos, quaternion: worldFromCamQuat } = getImageWorldPose(image);

    // Apply the current visual transform to the camera position and orientation
    const sim3d = createSim3dFromEuler(transform);

    // Transform position: p_new = scale * (rotation * p) + translation
    const transformedPos = camPos.clone()
      .applyQuaternion(sim3d.rotation)
      .multiplyScalar(sim3d.scale)
      .add(sim3d.translation);

    // Transform orientation: apply world rotation to camera quaternion
    const transformedQuat = sim3d.rotation.clone().multiply(worldFromCamQuat);

    const flipRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    let threeJsCamQuat = transformedQuat.clone().multiply(flipRotation);

    // When horizon lock is enabled, remove roll from the camera orientation
    // This ensures the horizon stays level after flying to the camera
    if (horizonLock !== 'off') {
      const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(threeJsCamQuat);
      const lookTarget = transformedPos.clone().add(lookDir);
      const lookMatrix = new THREE.Matrix4();
      lookMatrix.lookAt(transformedPos, lookTarget, worldUpVec);
      threeJsCamQuat = new THREE.Quaternion().setFromRotationMatrix(lookMatrix);
    }

    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(threeJsCamQuat);
    const newTarget = transformedPos.clone().add(lookDir.multiplyScalar(distance.current));

    // Clear velocities
    angularVelocity.current.x = 0;
    angularVelocity.current.y = 0;
    flyVelocity.current.set(0, 0, 0);

    if (flyTransitionDuration > 0) {
      // Animated transition
      animationTarget.current = {
        startPosition: camera.position.clone(),
        startQuaternion: camera.quaternion.clone(),
        startTarget: targetVec.current.clone(),
        startDistance: distance.current,
        endPosition: transformedPos.clone(),
        endQuaternion: threeJsCamQuat.clone(),
        endTarget: newTarget.clone(),
        endDistance: distance.current,
        startTime: performance.now(),
        duration: flyTransitionDuration,
      };
    } else {
      // Instant positioning (duration = 0)
      targetVec.current.copy(newTarget);
      cameraQuat.current.copy(threeJsCamQuat);
      targetDistance.current = distance.current;
      camera.position.copy(transformedPos);
      camera.quaternion.copy(threeJsCamQuat);
    }

    navActions.clearFlyTo();
  }, [flyToImageId, reconstruction, navActions, camera, transform, horizonLock, worldUpVec, flyTransitionDuration]);

  // Handle flyToViewState for navigation history back
  useEffect(() => {
    if (!flyToViewState) return;

    // Clear velocities
    angularVelocity.current.x = 0;
    angularVelocity.current.y = 0;
    flyVelocity.current.set(0, 0, 0);

    if (flyTransitionDuration > 0) {
      // Animated transition
      const endTarget = new THREE.Vector3(...flyToViewState.target);
      const endPosition = new THREE.Vector3(...flyToViewState.position);
      const endQuaternion = new THREE.Quaternion(...flyToViewState.quaternion);

      animationTarget.current = {
        startPosition: camera.position.clone(),
        startQuaternion: camera.quaternion.clone(),
        startTarget: targetVec.current.clone(),
        startDistance: distance.current,
        endPosition,
        endQuaternion,
        endTarget,
        endDistance: flyToViewState.distance,
        startTime: performance.now(),
        duration: flyTransitionDuration,
      };
    } else {
      // Instant positioning (duration = 0)
      targetVec.current.set(...flyToViewState.target);
      cameraQuat.current.set(...flyToViewState.quaternion);
      distance.current = flyToViewState.distance;
      targetDistance.current = flyToViewState.distance;
      camera.position.set(...flyToViewState.position);
      camera.quaternion.set(...flyToViewState.quaternion);
    }

    navActions.clearFlyToViewState();
  }, [flyToViewState, navActions, camera, flyTransitionDuration]);

  // Handle mode switching
  useEffect(() => {
    if (cameraMode === 'fly') {
      // Switching to fly mode: sync camera quaternion from current state
      cameraQuat.current.copy(camera.quaternion);
      flyVelocity.current.set(0, 0, 0);
      keysPressed.current.clear();
    } else {
      // Switching to orbit mode: calculate target position and distance from current camera
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      distance.current = Math.max(CONTROLS.minDistance, distance.current);
      targetDistance.current = distance.current;
      targetVec.current.copy(camera.position).add(forward.multiplyScalar(distance.current));
      cameraQuat.current.copy(camera.quaternion);
    }
    angularVelocity.current.x = 0;
    angularVelocity.current.y = 0;
  }, [cameraMode, camera]);

  // Helper to get current view state
  const getCurrentViewState = (): CameraViewState => ({
    position: [camera.position.x, camera.position.y, camera.position.z],
    quaternion: [cameraQuat.current.x, cameraQuat.current.y, cameraQuat.current.z, cameraQuat.current.w],
    target: [targetVec.current.x, targetVec.current.y, targetVec.current.z],
    distance: distance.current,
  });

  // Register controls with R3F so other components (e.g., TransformGizmo) can access them
  useEffect(() => {
    const controls = {
      enabled,
      dragging,
      wheelHandled,
      getCurrentViewState,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (set as (state: any) => void)({ controls });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => (set as (state: any) => void)({ controls: undefined });
  }, [set, camera]);

  // Restore camera state from URL hash on mount
  const hasRestoredFromUrl = useRef(false);

  useEffect(() => {
    if (hasRestoredFromUrl.current || !reconstruction) return;

    const hash = window.location.hash;
    if (!hash) return;

    // Async restore from URL hash
    decodeCameraState(hash).then((state) => {
      if (!state || hasRestoredFromUrl.current) return;

      hasRestoredFromUrl.current = true;

      // Use instant positioning (no animation) for initial URL restore
      targetVec.current.set(...state.target);
      cameraQuat.current.set(...state.quaternion);
      distance.current = state.distance;
      targetDistance.current = state.distance;
      camera.position.set(...state.position);
      camera.quaternion.set(...state.quaternion);

      console.log('[URL State] Restored camera state from URL hash');
    });
  }, [reconstruction, camera]);

  // Sync view state to store for components outside R3F context (e.g., ShareButtonStandalone)
  const viewStateSyncTimeout = useRef<number | null>(null);
  const lastSyncedState = useRef<string>('');

  useEffect(() => {
    const syncViewState = () => {
      const state = getCurrentViewState();
      // Simple hash to detect changes
      const stateHash = `${state.position.join(',')},${state.target.join(',')},${state.quaternion.join(',')}`;
      if (stateHash !== lastSyncedState.current) {
        lastSyncedState.current = stateHash;
        navActions.setCurrentViewState(state);
      }
    };

    // Sync on mount
    syncViewState();

    // Sync periodically (debounced via interval)
    const interval = setInterval(syncViewState, 500);

    return () => {
      clearInterval(interval);
      if (viewStateSyncTimeout.current) {
        clearTimeout(viewStateSyncTimeout.current);
      }
    };
  }, [camera, navActions]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onMouseDown = (e: PointerEvent) => {
      // In touch mode, ignore touch pointer events - let touch handlers handle them
      if (touchMode && e.pointerType === 'touch') return;

      // Store mouse state immediately for accurate tracking
      const button = e.button;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      lastTime.current = performance.now();

      // Defer drag decision to allow R3F synthetic events to fire first
      // R3F events (like gizmo's onPointerDown) fire synchronously during the same
      // event dispatch cycle, but AFTER this native listener. Using a microtask
      // ensures we check enabled.current AFTER R3F has had a chance to disable it.
      Promise.resolve().then(() => {
        // Check if controls were disabled by gizmo or other component
        if (!enabled.current) return;

        // Cancel any ongoing animation on user interaction
        animationTarget.current = null;

        if (cameraMode === 'fly') {
          // In fly mode:
          // - Left click (button 0): rotate/look around
          // - Right click (button 2) or Middle click (button 1): pan/strafe
          if (button === 0) {
            isDragging.current = true;
            dragging.current = true;
            angularVelocity.current.x = 0;
            angularVelocity.current.y = 0;
            smoothedVelocity.current.x = 0;
            smoothedVelocity.current.y = 0;
            pointerLockRequested.current = false;
            // Turn off auto-rotate on manual interaction
            if (autoRotateMode !== 'off') navActions.setAutoRotateMode('off');
          } else if (button === 2 || button === 1) {
            // Right click or middle click: pan (strafe)
            isPanning.current = true;
            dragging.current = true;
          }
        } else {
          // Orbit mode
          if (button === 0) {
            isDragging.current = true;
            dragging.current = true;
            angularVelocity.current.x = 0;
            angularVelocity.current.y = 0;
            smoothedVelocity.current.x = 0;
            smoothedVelocity.current.y = 0;
            // Turn off auto-rotate on manual interaction
            if (autoRotateMode !== 'off') navActions.setAutoRotateMode('off');
            pointerLockRequested.current = false;
          } else if (button === 2 || button === 1) {
            isPanning.current = true;
            dragging.current = true;
          }
        }
      });
    };

    const onMouseUp = () => {
      if (!isDragging.current && !isPanning.current) return;

      // Always clear dragging state immediately on mouse up
      dragging.current = false;

      // Don't apply momentum if controls were disabled (e.g., gizmo took over)
      if (!enabled.current) {
        // Just clear state without applying any rotation
        angularVelocity.current.x = 0;
        angularVelocity.current.y = 0;
        isDragging.current = false;
        isPanning.current = false;
        pointerLockRequested.current = false;
        return;
      }

      // Check time since last mouse movement - if user held still before release, clear momentum
      const timeSinceLastMove = performance.now() - lastTime.current;
      const MOVE_THRESHOLD_MS = 50; // If held still longer than this, no momentum

      if (timeSinceLastMove > MOVE_THRESHOLD_MS) {
        angularVelocity.current.x = 0;
        angularVelocity.current.y = 0;
      } else {
        // Apply one frame of momentum immediately to avoid gap
        applyRotation(angularVelocity.current.x, angularVelocity.current.y);
        updateCamera();
      }

      isDragging.current = false;
      isPanning.current = false;
      pointerLockRequested.current = false;

      // Exit pointer lock if active
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
    };

    const onPointerLockChange = () => {
      // If pointer lock was exited while still dragging (e.g., Escape), stop and clear momentum
      if (document.pointerLockElement !== canvas && isDragging.current) {
        angularVelocity.current.x = 0;
        angularVelocity.current.y = 0;
        smoothedVelocity.current.x = 0;
        smoothedVelocity.current.y = 0;
        isDragging.current = false;
        isPanning.current = false;
        dragging.current = false;
        pointerLockRequested.current = false;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      // Abort if controls were disabled after drag started (e.g., gizmo intercepted)
      if (!enabled.current) {
        if (isDragging.current || isPanning.current) {
          // Stop any in-progress drag immediately
          angularVelocity.current.x = 0;
          angularVelocity.current.y = 0;
          isDragging.current = false;
          isPanning.current = false;
          dragging.current = false;
        }
        return;
      }

      const now = performance.now();
      const isLocked = document.pointerLockElement === canvas;
      const deltaX = isLocked ? e.movementX : e.clientX - lastMouse.current.x;
      const deltaY = isLocked ? e.movementY : e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      lastTime.current = now;

      if (isDragging.current) {
        // Clear navigation history on first actual camera movement
        if (deltaX !== 0 || deltaY !== 0) {
          navActions.clearNavigationHistory();
        }

        // Request pointer lock on first movement, not on mousedown
        // This allows clicks to pass through to 3D objects
        // Disable pointer lock during point picking mode
        if (pointerLock && pickingMode === 'off' && !pointerLockRequested.current && !isLocked) {
          pointerLockRequested.current = true;
          canvas.requestPointerLock();
        }

        // Cap delta to prevent large jumps from frame drops or pointer lock entry
        const maxDelta = 50;
        const clampedDeltaX = Math.max(-maxDelta, Math.min(maxDelta, deltaX));
        const clampedDeltaY = Math.max(-maxDelta, Math.min(maxDelta, deltaY));

        const rotX = clampedDeltaX * rotateSpeed;
        const rotY = clampedDeltaY * rotateSpeed;
        applyRotation(rotX, rotY);
        updateCamera();

        // Smooth velocity for momentum using exponential moving average
        const smoothing = CAMERA.velocitySmoothingFactor;
        smoothedVelocity.current.x = smoothedVelocity.current.x * smoothing + rotX * (1 - smoothing);
        smoothedVelocity.current.y = smoothedVelocity.current.y * smoothing + rotY * (1 - smoothing);
        angularVelocity.current.x = smoothedVelocity.current.x;
        angularVelocity.current.y = smoothedVelocity.current.y;
      }

      if (isPanning.current) {
        // Clear navigation history on first actual camera movement
        if (deltaX !== 0 || deltaY !== 0) {
          navActions.clearNavigationHistory();
        }

        const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuat.current);
        const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuat.current);

        if (cameraMode === 'orbit') {
          // Orbit mode: pan moves the target
          const panMultiplier = distance.current * panSpeed;

          const panOffset = new THREE.Vector3()
            .addScaledVector(cameraRight, -deltaX * panMultiplier)
            .addScaledVector(cameraUp, deltaY * panMultiplier);

          targetVec.current.add(panOffset);
          updateCamera();
        } else {
          // Fly mode: pan strafes the camera position directly
          // Shift = speed boost (same as keyboard movement)
          const shiftMultiplier = e.shiftKey ? CONTROLS.shiftSpeedBoost : 1;
          const panMultiplier = radius * panSpeed * flySpeed * shiftMultiplier;

          const panOffset = new THREE.Vector3()
            .addScaledVector(cameraRight, -deltaX * panMultiplier)
            .addScaledVector(cameraUp, deltaY * panMultiplier);

          camera.position.add(panOffset);
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      // Don't handle if already handled (e.g., FOV adjustment on selected image)
      if (e.defaultPrevented || wheelHandled.current) {
        wheelHandled.current = false;
        return;
      }
      e.preventDefault();
      // Don't zoom if controls are disabled
      if (!enabled.current) return;

      // Alt + scroll: adjust camera frustum size (COLMAP-style)
      if (e.altKey) {
        const currentScale = useCameraStore.getState().cameraScale;
        const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.01, Math.min(10, currentScale * scaleFactor));
        camerasActions.setScale(newScale);
        return;
      }

      // Ctrl + scroll: adjust point cloud size (COLMAP-style)
      if (e.ctrlKey) {
        const currentSize = usePointCloudStore.getState().pointSize;
        const sizeFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newSize = Math.max(0.1, Math.min(50, currentSize * sizeFactor));
        pointsActions.setSize(newSize);
        return;
      }

      // Clear navigation history on manual camera movement
      navActions.clearNavigationHistory();
      // Cancel any ongoing animation on wheel
      animationTarget.current = null;

      if (cameraMode === 'fly') {
        // In fly mode, wheel moves camera forward/backward
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuat.current);
        const moveAmount = -e.deltaY * radius * CONTROLS.wheelMoveMultiplier * flySpeed;
        camera.position.add(forward.multiplyScalar(moveAmount));
      } else if (camera instanceof THREE.OrthographicCamera) {
        // For orthographic, adjust zoom level
        const zoomFactor = 1 + e.deltaY * zoomSpeed;
        orthoZoom.current = Math.max(0.1, Math.min(10, orthoZoom.current / zoomFactor));
        camera.zoom = orthoZoom.current;
        camera.updateProjectionMatrix();
      } else {
        const zoomFactor = 1 + e.deltaY * zoomSpeed;
        targetDistance.current = Math.max(CONTROLS.minDistance, targetDistance.current * zoomFactor);
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Keyboard event handlers for both modes
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't accept keyboard input if controls are disabled
      if (!enabled.current) return;

      // Ignore movement keys when Ctrl/Meta is pressed (allow hotkey combos like Ctrl+Shift+E)
      if (e.ctrlKey || e.metaKey) return;

      const key = e.key.toLowerCase();
      // Only capture movement keys, ignore when typing in inputs
      if (['w', 'a', 's', 'd', 'q', 'e', ' ', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        if ((e.target as HTMLElement)?.tagName !== 'INPUT' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          keysPressed.current.add(key);
          // Clear navigation history on movement keys (not shift alone)
          if (key !== 'shift') {
            navActions.clearNavigationHistory();
            // Cancel any ongoing animation on movement key press
            animationTarget.current = null;
          }
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysPressed.current.delete(key);
    };

    const onBlur = () => {
      keysPressed.current.clear();
    };

    // Touch event handlers for multi-touch gestures
    const onTouchStart = (e: TouchEvent) => {
      if (!touchMode || !enabled.current) return;

      // Track all active touches
      for (const touch of Array.from(e.changedTouches)) {
        touchPointers.current.set(touch.identifier, {
          id: touch.identifier,
          x: touch.clientX,
          y: touch.clientY,
          startX: touch.clientX,
          startY: touch.clientY,
        });
      }

      const pointerCount = touchPointers.current.size;

      if (pointerCount === 1) {
        const touch = Array.from(touchPointers.current.values())[0];
        const now = performance.now();

        // Check for double tap with position validation
        const tapDeltaX = touch.x - lastTapPosition.current.x;
        const tapDeltaY = touch.y - lastTapPosition.current.y;
        const tapDistance = Math.sqrt(tapDeltaX * tapDeltaX + tapDeltaY * tapDeltaY);
        const withinDoubleTapDistance = tapDistance < 30; // Max 30px between taps

        if (now - lastDoubleTapTime.current < TOUCH.doubleTapDelay && withinDoubleTapDistance) {
          // Double tap detected - reset view
          useUIStore.getState().resetView();
          lastDoubleTapTime.current = 0;
          lastTapPosition.current = { x: 0, y: 0 };
          touchPointers.current.clear();
          touchGesture.current = 'none';
          return;
        }
        lastDoubleTapTime.current = now;
        lastTapPosition.current = { x: touch.x, y: touch.y };

        // Start drag gesture (orbit) - but don't apply rotation until threshold passed
        touchGesture.current = 'drag';
        isDragging.current = true;
        dragging.current = true;
        hasDragThresholdPassed.current = false;
        angularVelocity.current.x = 0;
        angularVelocity.current.y = 0;
        smoothedVelocity.current.x = 0;
        smoothedVelocity.current.y = 0;

        dragStartPosition.current = { x: touch.x, y: touch.y };
        lastMouse.current = { x: touch.x, y: touch.y };
        lastTime.current = performance.now();

        // Turn off auto-rotate on manual interaction
        if (autoRotateMode !== 'off') navActions.setAutoRotateMode('off');
        // Cancel any ongoing animation
        animationTarget.current = null;
      } else if (pointerCount === 2) {
        // Two touches - start pinch/pan gesture
        const touches = Array.from(touchPointers.current.values());
        initialPinchDistance.current = getTouchDistance(touches[0], touches[1]);
        initialPinchZoom.current = camera instanceof THREE.OrthographicCamera
          ? orthoZoom.current
          : targetDistance.current;
        lastTouchCenter.current = getTouchCenter(touches[0], touches[1]);

        // Switch from drag to pinch/pan
        touchGesture.current = 'pinch';
        isDragging.current = false;
        isPanning.current = true;
        dragging.current = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchMode || !enabled.current) return;

      // Update tracked touches
      for (const touch of Array.from(e.changedTouches)) {
        const tracked = touchPointers.current.get(touch.identifier);
        if (tracked) {
          tracked.x = touch.clientX;
          tracked.y = touch.clientY;
        }
      }

      const pointerCount = touchPointers.current.size;

      if (pointerCount === 1 && touchGesture.current === 'drag') {
        // Single finger drag - orbit
        const touch = Array.from(touchPointers.current.values())[0];

        // Check if drag threshold has been passed
        if (!hasDragThresholdPassed.current) {
          const totalDragX = touch.x - dragStartPosition.current.x;
          const totalDragY = touch.y - dragStartPosition.current.y;
          const totalDragDistance = Math.sqrt(totalDragX * totalDragX + totalDragY * totalDragY);

          if (totalDragDistance < TOUCH.dragThreshold) {
            // Still within threshold - don't start orbiting yet
            return;
          }
          // Threshold passed - start applying rotation
          hasDragThresholdPassed.current = true;
          // Reset lastMouse to current position to avoid jump
          lastMouse.current = { x: touch.x, y: touch.y };
        }

        const deltaX = touch.x - lastMouse.current.x;
        const deltaY = touch.y - lastMouse.current.y;

        if (deltaX !== 0 || deltaY !== 0) {
          navActions.clearNavigationHistory();
        }

        // Apply orbit rotation with touch sensitivity
        const rotX = deltaX * rotateSpeed * TOUCH.orbitSensitivity;
        const rotY = deltaY * rotateSpeed * TOUCH.orbitSensitivity;
        applyRotation(rotX, rotY);
        updateCamera();

        // Update velocity for momentum
        const smoothing = CAMERA.velocitySmoothingFactor;
        smoothedVelocity.current.x = smoothedVelocity.current.x * smoothing + rotX * (1 - smoothing);
        smoothedVelocity.current.y = smoothedVelocity.current.y * smoothing + rotY * (1 - smoothing);
        angularVelocity.current.x = smoothedVelocity.current.x;
        angularVelocity.current.y = smoothedVelocity.current.y;

        lastMouse.current = { x: touch.x, y: touch.y };
        lastTime.current = performance.now();
      } else if (pointerCount === 2 && (touchGesture.current === 'pinch' || touchGesture.current === 'pan')) {
        // Two finger gesture - pinch to zoom + pan
        const touches = Array.from(touchPointers.current.values());
        const currentDistance = getTouchDistance(touches[0], touches[1]);
        const currentCenter = getTouchCenter(touches[0], touches[1]);

        // Pinch zoom - only apply if change exceeds threshold
        if (initialPinchDistance.current > 0) {
          const scale = initialPinchDistance.current / currentDistance;
          const scaleChange = Math.abs(1 - scale);

          // Only apply zoom if pinch change exceeds threshold
          if (scaleChange > TOUCH.pinchThreshold) {
            if (camera instanceof THREE.OrthographicCamera) {
              orthoZoom.current = Math.max(0.1, Math.min(10, initialPinchZoom.current * scale));
              camera.zoom = orthoZoom.current;
              camera.updateProjectionMatrix();
            } else if (cameraMode === 'fly') {
              // In fly mode, pinch moves camera forward/backward along look direction
              const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuat.current);
              const moveAmount = (1 - scale) * radius * flySpeed * TOUCH.zoomSensitivity;
              camera.position.add(forward.multiplyScalar(moveAmount));
            } else {
              // Simplified zoom formula for better linearity
              targetDistance.current = Math.max(
                CONTROLS.minDistance,
                initialPinchZoom.current * scale
              );
            }
          }
        }

        // Two-finger pan
        const panDeltaX = currentCenter.x - lastTouchCenter.current.x;
        const panDeltaY = currentCenter.y - lastTouchCenter.current.y;

        if (panDeltaX !== 0 || panDeltaY !== 0) {
          navActions.clearNavigationHistory();

          const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuat.current);
          const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuat.current);

          if (cameraMode === 'orbit') {
            const panMultiplier = distance.current * panSpeed * TOUCH.panSensitivity;
            const panOffset = new THREE.Vector3()
              .addScaledVector(cameraRight, -panDeltaX * panMultiplier)
              .addScaledVector(cameraUp, panDeltaY * panMultiplier);
            targetVec.current.add(panOffset);
            updateCamera();
          } else {
            // Fly mode
            const panMultiplier = radius * panSpeed * flySpeed * TOUCH.panSensitivity;
            const panOffset = new THREE.Vector3()
              .addScaledVector(cameraRight, -panDeltaX * panMultiplier)
              .addScaledVector(cameraUp, panDeltaY * panMultiplier);
            camera.position.add(panOffset);
          }
        }

        lastTouchCenter.current = currentCenter;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchMode) return;

      // Remove ended touches
      for (const touch of Array.from(e.changedTouches)) {
        touchPointers.current.delete(touch.identifier);
      }

      const remainingCount = touchPointers.current.size;

      if (remainingCount === 0) {
        // All touches ended
        dragging.current = false;

        // Apply momentum for single finger drag
        if (touchGesture.current === 'drag') {
          const timeSinceLastMove = performance.now() - lastTime.current;
          if (timeSinceLastMove > 50) {
            angularVelocity.current.x = 0;
            angularVelocity.current.y = 0;
          }
        }

        isDragging.current = false;
        isPanning.current = false;
        touchGesture.current = 'none';
        initialPinchDistance.current = 0;
      } else if (remainingCount === 1) {
        // Went from 2 touches to 1 - switch back to drag
        touchGesture.current = 'drag';
        isDragging.current = true;
        isPanning.current = false;

        const touch = Array.from(touchPointers.current.values())[0];
        lastMouse.current = { x: touch.x, y: touch.y };
        angularVelocity.current.x = 0;
        angularVelocity.current.y = 0;
        smoothedVelocity.current.x = 0;
        smoothedVelocity.current.y = 0;
      }
    };

    const onTouchCancel = (e: TouchEvent) => {
      // Treat cancel same as end
      onTouchEnd(e);
    };

    canvas.addEventListener('pointerdown', onMouseDown);
    document.addEventListener('pointerup', onMouseUp);
    document.addEventListener('pointermove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // Touch event listeners (only when touch mode is active)
    if (touchMode) {
      canvas.addEventListener('touchstart', onTouchStart, { passive: true });
      canvas.addEventListener('touchmove', onTouchMove, { passive: true });
      canvas.addEventListener('touchend', onTouchEnd, { passive: true });
      canvas.addEventListener('touchcancel', onTouchCancel, { passive: true });
    }

    return () => {
      canvas.removeEventListener('pointerdown', onMouseDown);
      document.removeEventListener('pointerup', onMouseUp);
      document.removeEventListener('pointermove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);

      // Remove touch listeners
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Control constants (rotateSpeed, panSpeed, etc.) are stable and don't need to be dependencies. Action hooks are stable.
  }, [camera, gl, cameraMode, flySpeed, pointerLock, pickingMode, radius, autoRotateMode, navActions, camerasActions, pointsActions, touchMode]);

  return null;
}
