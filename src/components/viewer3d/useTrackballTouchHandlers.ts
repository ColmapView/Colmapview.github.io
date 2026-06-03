import { useEffect } from 'react';
import { useUIStore } from '../../store';
import { useLatestRef } from '../../hooks/useLatestRef';
import {
  handleTrackballTouchCancel,
  handleTrackballTouchEnd,
  handleTrackballTouchMove,
  handleTrackballTouchStart,
  type TrackballTouchHandlersOptions,
} from './trackballTouchHandlers';

export {
  handleTrackballTouchCancel,
  handleTrackballTouchEnd,
  handleTrackballTouchMove,
  handleTrackballTouchStart,
  type TrackballTouchEndOptions,
  type TrackballTouchHandlersOptions,
  type TrackballTouchMoveOptions,
  type TrackballTouchStartOptions,
  type XYValue,
} from './trackballTouchHandlers';

export function useTrackballTouchHandlers(options: TrackballTouchHandlersOptions): void {
  const { canvas, touchMode } = options;
  const handlerOptionsRef = useLatestRef(options);

  useEffect(() => {
    if (!touchMode) return;

    const resetView = () => {
      useUIStore.getState().resetView();
    };
    const onTouchStart = (event: TouchEvent) => {
      handleTrackballTouchStart({ event, resetView, ...handlerOptionsRef.current });
    };
    const onTouchMove = (event: TouchEvent) => {
      handleTrackballTouchMove({ event, ...handlerOptionsRef.current });
    };
    const onTouchEnd = (event: TouchEvent) => {
      handleTrackballTouchEnd({ event, ...handlerOptionsRef.current });
    };
    const onTouchCancel = (event: TouchEvent) => {
      handleTrackballTouchCancel({ event, ...handlerOptionsRef.current });
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });
    canvas.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [canvas, handlerOptionsRef, touchMode]);
}
