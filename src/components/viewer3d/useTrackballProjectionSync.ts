import { useEffect, useRef, type MutableRefObject } from 'react';
import type * as THREE from 'three';
import type { CameraProjection } from '../../store/types';
import {
  createTrackballProjectionCamera,
  syncPerspectiveCameraFov,
} from './trackballCameraLifecyclePolicy';
import type { TrackballStateSetter } from './trackballCameraLifecycleTypes';

interface ProjectionSyncOptions {
  cameraProjection: CameraProjection;
  cameraFov: number;
  camera: THREE.Camera;
  size: { width: number; height: number };
  setTrackballState: TrackballStateSetter;
  distanceRef: MutableRefObject<number>;
  orthoZoomRef: MutableRefObject<number>;
  cameraQuatRef: MutableRefObject<THREE.Quaternion>;
}

export function useTrackballProjectionSync({
  cameraProjection,
  cameraFov,
  camera,
  size,
  setTrackballState,
  distanceRef,
  orthoZoomRef,
  cameraQuatRef,
}: ProjectionSyncOptions): void {
  const lastProjectionRef = useRef(cameraProjection);

  useEffect(() => {
    if (cameraProjection === lastProjectionRef.current) return;
    lastProjectionRef.current = cameraProjection;

    const aspect = size.width / size.height;
    const currentPosition = camera.position.clone();
    const currentQuaternion = camera.quaternion.clone();

    if (cameraProjection === 'orthographic') {
      orthoZoomRef.current = 1;
    }

    const newCamera = createTrackballProjectionCamera({
      projection: cameraProjection,
      cameraFov,
      aspect,
      distance: distanceRef.current,
      position: currentPosition,
      quaternion: currentQuaternion,
    });
    setTrackballState({ camera: newCamera });

    cameraQuatRef.current.copy(currentQuaternion);
  }, [
    cameraProjection,
    cameraFov,
    camera,
    setTrackballState,
    size.width,
    size.height,
    distanceRef,
    orthoZoomRef,
    cameraQuatRef,
  ]);

  useEffect(() => {
    syncPerspectiveCameraFov(camera, cameraFov);
  }, [cameraFov, camera]);
}
