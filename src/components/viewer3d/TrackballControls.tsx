import { useRef, useEffect, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useReconstructionStore, useCameraStore, useTransformStore, useUIStore } from '../../store';
import { getImageWorldPose } from '../../utils/colmapTransforms';
import { createSim3dFromEuler } from '../../utils/sim3dTransforms';
import { getWorldUp } from './OriginVisualization';
import { CAMERA, CONTROLS } from '../../theme';
import type { ViewDirection } from '../../store/stores/uiStore';

// Camera offset and up vectors for each axis view
const AXIS_VIEWS: Record<'x' | 'y' | 'z', { offset: THREE.Vector3; up: THREE.Vector3 }> = {
  x: { offset: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  y: { offset: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
  z: { offset: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
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
  const flyToImageId = useCameraStore((s) => s.flyToImageId);
  const clearFlyTo = useCameraStore((s) => s.clearFlyTo);
  const cameraMode = useCameraStore((s) => s.cameraMode);
  const cameraProjection = useCameraStore((s) => s.cameraProjection);
  const cameraFov = useCameraStore((s) => s.cameraFov);
  const horizonLock = useCameraStore((s) => s.horizonLock);
  const flySpeed = useCameraStore((s) => s.flySpeed);
  const pointerLock = useCameraStore((s) => s.pointerLock);
  const autoRotateMode = useCameraStore((s) => s.autoRotateMode);
  const autoRotateSpeed = useCameraStore((s) => s.autoRotateSpeed);
  const setAutoRotateMode = useCameraStore((s) => s.setAutoRotateMode);
  const transform = useTransformStore((s) => s.transform);
  const axesCoordinateSystem = useUIStore((s) => s.axesCoordinateSystem);

  // Compute world up vector based on coordinate system
  const worldUpVec = useMemo(() => {
    const up = getWorldUp(axesCoordinateSystem);
    return new THREE.Vector3(...up);
  }, [axesCoordinateSystem]);

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
  const lastTime = useRef(performance.now());
  const lastFrameTime = useRef(performance.now());
  const quatX = useRef(new THREE.Quaternion());
  const quatY = useRef(new THREE.Quaternion());

  // Fly mode state
  const keysPressed = useRef<Set<string>>(new Set());
  const flyVelocity = useRef(new THREE.Vector3());

  // Ref to allow other components to signal that they handled a wheel event
  const wheelHandled = useRef(false);

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

    if (horizonLockRef.current) {
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

  const updateKeyboardMovement = (frameFlyDamping?: number) => {
    // Shift = speed boost
    const shiftMultiplier = keysPressed.current.has('shift') ? CONTROLS.shiftSpeedBoost : 1;
    const moveSpeed = radius * CONTROLS.moveSpeedMultiplier * flySpeed * shiftMultiplier;
    const acceleration = new THREE.Vector3();

    // Get camera direction vectors
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuat.current);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuat.current);
    const up = worldUpRef.current.clone();

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

      if (horizonLockRef.current) {
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

      if (horizonLockRef.current) {
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

      if (horizonLockRef.current) {
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

    if (horizonLock) {
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
      clearFlyTo();
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
    if (horizonLock) {
      const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(threeJsCamQuat);
      const lookTarget = transformedPos.clone().add(lookDir);
      const lookMatrix = new THREE.Matrix4();
      lookMatrix.lookAt(transformedPos, lookTarget, worldUpVec);
      threeJsCamQuat = new THREE.Quaternion().setFromRotationMatrix(lookMatrix);
    }

    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(threeJsCamQuat);
    const newTarget = transformedPos.clone().add(lookDir.multiplyScalar(distance.current));

    targetVec.current.copy(newTarget);
    cameraQuat.current.copy(threeJsCamQuat);
    angularVelocity.current.x = 0;
    angularVelocity.current.y = 0;
    flyVelocity.current.set(0, 0, 0);
    targetDistance.current = distance.current;

    // Set camera position and quaternion directly for both modes
    camera.position.copy(transformedPos);
    camera.quaternion.copy(threeJsCamQuat);

    clearFlyTo();
  }, [flyToImageId, reconstruction, clearFlyTo, camera, transform, horizonLock, worldUpVec]);

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

  // Register controls with R3F so other components (e.g., TransformGizmo) can access them
  useEffect(() => {
    const controls = { enabled, dragging, wheelHandled };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (set as (state: any) => void)({ controls });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => (set as (state: any) => void)({ controls: undefined });
  }, [set]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onMouseDown = (e: PointerEvent) => {
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

        if (cameraMode === 'fly') {
          // In fly mode, left click rotates the view
          if (button === 0) {
            isDragging.current = true;
            dragging.current = true;
            angularVelocity.current.x = 0;
            angularVelocity.current.y = 0;
            smoothedVelocity.current.x = 0;
            smoothedVelocity.current.y = 0;
            pointerLockRequested.current = false;
            // Turn off auto-rotate on manual interaction
            if (autoRotateMode !== 'off') setAutoRotateMode('off');
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
            if (autoRotateMode !== 'off') setAutoRotateMode('off');
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
        // Request pointer lock on first movement, not on mousedown
        // This allows clicks to pass through to 3D objects
        if (pointerLock && !pointerLockRequested.current && !isLocked) {
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

      if (isPanning.current && cameraMode === 'orbit') {
        const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuat.current);
        const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuat.current);

        const panMultiplier = distance.current * panSpeed;

        const panOffset = new THREE.Vector3()
          .addScaledVector(cameraRight, -deltaX * panMultiplier)
          .addScaledVector(cameraUp, deltaY * panMultiplier);

        targetVec.current.add(panOffset);
        updateCamera();
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

      const key = e.key.toLowerCase();
      // Only capture movement keys, ignore when typing in inputs
      if (['w', 'a', 's', 'd', 'q', 'e', ' ', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        if ((e.target as HTMLElement)?.tagName !== 'INPUT' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
          e.preventDefault();
          keysPressed.current.add(key);
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

    canvas.addEventListener('pointerdown', onMouseDown);
    document.addEventListener('pointerup', onMouseUp);
    document.addEventListener('pointermove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

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
    };
  }, [camera, gl, cameraMode, flySpeed, pointerLock, radius, autoRotateMode, setAutoRotateMode]);

  return null;
}
