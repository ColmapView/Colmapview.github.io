import { useEffect, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { Reconstruction } from '../../types/colmap';
import type { Sim3dEuler } from '../../types/sim3d';
import type { CameraViewState, HorizonLockMode } from '../../store/types';
import { getImageWorldPose } from '../../utils/colmapTransforms';
import { createSim3dFromEuler } from '../../utils/sim3dTransforms';
import { isSphericalCameraModel } from '../../utils/cameraModelRegistry';
import { computeSphericalFlyToPose } from './sphericalFlyTo';

export interface TrackballAnimationTarget {
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

interface AngularVelocity {
  x: number;
  y: number;
}

interface TrackballFlyToOptions {
  flyToImageId: number | null;
  flyToViewState: CameraViewState | null;
  reconstruction: Reconstruction | null;
  transform: Sim3dEuler;
  horizonLock: HorizonLockMode;
  worldUpVec: THREE.Vector3;
  flyTransitionDuration: number;
  cameraScale: number;
  camera: THREE.Camera;
  targetVecRef: MutableRefObject<THREE.Vector3>;
  cameraQuatRef: MutableRefObject<THREE.Quaternion>;
  distanceRef: MutableRefObject<number>;
  targetDistanceRef: MutableRefObject<number>;
  angularVelocityRef: MutableRefObject<AngularVelocity>;
  flyVelocityRef: MutableRefObject<THREE.Vector3>;
  animationTargetRef: MutableRefObject<TrackballAnimationTarget | null>;
  navActions: {
    clearFlyTo: () => void;
    clearFlyToViewState: () => void;
  };
}

interface FlyToPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  target: THREE.Vector3;
  distance: number;
}

function clearMotion(
  angularVelocityRef: MutableRefObject<AngularVelocity>,
  flyVelocityRef: MutableRefObject<THREE.Vector3>
): void {
  angularVelocityRef.current.x = 0;
  angularVelocityRef.current.y = 0;
  flyVelocityRef.current.set(0, 0, 0);
}

function setInstantPose(
  camera: THREE.Camera,
  pose: FlyToPose,
  targetVecRef: MutableRefObject<THREE.Vector3>,
  cameraQuatRef: MutableRefObject<THREE.Quaternion>,
  distanceRef: MutableRefObject<number>,
  targetDistanceRef: MutableRefObject<number>
): void {
  targetVecRef.current.copy(pose.target);
  cameraQuatRef.current.copy(pose.quaternion);
  distanceRef.current = pose.distance;
  targetDistanceRef.current = pose.distance;
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
}

function buildAnimationTarget(
  camera: THREE.Camera,
  targetVecRef: MutableRefObject<THREE.Vector3>,
  distanceRef: MutableRefObject<number>,
  pose: FlyToPose,
  duration: number
): TrackballAnimationTarget {
  return {
    startPosition: camera.position.clone(),
    startQuaternion: camera.quaternion.clone(),
    startTarget: targetVecRef.current.clone(),
    startDistance: distanceRef.current,
    endPosition: pose.position.clone(),
    endQuaternion: pose.quaternion.clone(),
    endTarget: pose.target.clone(),
    endDistance: pose.distance,
    startTime: performance.now(),
    duration,
  };
}

function applyPoseTransition(
  camera: THREE.Camera,
  pose: FlyToPose,
  flyTransitionDuration: number,
  targetVecRef: MutableRefObject<THREE.Vector3>,
  cameraQuatRef: MutableRefObject<THREE.Quaternion>,
  distanceRef: MutableRefObject<number>,
  targetDistanceRef: MutableRefObject<number>,
  animationTargetRef: MutableRefObject<TrackballAnimationTarget | null>
): void {
  if (flyTransitionDuration > 0) {
    animationTargetRef.current = buildAnimationTarget(camera, targetVecRef, distanceRef, pose, flyTransitionDuration);
    return;
  }

  setInstantPose(camera, pose, targetVecRef, cameraQuatRef, distanceRef, targetDistanceRef);
}

export function getImageFlyToPose(
  reconstruction: Reconstruction,
  imageId: number,
  transform: Sim3dEuler,
  horizonLock: HorizonLockMode,
  worldUpVec: THREE.Vector3,
  distance: number,
  cameraScale: number,
  currentViewerPos: THREE.Vector3,
  currentViewerQuat?: THREE.Quaternion
): FlyToPose | null {
  const image = reconstruction.images.get(imageId);
  if (!image) return null;

  const { position: cameraPosition, quaternion: worldFromCameraQuaternion } = getImageWorldPose(image);
  const sim3d = createSim3dFromEuler(transform);

  const transformedPosition = cameraPosition.clone()
    .applyQuaternion(sim3d.rotation)
    .multiplyScalar(sim3d.scale)
    .add(sim3d.translation);

  // Spherical (360°) cameras render as a FrontSide photosphere: a viewer AT the camera center
  // sees only back-face-culled grid lines. Stop OUTSIDE the sphere and orbit its center instead.
  // The photosphere lives inside the sim3d transform group, so its world radius is
  // cameraScale * sim3d.scale and its center is transformedPosition.
  const camera = reconstruction.cameras.get(image.cameraId);
  if (camera && isSphericalCameraModel(camera.modelId)) {
    const worldRadius = cameraScale * sim3d.scale;
    const { position, lookAt, distance: orbitDistance } = computeSphericalFlyToPose(
      transformedPosition,
      currentViewerPos,
      worldRadius
    );
    // Do NOT re-orient the scene: preserve the viewer's CURRENT up/roll. COLMAP world-up
    // is unreliable (gravity is often +Y, i.e. three.js "down"), so locking the look-at to
    // worldUpVec can flip the whole scene on fly-to (visual check 2026-07-02). Fall back to
    // worldUpVec only when the current up is unavailable or degenerate (parallel to the new
    // view direction).
    const viewDir = lookAt.clone().sub(position).normalize();
    let upForLook = worldUpVec;
    if (currentViewerQuat) {
      const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(currentViewerQuat);
      if (Math.abs(currentUp.dot(viewDir)) < 0.999) {
        upForLook = currentUp;
      }
    }
    const lookMatrix = new THREE.Matrix4().lookAt(position, lookAt, upForLook);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(lookMatrix);
    return { position, quaternion, target: lookAt, distance: orbitDistance };
  }

  const transformedQuaternion = sim3d.rotation.clone().multiply(worldFromCameraQuaternion);
  const flipRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  let threeCameraQuaternion = transformedQuaternion.clone().multiply(flipRotation);

  if (horizonLock !== 'off') {
    const lookDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(threeCameraQuaternion);
    const lookTarget = transformedPosition.clone().add(lookDirection);
    const lookMatrix = new THREE.Matrix4();
    lookMatrix.lookAt(transformedPosition, lookTarget, worldUpVec);
    threeCameraQuaternion = new THREE.Quaternion().setFromRotationMatrix(lookMatrix);
  }

  const lookDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(threeCameraQuaternion);

  return {
    position: transformedPosition,
    quaternion: threeCameraQuaternion,
    target: transformedPosition.clone().add(lookDirection.multiplyScalar(distance)),
    distance,
  };
}

function getViewStateFlyToPose(state: CameraViewState): FlyToPose {
  return {
    position: new THREE.Vector3(...state.position),
    quaternion: new THREE.Quaternion(...state.quaternion),
    target: new THREE.Vector3(...state.target),
    distance: state.distance,
  };
}

export function useTrackballFlyTo({
  flyToImageId,
  flyToViewState,
  reconstruction,
  transform,
  horizonLock,
  worldUpVec,
  flyTransitionDuration,
  cameraScale,
  camera,
  targetVecRef,
  cameraQuatRef,
  distanceRef,
  targetDistanceRef,
  angularVelocityRef,
  flyVelocityRef,
  animationTargetRef,
  navActions,
}: TrackballFlyToOptions): void {
  useEffect(() => {
    if (flyToImageId === null || !reconstruction) return;

    const pose = getImageFlyToPose(
      reconstruction,
      flyToImageId,
      transform,
      horizonLock,
      worldUpVec,
      distanceRef.current,
      cameraScale,
      camera.position,
      camera.quaternion
    );

    if (!pose) {
      navActions.clearFlyTo();
      return;
    }

    clearMotion(angularVelocityRef, flyVelocityRef);
    applyPoseTransition(
      camera,
      pose,
      flyTransitionDuration,
      targetVecRef,
      cameraQuatRef,
      distanceRef,
      targetDistanceRef,
      animationTargetRef
    );

    navActions.clearFlyTo();
  }, [
    flyToImageId,
    reconstruction,
    transform,
    horizonLock,
    worldUpVec,
    flyTransitionDuration,
    cameraScale,
    camera,
    targetVecRef,
    cameraQuatRef,
    distanceRef,
    targetDistanceRef,
    angularVelocityRef,
    flyVelocityRef,
    animationTargetRef,
    navActions,
  ]);

  useEffect(() => {
    if (!flyToViewState) return;

    clearMotion(angularVelocityRef, flyVelocityRef);
    applyPoseTransition(
      camera,
      getViewStateFlyToPose(flyToViewState),
      flyTransitionDuration,
      targetVecRef,
      cameraQuatRef,
      distanceRef,
      targetDistanceRef,
      animationTargetRef
    );

    navActions.clearFlyToViewState();
  }, [
    flyToViewState,
    flyTransitionDuration,
    camera,
    targetVecRef,
    cameraQuatRef,
    distanceRef,
    targetDistanceRef,
    angularVelocityRef,
    flyVelocityRef,
    animationTargetRef,
    navActions,
  ]);
}
