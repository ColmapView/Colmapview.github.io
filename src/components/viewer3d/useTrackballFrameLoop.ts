import { useCallback, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AutoRotateMode, AxesCoordinateSystem, CameraMode, HorizonLockMode } from '../../store/types';
import { CAMERA, CONTROLS } from '../../theme';
import { getWorldUp } from '../../utils/coordinateSystems';
import {
  easeOutCubic,
  getKeyboardMovementAcceleration,
  getKeyboardMoveSpeed,
} from './trackballControlsViewModel';
import {
  getAutoRotateDelta,
  getCappedFrameDeltaMs,
  getFrameDamping,
  getOrbitDistanceStep,
  shouldApplyAngularVelocity,
  type XYVelocity,
} from './trackballFramePolicy';
import type { TrackballAnimationTarget } from './useTrackballFlyTo';

interface TrackballFrameLoopOptions {
  camera: THREE.Camera;
  cameraMode: CameraMode;
  radius: number;
  flySpeed: number;
  autoRotateMode: AutoRotateMode;
  autoRotateSpeed: number;
  axesCoordinateSystem: AxesCoordinateSystem;
  enabledRef: MutableRefObject<boolean>;
  isDraggingRef: MutableRefObject<boolean>;
  horizonLockRef: MutableRefObject<HorizonLockMode>;
  worldUpRef: MutableRefObject<THREE.Vector3>;
  targetVecRef: MutableRefObject<THREE.Vector3>;
  cameraQuatRef: MutableRefObject<THREE.Quaternion>;
  distanceRef: MutableRefObject<number>;
  targetDistanceRef: MutableRefObject<number>;
  angularVelocityRef: MutableRefObject<XYVelocity>;
  flyVelocityRef: MutableRefObject<THREE.Vector3>;
  keysPressedRef: MutableRefObject<Set<string>>;
  animationTargetRef: MutableRefObject<TrackballAnimationTarget | null>;
}

interface TrackballFrameLoopApi {
  applyRotation: (deltaX: number, deltaY: number) => void;
  updateCamera: () => void;
}

