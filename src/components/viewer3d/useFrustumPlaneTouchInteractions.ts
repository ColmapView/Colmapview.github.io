import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { TOUCH } from '../../theme/sizing';
import { markFrustumTap, markFrustumTouchDown } from './frustumTouchGuards';
import {
  getFrustumPlaneTouchUpAction,
  type FrustumPlaneTouchStart,
} from './frustumPlaneTouchPolicy';

interface TimedFrustumPlaneTouchStart extends FrustumPlaneTouchStart {
  timer: ReturnType<typeof setTimeout> | null;
}

interface FrustumPlaneTouchInteractionsOptions {
  enabled: boolean;
  imageId: number;
  isSelected: boolean;
  onContextMenu: (imageId: number) => void;
  onLongPress?: (imageId: number) => void;
  setTouchTransparent: Dispatch<SetStateAction<boolean>>;
}

export function useFrustumPlaneTouchInteractions({
  enabled,
  imageId,
  isSelected,
  onContextMenu,
  onLongPress,
  setTouchTransparent,
}: FrustumPlaneTouchInteractionsOptions) {
  const touchDownRef = useRef<TimedFrustumPlaneTouchStart | null>(null);

  useEffect(() => {
    return () => {
      if (touchDownRef.current?.timer) clearTimeout(touchDownRef.current.timer);
    };
  }, []);

  const onPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    markFrustumTouchDown();
    const x = e.nativeEvent.clientX;
    const y = e.nativeEvent.clientY;
    const timer = setTimeout(() => {
      if (!touchDownRef.current) return;
      touchDownRef.current.fired = true;
      onLongPress?.(imageId);
    }, TOUCH.longPressDelay);
    touchDownRef.current = { x, y, timer, fired: false };
  }, [imageId, onLongPress]);

  const onPointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    const touchStart = touchDownRef.current;
    touchDownRef.current = null;
    if (touchStart?.timer) clearTimeout(touchStart.timer);

    const action = getFrustumPlaneTouchUpAction({
      touchStart,
      touchEnd: {
        x: e.nativeEvent.clientX,
        y: e.nativeEvent.clientY,
      },
      isSelected,
    });

    if (action === 'none') return;

    e.stopPropagation();
    if (action === 'toggleSelectedTransparency') {
      setTouchTransparent(prev => !prev);
      return;
    }

    markFrustumTap();
    onContextMenu(imageId);
  }, [imageId, isSelected, onContextMenu, setTouchTransparent]);

  return {
    onPointerDown: enabled ? onPointerDown : undefined,
    onPointerUp: enabled ? onPointerUp : undefined,
  };
}
