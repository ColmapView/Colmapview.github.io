import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { decodeCameraState } from '../../hooks/useUrlState';
import { appLogger } from '../../utils/logger';
import {
  applyTrackballUrlCameraState,
  shouldApplyTrackballUrlCameraState,
  shouldStartTrackballUrlCameraRestore,
} from './trackballUrlCameraRestorePolicy';

interface TrackballUrlCameraRestoreOptions {
  hasReconstruction: boolean;
  camera: THREE.Camera;
  targetVecRef: MutableRefObject<THREE.Vector3>;
  cameraQuatRef: MutableRefObject<THREE.Quaternion>;
  distanceRef: MutableRefObject<number>;
  targetDistanceRef: MutableRefObject<number>;
}

export function useTrackballUrlCameraRestore({
  hasReconstruction,
  camera,
  targetVecRef,
  cameraQuatRef,
  distanceRef,
  targetDistanceRef,
}: TrackballUrlCameraRestoreOptions): void {
  const hasRestoredFromUrlRef = useRef(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (!shouldStartTrackballUrlCameraRestore({
      hasRestoredFromUrl: hasRestoredFromUrlRef.current,
      hasReconstruction,
      hash,
    })) return;

    let disposed = false;

    decodeCameraState(hash).then((state) => {
      if (state === null) return;
      if (!shouldApplyTrackballUrlCameraState({
        disposed,
        state,
        hasRestoredFromUrl: hasRestoredFromUrlRef.current,
      })) return;

      hasRestoredFromUrlRef.current = true;
      applyTrackballUrlCameraState({
        state,
        camera,
        target: targetVecRef.current,
        cameraQuaternion: cameraQuatRef.current,
        distance: distanceRef,
        targetDistance: targetDistanceRef,
      });

      appLogger.info('[URL State] Restored camera state from URL hash');
    });

    return () => {
      disposed = true;
    };
  }, [
    hasReconstruction,
    camera,
    targetVecRef,
    cameraQuatRef,
    distanceRef,
    targetDistanceRef,
  ]);
}
