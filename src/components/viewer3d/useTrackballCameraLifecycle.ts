import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { ViewDirection } from '../../store/stores/uiStore';
import type { CameraViewState, HorizonLockMode } from '../../store/types';
import {
  buildCameraViewStateHash,
  getResetViewVectors,
  getViewDirectionVectors,
} from './trackballControlsViewModel';
import {
  applyTrackballViewVectors,
  clearTrackballMotion,
  getTrackballInitialDistance,
} from './trackballCameraLifecyclePolicy';
import type { CameraRefs, MotionRefs, TrackballStateSetter } from './trackballCameraLifecycleTypes';
export type { TrackballStateSetter } from './trackballCameraLifecycleTypes';
export { useTrackballModeSync } from './useTrackballModeSync';
export { useTrackballProjectionSync } from './useTrackballProjectionSync';
import { createTrackballControlsApi } from './trackballControlsApi';
import { useTrackballUrlCameraRestore } from './useTrackballUrlCameraRestore';

interface ViewResetOptions extends CameraRefs, MotionRefs {
  target: [number, number, number];
  radius: number;
  resetTrigger: number;
  viewDirection?: ViewDirection | null;
  viewTrigger: number;
  camera: THREE.Camera;
  horizonLock: HorizonLockMode;
  worldUpVec: THREE.Vector3;
  horizonLockRef: MutableRefObject<HorizonLockMode>;
  worldUpRef: MutableRefObject<THREE.Vector3>;
}

export function useTrackballViewResets({
  target,
  radius,
  resetTrigger,
  viewDirection,
  viewTrigger,
  camera,
  horizonLock,
  worldUpVec,
  horizonLockRef,
  worldUpRef,
  targetVecRef,
  cameraQuatRef,
  distanceRef,
  targetDistanceRef,
  angularVelocityRef,
  flyVelocityRef,
}: ViewResetOptions): void {
  const [targetX, targetY, targetZ] = target;
  const lastResetTriggerRef = useRef(resetTrigger);
  const lastViewTriggerRef = useRef(viewTrigger);
  const lastHorizonLockRef = useRef(horizonLock);

  useEffect(() => {
    targetVecRef.current.set(targetX, targetY, targetZ);
    const isReset = resetTrigger !== lastResetTriggerRef.current;
    lastResetTriggerRef.current = resetTrigger;

    if (!isReset && distanceRef.current !== 5) return;

    distanceRef.current = getTrackballInitialDistance(radius);
    targetDistanceRef.current = distanceRef.current;

    applyTrackballViewVectors(
      camera,
      targetVecRef.current,
      cameraQuatRef.current,
      getResetViewVectors(distanceRef.current, horizonLockRef.current !== 'off', worldUpRef.current)
    );
    clearTrackballMotion(angularVelocityRef.current, flyVelocityRef.current);
  }, [
    targetX,
    targetY,
    targetZ,
    radius,
    resetTrigger,
    camera,
    targetVecRef,
    cameraQuatRef,
    distanceRef,
    targetDistanceRef,
    horizonLockRef,
    worldUpRef,
    angularVelocityRef,
    flyVelocityRef,
  ]);

  useEffect(() => {
    const isTriggered = viewTrigger !== lastViewTriggerRef.current;
    lastViewTriggerRef.current = viewTrigger;

    if (!isTriggered || !viewDirection) return;

    targetVecRef.current.set(targetX, targetY, targetZ);
    distanceRef.current = getTrackballInitialDistance(radius);
    targetDistanceRef.current = distanceRef.current;

    applyTrackballViewVectors(
      camera,
      targetVecRef.current,
      cameraQuatRef.current,
      getViewDirectionVectors(
        viewDirection,
        distanceRef.current,
        horizonLockRef.current !== 'off',
        worldUpRef.current
      )
    );
    clearTrackballMotion(angularVelocityRef.current, flyVelocityRef.current);
  }, [
    targetX,
    targetY,
    targetZ,
    radius,
    viewTrigger,
    viewDirection,
    camera,
    targetVecRef,
    cameraQuatRef,
    distanceRef,
    targetDistanceRef,
    horizonLockRef,
    worldUpRef,
    angularVelocityRef,
    flyVelocityRef,
  ]);

  useEffect(() => {
    const modeChanged = lastHorizonLockRef.current !== horizonLock;
    lastHorizonLockRef.current = horizonLock;

    if (!modeChanged) return;

    distanceRef.current = getTrackballInitialDistance(radius);
    targetDistanceRef.current = distanceRef.current;

    applyTrackballViewVectors(
      camera,
      targetVecRef.current,
      cameraQuatRef.current,
      getResetViewVectors(distanceRef.current, horizonLock !== 'off', worldUpVec)
    );
    clearTrackballMotion(angularVelocityRef.current, flyVelocityRef.current);
  }, [
    horizonLock,
    camera,
    worldUpVec,
    radius,
    targetVecRef,
    cameraQuatRef,
    distanceRef,
    targetDistanceRef,
    angularVelocityRef,
    flyVelocityRef,
  ]);
}

interface ViewStateSyncOptions extends CameraRefs {
  camera: THREE.Camera;
  hasReconstruction: boolean;
  enabledRef: MutableRefObject<boolean>;
  draggingRef: MutableRefObject<boolean>;
  wheelHandledRef: MutableRefObject<boolean>;
  isAnimatingRef?: MutableRefObject<unknown>;
  getCurrentViewState: () => CameraViewState;
  setTrackballState: TrackballStateSetter;
  navActions: {
    setCurrentViewState: (state: CameraViewState) => void;
  };
}

export function useTrackballViewStateSync({
  camera,
  hasReconstruction,
  enabledRef,
  draggingRef,
  wheelHandledRef,
  isAnimatingRef,
  getCurrentViewState,
  setTrackballState,
  navActions,
  targetVecRef,
  cameraQuatRef,
  distanceRef,
  targetDistanceRef,
}: ViewStateSyncOptions): void {
  const lastSyncedStateRef = useRef('');

  useEffect(() => {
    const controls = createTrackballControlsApi({
      enabled: enabledRef,
      dragging: draggingRef,
      wheelHandled: wheelHandledRef,
      getCurrentViewState,
    });

    setTrackballState({ controls });
    return () => setTrackballState({ controls: null });
  }, [setTrackballState, enabledRef, draggingRef, wheelHandledRef, getCurrentViewState]);

  useTrackballUrlCameraRestore({
    hasReconstruction,
    camera,
    targetVecRef,
    cameraQuatRef,
    distanceRef,
    targetDistanceRef,
  });

  useEffect(() => {
    const syncViewState = () => {
      if (isAnimatingRef?.current) return;

      const state = getCurrentViewState();
      const stateHash = buildCameraViewStateHash(state);
      if (stateHash !== lastSyncedStateRef.current) {
        lastSyncedStateRef.current = stateHash;
        navActions.setCurrentViewState(state);
      }
    };

    syncViewState();
    const interval = setInterval(syncViewState, 500);

    return () => {
      clearInterval(interval);
    };
  }, [getCurrentViewState, isAnimatingRef, navActions]);
}
