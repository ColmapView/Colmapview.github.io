import { useEffect, type MutableRefObject } from 'react';
import type * as THREE from 'three';
import type { CameraMode } from '../../store/types';
import { applyTrackballModeTransition } from './trackballCameraLifecyclePolicy';
import type { CameraRefs, MotionRefs } from './trackballCameraLifecycleTypes';

interface ModeSyncOptions extends CameraRefs, Pick<MotionRefs, 'angularVelocityRef' | 'flyVelocityRef'> {
  cameraMode: CameraMode;
  camera: THREE.Camera;
  keysPressedRef: MutableRefObject<Set<string>>;
}

export function useTrackballModeSync({
  cameraMode,
  camera,
  keysPressedRef,
  flyVelocityRef,
  targetVecRef,
  cameraQuatRef,
  distanceRef,
  targetDistanceRef,
  angularVelocityRef,
}: ModeSyncOptions): void {
  useEffect(() => {
    const nextDistance = applyTrackballModeTransition({
      cameraMode,
      camera,
      keysPressed: keysPressedRef.current,
      flyVelocity: flyVelocityRef.current,
      target: targetVecRef.current,
      cameraQuaternion: cameraQuatRef.current,
      distance: distanceRef.current,
      angularVelocity: angularVelocityRef.current,
    });

    if (nextDistance !== null) {
      distanceRef.current = nextDistance;
      targetDistanceRef.current = nextDistance;
    }
  }, [
    cameraMode,
    camera,
    keysPressedRef,
    flyVelocityRef,
    targetVecRef,
    cameraQuatRef,
    distanceRef,
    targetDistanceRef,
    angularVelocityRef,
  ]);
}
