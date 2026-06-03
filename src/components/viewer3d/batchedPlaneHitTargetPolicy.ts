import * as THREE from 'three';
import { TOUCH } from '../../theme/sizing';
import type { FrustumPlaneSize } from './cameraFrustumViewModel';

export interface PlaneHitTargetScaleOptions {
  planeSize: Pick<FrustumPlaneSize, 'width' | 'height'>;
  isSelected: boolean;
  touchMode: boolean;
  touchHitTargetScale?: number;
}

export interface ComposePlaneHitTargetMatrixOptions extends PlaneHitTargetScaleOptions {
  matrix: THREE.Matrix4;
  targetPosition: THREE.Vector3;
  targetForward: THREE.Vector3;
  targetScale: THREE.Vector3;
  frustumPosition: THREE.Vector3;
  frustumQuaternion: THREE.Quaternion;
  planeSize: FrustumPlaneSize;
}

export function getPlaneHitTargetScale({
  planeSize,
  isSelected,
  touchMode,
  touchHitTargetScale = TOUCH.hitTargetScale,
}: PlaneHitTargetScaleOptions): [number, number, number] {
  if (isSelected) return [0, 0, 0];

  const hitScale = touchMode ? touchHitTargetScale : 1;
  return [planeSize.width * hitScale, planeSize.height * hitScale, 1];
}

export function composePlaneHitTargetMatrix({
  matrix,
  targetPosition,
  targetForward,
  targetScale,
  frustumPosition,
  frustumQuaternion,
  planeSize,
  isSelected,
  touchMode,
  touchHitTargetScale,
}: ComposePlaneHitTargetMatrixOptions): THREE.Matrix4 {
  const [scaleX, scaleY, scaleZ] = getPlaneHitTargetScale({
    planeSize,
    isSelected,
    touchMode,
    touchHitTargetScale,
  });

  targetPosition.copy(frustumPosition);
  targetForward.set(0, 0, planeSize.depth);
  targetForward.applyQuaternion(frustumQuaternion);
  targetPosition.add(targetForward);
  targetScale.set(scaleX, scaleY, scaleZ);

  return matrix.compose(targetPosition, frustumQuaternion, targetScale);
}

export function getBatchedPlaneHitTargetMeshKey(
  frustumCount: number,
  firstImageId: number | null | undefined
): string {
  return `${frustumCount}-${firstImageId ?? 0}`;
}
