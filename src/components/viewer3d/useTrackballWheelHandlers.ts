import { useEffect, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useCameraStore, usePointCloudStore } from '../../store';
import { useLatestRef } from '../../hooks/useLatestRef';
import { CONTROLS } from '../../theme';
import type { CameraMode } from '../../store/types';
import {
  getFlyWheelMoveAmount,
  getOrthoWheelZoom,
  getPerspectiveWheelDistance,
  getWheelAdjustedValue,
  getWheelIntent,
} from './trackballControlsViewModel';
import { moveCamera, setOrthographicZoom } from './trackballCameraMutations';
import type { TrackballAnimationTarget } from './useTrackballFlyTo';

interface TrackballWheelHandlersOptions {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  cameraMode: CameraMode;
  flySpeed: number;
  radius: number;
  zoomSpeed: number;
  cameraQuatRef: MutableRefObject<THREE.Quaternion>;
  targetDistanceRef: MutableRefObject<number>;
  orthoZoomRef: MutableRefObject<number>;
  wheelHandledRef: MutableRefObject<boolean>;
  animationTargetRef: MutableRefObject<TrackballAnimationTarget | null>;
  enabledRef: MutableRefObject<boolean>;
  navActions: {
    clearNavigationHistory: () => void;
  };
  camerasActions: {
    setScale: (scale: number) => void;
  };
  pointsActions: {
    setSize: (size: number) => void;
  };
}

interface TrackballWheelEventOptions extends Omit<TrackballWheelHandlersOptions, 'canvas'> {
  event: WheelEvent;
}

export function handleTrackballWheel({
  event,
  camera,
  cameraMode,
  flySpeed,
  radius,
  zoomSpeed,
  cameraQuatRef,
  targetDistanceRef,
  orthoZoomRef,
  wheelHandledRef,
  animationTargetRef,
  enabledRef,
  navActions,
  camerasActions,
  pointsActions,
}: TrackballWheelEventOptions): void {
  if (event.defaultPrevented || wheelHandledRef.current) {
    wheelHandledRef.current = false;
    return;
  }

  event.preventDefault();
  if (!enabledRef.current) return;

  const wheelIntent = getWheelIntent(event.altKey, event.ctrlKey);

  if (wheelIntent === 'cameraScale') {
    const currentScale = useCameraStore.getState().cameraScale;
    camerasActions.setScale(getWheelAdjustedValue(currentScale, event.deltaY, 0.01, 10));
    return;
  }

  if (wheelIntent === 'pointSize') {
    const currentSize = usePointCloudStore.getState().pointSize;
    pointsActions.setSize(getWheelAdjustedValue(currentSize, event.deltaY, 0.1, 50));
    return;
  }

  navActions.clearNavigationHistory();
  animationTargetRef.current = null;

  if (cameraMode === 'fly') {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuatRef.current);
    const moveAmount = getFlyWheelMoveAmount(event.deltaY, radius, CONTROLS.wheelMoveMultiplier, flySpeed);
    moveCamera(camera, forward.multiplyScalar(moveAmount));
  } else if (camera instanceof THREE.OrthographicCamera) {
    orthoZoomRef.current = getOrthoWheelZoom(orthoZoomRef.current, event.deltaY, zoomSpeed);
    setOrthographicZoom(camera, orthoZoomRef.current);
  } else {
    targetDistanceRef.current = getPerspectiveWheelDistance(
      targetDistanceRef.current,
      event.deltaY,
      zoomSpeed,
      CONTROLS.minDistance
    );
  }
}

export function useTrackballWheelHandlers({
  canvas,
  camera,
  cameraMode,
  flySpeed,
  radius,
  zoomSpeed,
  cameraQuatRef,
  targetDistanceRef,
  orthoZoomRef,
  wheelHandledRef,
  animationTargetRef,
  enabledRef,
  navActions,
  camerasActions,
  pointsActions,
}: TrackballWheelHandlersOptions): void {
  const handlerOptionsRef = useLatestRef<TrackballWheelHandlersOptions>({
    canvas,
    camera,
    cameraMode,
    flySpeed,
    radius,
    zoomSpeed,
    cameraQuatRef,
    targetDistanceRef,
    orthoZoomRef,
    wheelHandledRef,
    animationTargetRef,
    enabledRef,
    navActions,
    camerasActions,
    pointsActions,
  });

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      handleTrackballWheel({
        event,
        ...handlerOptionsRef.current,
      });
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [canvas, handlerOptionsRef]);
}
