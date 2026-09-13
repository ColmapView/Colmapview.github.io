import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getFrustumPlaneCullDelay,
  getFrustumPlaneViewAngleOk,
  shouldUpdateFrustumPlaneViewAngle,
} from './frustumPlaneViewCullingPolicy';
import { requestSceneRender } from '../../utils/sceneRenderInvalidation';

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
}: FrustumPlaneViewAngleCullingOptions) {
  const lastCheckRef = useRef<number | null>(null);
  const lastCameraPosition = useRef(new THREE.Vector3());
  const lastWorldMatrix = useRef(new THREE.Matrix4());

  useEffect(() => {
    lastCheckRef.current = null;
    requestSceneRender();
  }, [enabled, isSelected, scale, cullAngleThreshold, camera]);

  useFrame(() => {
    if (!enabled || !groupRef.current) return;

    if (isSelected) {
      if (shouldUpdateFrustumPlaneViewAngle({ current: viewAngleOk, next: true })) {
        setViewAngleOk(true);
      }
      return;
    }

    const now = performance.now();
    const delay = getFrustumPlaneCullDelay(now, lastCheckRef.current);
    const cameraMoved = !lastCameraPosition.current.equals(camera.position);
    if (cameraMoved && delay > 0) {
      // Avoid walking every plane's ancestors while a camera update is still throttled.
      requestSceneRender(delay);
      return;
    }
    const group = groupRef.current;
    group.updateWorldMatrix(true, false);
    if (lastCheckRef.current !== null
      && !cameraMoved
      && lastWorldMatrix.current.equals(group.matrixWorld)) return;

    if (delay > 0) {
      // A shared timer completes the final dirty update even if camera motion stops here.
      requestSceneRender(delay);
      return;
    }
    lastCheckRef.current = now;
    lastCameraPosition.current.copy(camera.position);
    lastWorldMatrix.current.copy(group.matrixWorld);

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
      requestSceneRender();
    }
  });
}
