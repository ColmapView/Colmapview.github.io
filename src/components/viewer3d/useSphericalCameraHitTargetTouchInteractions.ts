import { useCallback, useEffect, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { ImageId } from '../../types/colmap';
import { armFrustumLongPress, type FrustumLongPressHandle } from './frustumLongPress';
import { markFrustumTap, markSceneObjectTouchDownForTouchPointer } from './frustumTouchGuards';
import { markSceneContextMenuHandled } from './sceneContextMenuGuard';
import { BATCHED_FRUSTUM_TOUCH_TAP_MAX_DISTANCE_SQUARED } from './batchedFrustumInteractionPolicy';
import {
  resolveSphericalHitTargetImageId,
  type SphericalHitTargetFrustum,
} from './sphericalHitTargetPolicy';

interface SphericalHitTargetTouchDown {
  imageId: ImageId;
  x: number;
  y: number;
  /** Armed only for touch pointers; mouse taps record position without a timer. */
  longPress: FrustumLongPressHandle | null;
}

interface SphericalHitTargetTouchInteractionsOptions {
  frustums: readonly SphericalHitTargetFrustum[];
  touchMode: boolean;
  onContextMenu: (imageId: ImageId) => void;
  onLongPress: (imageId: ImageId) => void;
}

/**
 * Touch/mouse pointer-down/up handlers for the batched spherical hit targets,
 * mirroring useBatchedFrustumInteractions' long-press handling:
 * - touch-only arming of armFrustumLongPress (window-level move/up/cancel tracking,
 *   pointerId matching, and a lone-touch fire gate so pinches never pop a menu);
 * - markSceneObjectTouchDownForTouchPointer for the Scene3D touch-down guard;
 * - a fired long-press suppresses the tap; a short stationary tap opens the context
 *   menu (mouse taps in touch mode keep this tap action but never arm a long-press);
 * - a right-button pointer-down in non-touch mode pre-marks the scene context-menu
 *   guard so the scene-level fallback does not also fire.
 */
export function useSphericalCameraHitTargetTouchInteractions({
  frustums,
  touchMode,
  onContextMenu,
  onLongPress,
}: SphericalHitTargetTouchInteractionsOptions) {
  const touchDownRef = useRef<SphericalHitTargetTouchDown | null>(null);

  useEffect(() => {
    return () => {
      touchDownRef.current?.longPress?.cancel();
    };
  }, []);

  const onPointerDownTouch = useCallback((e: ThreeEvent<PointerEvent>) => {
    const imageId = resolveSphericalHitTargetImageId(frustums, e.instanceId);
    if (imageId === null) return;

    touchDownRef.current?.longPress?.cancel();

    const { pointerId, pointerType, clientX, clientY } = e.nativeEvent;
    const isTouch = markSceneObjectTouchDownForTouchPointer(pointerType);

    touchDownRef.current = {
      imageId,
      x: clientX,
      y: clientY,
      longPress: isTouch && pointerId !== undefined
        ? armFrustumLongPress({
            pointerId,
            x: clientX,
            y: clientY,
            onFire: () => onLongPress(imageId),
          })
        : null,
    };
  }, [frustums, onLongPress]);

  const onPointerDownMouse = useCallback((e: ThreeEvent<PointerEvent>) => {
    // Pre-mark context menu so sceneContextMenuGuard suppresses the scene-level handler.
    if (e.nativeEvent.button !== 2) return;
    markSceneContextMenuHandled();
  }, []);

  const onPointerUp = useCallback((e: ThreeEvent<PointerEvent>) => {
    const down = touchDownRef.current;
    touchDownRef.current = null;
    if (!down) return;

    const fired = down.longPress?.fired ?? false;
    down.longPress?.cancel();
    if (fired) return; // long-press already fired → suppress the tap

    // Tap within the distance threshold → context menu (same as batched frustum tap).
    const dx = e.nativeEvent.clientX - down.x;
    const dy = e.nativeEvent.clientY - down.y;
    if (dx * dx + dy * dy > BATCHED_FRUSTUM_TOUCH_TAP_MAX_DISTANCE_SQUARED) return;

    e.stopPropagation();
    markFrustumTap();
    onContextMenu(down.imageId);
  }, [onContextMenu]);

  return {
    onPointerDown: touchMode ? onPointerDownTouch : onPointerDownMouse,
    onPointerUp: touchMode ? onPointerUp : undefined,
  };
}