export function useTrackballFrameLoop({
  camera,
  cameraMode,
  radius,
  flySpeed,
  autoRotateMode,
  autoRotateSpeed,
  axesCoordinateSystem,
  enabledRef,
  isDraggingRef,
  horizonLockRef,
  worldUpRef,
  targetVecRef,
  cameraQuatRef,
  distanceRef,
  targetDistanceRef,
  angularVelocityRef,
  flyVelocityRef,
  keysPressedRef,
  animationTargetRef,
}: TrackballFrameLoopOptions): TrackballFrameLoopApi {
  const lastFrameTime = useRef(0);
  const quatX = useRef(new THREE.Quaternion());
  const quatY = useRef(new THREE.Quaternion());

  const absoluteWorldUp = useMemo(() => {
    const up = getWorldUp(axesCoordinateSystem);
    return new THREE.Vector3(...up);
  }, [axesCoordinateSystem]);

  const applyRotation = useCallback((deltaX: number, deltaY: number) => {
    if (Math.abs(deltaX) < 1e-10 && Math.abs(deltaY) < 1e-10) return;

    if (horizonLockRef.current !== 'off') {
      const worldUp = worldUpRef.current.clone();
      const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuatRef.current);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuatRef.current);
      const forwardDotUp = forward.dot(worldUp);
      const currentElevation = Math.asin(Math.max(-1, Math.min(1, -forwardDotUp)));
      const maxElevation = Math.PI / 2 - 0.02;
      const newElevation = currentElevation + deltaY;
      const clampedDeltaY = newElevation > maxElevation
        ? maxElevation - currentElevation
        : newElevation < -maxElevation
          ? -maxElevation - currentElevation
          : deltaY;

      quatY.current.setFromAxisAngle(worldUp, -deltaX);
      quatX.current.setFromAxisAngle(localX, -clampedDeltaY);
      cameraQuatRef.current.premultiply(quatX.current);
      cameraQuatRef.current.premultiply(quatY.current);
      cameraQuatRef.current.normalize();
      return;
    }

    const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuatRef.current);
    const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuatRef.current);

    quatY.current.setFromAxisAngle(localY, -deltaX);
    quatX.current.setFromAxisAngle(localX, -deltaY);
    cameraQuatRef.current.premultiply(quatX.current);
    cameraQuatRef.current.premultiply(quatY.current);
    cameraQuatRef.current.normalize();
  }, [cameraQuatRef, horizonLockRef, worldUpRef]);

  const updateCamera = useCallback(() => {
    if (cameraMode === 'orbit') {
      const offset = new THREE.Vector3(0, 0, distanceRef.current);
      offset.applyQuaternion(cameraQuatRef.current);

      camera.position.copy(targetVecRef.current).add(offset);
      camera.quaternion.copy(cameraQuatRef.current);
      return;
    }

    camera.quaternion.copy(cameraQuatRef.current);
  }, [camera, cameraMode, cameraQuatRef, distanceRef, targetVecRef]);

  const updateKeyboardMovement = useCallback((frameFlyDamping?: number) => {
    const moveSpeed = getKeyboardMoveSpeed(
      radius,
      CONTROLS.moveSpeedMultiplier,
      flySpeed,
      CONTROLS.shiftSpeedBoost,
      keysPressedRef.current
    );
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuatRef.current);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuatRef.current);
    const acceleration = getKeyboardMovementAcceleration(keysPressedRef.current, {
      forward,
      right,
      up: absoluteWorldUp,
    }, moveSpeed);

    flyVelocityRef.current.add(acceleration);
    flyVelocityRef.current.multiplyScalar(frameFlyDamping ?? CONTROLS.flyDamping);

    if (flyVelocityRef.current.length() <= 0.0001) return false;

    if (cameraMode === 'fly') {
      camera.position.add(flyVelocityRef.current);
    } else {
      targetVecRef.current.add(flyVelocityRef.current);
    }
    return true;
  }, [absoluteWorldUp, camera, cameraMode, cameraQuatRef, flySpeed, flyVelocityRef, keysPressedRef, radius, targetVecRef]);

  useFrame(() => {
    if (!enabledRef.current) {
      angularVelocityRef.current.x = 0;
      angularVelocityRef.current.y = 0;
      flyVelocityRef.current.set(0, 0, 0);
      animationTargetRef.current = null;
      return;
    }

    if (animationTargetRef.current) {
      const anim = animationTargetRef.current;
      const now = performance.now();
      const elapsed = now - anim.startTime;
      const progress = Math.min(elapsed / anim.duration, 1);
      const easedProgress = easeOutCubic(progress);

      camera.position.lerpVectors(anim.startPosition, anim.endPosition, easedProgress);
      camera.quaternion.slerpQuaternions(anim.startQuaternion, anim.endQuaternion, easedProgress);
      targetVecRef.current.lerpVectors(anim.startTarget, anim.endTarget, easedProgress);
      distanceRef.current = anim.startDistance + (anim.endDistance - anim.startDistance) * easedProgress;
      targetDistanceRef.current = distanceRef.current;
      cameraQuatRef.current.copy(camera.quaternion);

      if (progress >= 1) {
        animationTargetRef.current = null;
      }
      return;
    }

    let needsUpdate = false;
    const now = performance.now();
    const frameDeltaMs = getCappedFrameDeltaMs(now, lastFrameTime.current, 100);
    lastFrameTime.current = now;
    const frameDamping = getFrameDamping(CONTROLS.damping, frameDeltaMs, CAMERA.frameTimeMs);
    const frameFlyDamping = getFrameDamping(CONTROLS.flyDamping, frameDeltaMs, CAMERA.frameTimeMs);

    if (cameraMode === 'orbit') {
      const distanceStep = getOrbitDistanceStep(
        distanceRef.current,
        targetDistanceRef.current,
        0.0001,
        CAMERA.zoomTransitionFactor
      );
      if (distanceStep.changed) {
        distanceRef.current = distanceStep.distance;
        needsUpdate = true;
      }

      if (!isDraggingRef.current) {
        if (shouldApplyAngularVelocity(angularVelocityRef.current, CONTROLS.minVelocity)) {
          applyRotation(angularVelocityRef.current.x, angularVelocityRef.current.y);
          needsUpdate = true;
          angularVelocityRef.current.x *= frameDamping;
          angularVelocityRef.current.y *= frameDamping;
        } else if (autoRotateMode !== 'off') {
          const autoRotateDelta = getAutoRotateDelta(autoRotateMode, autoRotateSpeed, frameDeltaMs);
          quatY.current.setFromAxisAngle(worldUpRef.current, autoRotateDelta);
          cameraQuatRef.current.premultiply(quatY.current);
          cameraQuatRef.current.normalize();
          needsUpdate = true;
        }
      }

      if (updateKeyboardMovement(frameFlyDamping)) {
        needsUpdate = true;
      }

      if (needsUpdate) {
        updateCamera();
      }
      return;
    }

    let needsQuatUpdate = false;

    if (!isDraggingRef.current && shouldApplyAngularVelocity(angularVelocityRef.current, CONTROLS.minVelocity)) {
      applyRotation(angularVelocityRef.current.x, angularVelocityRef.current.y);
      needsQuatUpdate = true;
      angularVelocityRef.current.x *= frameDamping;
      angularVelocityRef.current.y *= frameDamping;
    }

    updateKeyboardMovement(frameFlyDamping);

    if (needsQuatUpdate) {
      camera.quaternion.copy(cameraQuatRef.current);
    }
  });

  return { applyRotation, updateCamera };
}
