import { useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  FRUSTUM_PLANE_CULL_CHECK_INTERVAL,
  getInitialFrustumPlaneCullFrame,
  getFrustumPlaneViewAngleOk,
  getNextFrustumPlaneCullFrame,
  shouldMeasureFrustumPlaneViewAngle,
  shouldUpdateFrustumPlaneViewAngle,
} from './frustumPlaneViewCullingPolicy';

const tempForward = new THREE.Vector3();
const tempViewDir = new THREE.Vector3();
const tempWorldPos = new THREE.Vector3();
const tempWorldQuat = new THREE.Quaternion();

interface FrustumPlaneViewAngleCullingOptions {
  enabled: boolean;
  isSelected: boolean;
  groupRef: RefObject<THREE.Group | null>;
  camera: THREE.Camera;
  scale: number;
  cullAngleThreshold: number;
  viewAngleOk: boolean;
  setViewAngleOk: Dispatch<SetStateAction<boolean>>;
  frameSeed?: number;
}

export function useFrustumPlaneViewAngleCulling({
  enabled,
  isSelected,
  groupRef,
  camera,
  scale,
  cullAngleThreshold,
  viewAngleOk,
  setViewAngleOk,
  frameSeed = 0,
}: FrustumPlaneViewAngleCullingOptions) {
  const frameCountRef = useRef(getInitialFrustumPlaneCullFrame({
    seed: frameSeed,
    interval: FRUSTUM_PLANE_CULL_CHECK_INTERVAL,
  }));

  useFrame(() => {
    if (!enabled || !groupRef.current) return;

    if (isSelected) {
      if (shouldUpdateFrustumPlaneViewAngle({ current: viewAngleOk, next: true })) {
        setViewAngleOk(true);
      }
      return;
    }

    frameCountRef.current = getNextFrustumPlaneCullFrame({
      frameCount: frameCountRef.current,
      interval: FRUSTUM_PLANE_CULL_CHECK_INTERVAL,
    });
    if (!shouldMeasureFrustumPlaneViewAngle(frameCountRef.current)) return;

    groupRef.current.getWorldPosition(tempWorldPos);
    groupRef.current.getWorldQuaternion(tempWorldQuat);

    tempForward.set(0, 0, 1).applyQuaternion(tempWorldQuat);
    tempViewDir.copy(camera.position).sub(tempWorldPos).normalize();

    const next = getFrustumPlaneViewAngleOk({
      isSelected,
      distanceToCamera: tempWorldPos.distanceTo(camera.position),
      closeDistance: scale * 3,
      dotProduct: -tempForward.dot(tempViewDir),
      cullAngleThreshold,
    });

    if (shouldUpdateFrustumPlaneViewAngle({ current: viewAngleOk, next })) {
      setViewAngleOk(next);
    }
  });
}
