import { useEffect } from 'react';
import { useLatestRef } from '../../hooks/useLatestRef';
import {
  handleTrackballPointerDown,
  handleTrackballPointerLockChange,
  handleTrackballPointerMove,
  handleTrackballPointerUp,
  type TrackballPointerHandlersOptions,
} from './trackballPointerHandlers';

export {
  handleTrackballContextMenu,
  handleTrackballPointerDown,
  handleTrackballPointerLockChange,
  handleTrackballPointerMove,
  handleTrackballPointerUp,
  type TrackballPointerDownOptions,
  type TrackballPointerHandlersOptions,
  type TrackballPointerMoveOptions,
  type XYValue,
} from './trackballPointerHandlers';

export function useTrackballPointerHandlers({
  canvas,
  camera,
  cameraMode,
  flySpeed,
  pointerLock,
  pickingMode,
  radius,
  autoRotateMode,
  touchMode,
  rotateSpeed,
  panSpeed,
  applyRotation,
  updateCamera,
  isDraggingRef,
  isPanningRef,
  pointerLockRequestedRef,
  targetVecRef,
  cameraQuatRef,
  distanceRef,
  angularVelocityRef,
  smoothedVelocityRef,
  lastMouseRef,
  lastTimeRef,
  animationTargetRef,
  enabledRef,
  draggingRef,
  navActions,
}: TrackballPointerHandlersOptions): void {
  const handlerOptionsRef = useLatestRef<TrackballPointerHandlersOptions>({
    canvas,
    camera,
    cameraMode,
    flySpeed,
    pointerLock,
    pickingMode,
    radius,
    autoRotateMode,
    touchMode,
    rotateSpeed,
    panSpeed,
    applyRotation,
    updateCamera,
    isDraggingRef,
    isPanningRef,
    pointerLockRequestedRef,
    targetVecRef,
    cameraQuatRef,
    distanceRef,
    angularVelocityRef,
    smoothedVelocityRef,
    lastMouseRef,
    lastTimeRef,
    animationTargetRef,
    enabledRef,
    draggingRef,
    navActions,
  });

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      handleTrackballPointerDown({ event, ...handlerOptionsRef.current });
    };
    const onPointerUp = () => {
      handleTrackballPointerUp(handlerOptionsRef.current);
    };
    const onPointerMove = (event: MouseEvent) => {
      handleTrackballPointerMove({ event, ...handlerOptionsRef.current });
    };
    const onPointerLockChange = () => {
      handleTrackballPointerLockChange(handlerOptionsRef.current);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
    };
  }, [canvas, handlerOptionsRef]);
}
