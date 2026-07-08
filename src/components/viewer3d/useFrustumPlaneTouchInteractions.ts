import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { armFrustumLongPress, type FrustumLongPressHandle } from './frustumLongPress';
import { markFrustumTap, markSceneObjectTouchDownForTouchPointer } from './frustumTouchGuards';
import { getFrustumPlaneTouchUpAction } from './frustumPlaneTouchPolicy';

interface FrustumPlaneTouchDown {
  x: number;
  y: number;
  /** Armed only for touch pointers; mouse taps record position without a timer. */
  longPress: FrustumLongPressHandle | null;
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
  const touchDownRef = useRef<FrustumPlaneTouchDown | null>(null);

  useEffect(() => {
    return () => {
      touchDownRef.current?.longPress?.cancel();
    };
  }, []);

  const onPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    touchDownRef.current?.longPress?.cancel();

    const { pointerId, pointerType, clientX, clientY } = e.nativeEvent;
    const isTouch = markSceneObjectTouchDownForTouchPointer(pointerType);

    touchDownRef.current = {
      x: clientX,
      y: clientY,
      longPress: isTouch
        ? armFrustumLongPress({
            pointerId,
            x: clientX,
            y: clientY,
            onFire: () => onLongPress?.(imageId),
          })
        : null,
    };
  }, [imageId, onLongPress]);

  const onPointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    const touchDown = touchDownRef.current;
    touchDownRef.current = null;
    const fired = touchDown?.longPress?.fired ?? false;
    touchDown?.longPress?.cancel();

    const action = getFrustumPlaneTouchUpAction({
      touchStart: touchDown ? { x: touchDown.x, y: touchDown.y, fired } : null,
      touchEnd: { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY },
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
