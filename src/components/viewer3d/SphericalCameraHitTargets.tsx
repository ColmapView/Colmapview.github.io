import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { ImageId } from '../../types/colmap';
import type { CameraFrustumItem } from './cameraFrustumGeometry';
import { TOUCH } from '../../theme/sizing';
import { markFrustumTouchDown, markFrustumTap } from './frustumTouchGuards';
import { markSceneContextMenuHandled } from './sceneContextMenuGuard';
import { BATCHED_FRUSTUM_TOUCH_TAP_MAX_DISTANCE_SQUARED } from './batchedFrustumInteractionPolicy';

interface SphericalCameraHitTargetsProps {
  frustums: CameraFrustumItem[];
  cameraScale: number;
  onHover: (id: ImageId | null) => void;
  onClick: (imageId: ImageId) => void;
  onContextMenu: (imageId: ImageId) => void;
  onLongPress: (imageId: ImageId) => void;
  touchMode: boolean;
}

interface TouchDownState {
  imageId: ImageId;
  x: number;
  y: number;
  fired: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * One invisible sphere-geometry hit target per spherical camera.
 * Forwards pointer events to the same nav-handler signatures used by BatchedPlaneHitTargets
 * (onClick, onContextMenu, onHover, onLongPress), so spherical cameras are selectable.
 *
 * Long-press wiring mirrors useBatchedFrustumInteractions: onPointerDown starts a
 * setTimeout (TOUCH.longPressDelay); onPointerUp cancels it or fires a tap → context menu.
 * The hook itself (useBatchedFrustumInteractions) is instanced-mesh specific and cannot
 * be directly reused here, but the mechanism is identical.
 */
export function SphericalCameraHitTargets({
  frustums,
  cameraScale,
  onHover,
  onClick,
  onContextMenu,
  onLongPress,
  touchMode,
}: SphericalCameraHitTargetsProps) {
  // Shared long-press timer state across all spheres (only one touch-down at a time).
  const touchDownRef = useRef<TouchDownState | null>(null);

  useEffect(() => {
    return () => {
      if (touchDownRef.current?.timer) clearTimeout(touchDownRef.current.timer);
    };
  }, []);

  if (frustums.length === 0) return null;

  return (
    <>
      {frustums.map((f) => {
        const imageId = f.image.imageId;

        const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover(imageId);
        };

        const handlePointerOut = () => onHover(null);

        const handleClick = (e: ThreeEvent<MouseEvent>) => {
          if (touchMode) {
            // Touch taps are handled by onPointerUp; suppress R3F click to avoid double-fire.
            e.stopPropagation();
            return;
          }
          e.stopPropagation();
          onClick(imageId);
        };

        const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          e.nativeEvent.preventDefault();
          e.nativeEvent.stopPropagation();
          onContextMenu(imageId);
        };

        const handlePointerDownTouch = (e: ThreeEvent<PointerEvent>) => {
          markFrustumTouchDown();
          const x = e.nativeEvent.clientX;
          const y = e.nativeEvent.clientY;
          const timer = setTimeout(() => {
            if (!touchDownRef.current || touchDownRef.current.imageId !== imageId) return;
            touchDownRef.current.fired = true;
            onLongPress(imageId);
          }, TOUCH.longPressDelay);
          touchDownRef.current = { imageId, x, y, timer, fired: false };
        };

        const handlePointerDownMouse = (e: ThreeEvent<PointerEvent>) => {
          // Pre-mark context menu so sceneContextMenuGuard suppresses the scene-level handler.
          if (e.nativeEvent.button !== 2) return;
          markSceneContextMenuHandled();
        };

        const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
          const down = touchDownRef.current;
          touchDownRef.current = null;
          if (!down || down.imageId !== imageId) return;
          if (down.timer) clearTimeout(down.timer);
          if (down.fired) return; // long-press already fired

          // Tap within distance threshold → treat as context menu (same as batched frustum tap).
          const dx = e.nativeEvent.clientX - down.x;
          const dy = e.nativeEvent.clientY - down.y;
          if (dx * dx + dy * dy > BATCHED_FRUSTUM_TOUCH_TAP_MAX_DISTANCE_SQUARED) return;

          e.stopPropagation();
          markFrustumTap();
          onContextMenu(imageId);
        };

        return (
          <mesh
            key={imageId}
            position={f.position}
            quaternion={f.quaternion}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            onPointerDown={touchMode ? handlePointerDownTouch : handlePointerDownMouse}
            onPointerUp={touchMode ? handlePointerUp : undefined}
          >
            <sphereGeometry args={[cameraScale, 16, 12]} />
            {/* visible={false} makes the mesh invisible but still raycasted for pointer events */}
            <meshBasicMaterial visible={false} depthWrite={false} side={THREE.FrontSide} />
          </mesh>
        );
      })}
    </>
  );
}
