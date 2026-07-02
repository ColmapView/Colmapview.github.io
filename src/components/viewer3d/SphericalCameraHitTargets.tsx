import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { ImageId } from '../../types/colmap';
import type { CameraFrustumItem } from './cameraFrustumGeometry';
import { TOUCH } from '../../theme/sizing';
import { markFrustumTouchDown, markFrustumTap } from './frustumTouchGuards';
import { markSceneContextMenuHandled } from './sceneContextMenuGuard';
import { BATCHED_FRUSTUM_TOUCH_TAP_MAX_DISTANCE_SQUARED } from './batchedFrustumInteractionPolicy';
import {
  composeSphericalHitTargetMatrix,
  getSphericalHitTargetMeshKey,
  resolveSphericalHitTargetImageId,
} from './sphericalHitTargetPolicy';

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

// Reused scratch objects for per-instance matrix composition. Module-scoped like
// BatchedPlaneHitTargets' temps — this component only ever mounts once per scene.
const tempMatrix = new THREE.Matrix4();
const tempScale = new THREE.Vector3();

/**
 * Batched invisible hit targets for spherical (EQUIRECTANGULAR) cameras.
 *
 * A SINGLE InstancedMesh over one shared UNIT-sphere geometry provides the raycast
 * targets for every spherical camera (previously: one mesh + one SphereGeometry per
 * camera — O(N) raycast targets, and the size slider re-created all N geometries every
 * tick because cameraScale was baked into the geometry constructor args). Per-camera
 * size is now a uniform instance scale, so a slider tick only rewrites instance
 * matrices — geometry is never rebuilt.
 *
 * This mirrors BatchedPlaneHitTargets' InstancedMesh batching (shared geometry/material
 * via useMemo, `dispose={null}` on the mesh, per-instance matrix compose, count-driven
 * remount key). Raycast hits carry an `instanceId` that maps 1:1 to the frustum at that
 * array index (resolveSphericalHitTargetImageId).
 *
 * The pointer-event semantics (hover/click/context-menu/long-press/tap) are this
 * component's own — deliberately NOT useBatchedFrustumInteractions, whose selected-
 * camera filtering, body-cursor, drag-suppression and tooltip side-effects would change
 * the spherical behavior (spherical targets have no selection concept and never showed a
 * hover card). onPointerMove is the one addition batching requires: instances of a single
 * InstancedMesh do not fire per-instance pointerOut/pointerOver, so hover is kept in sync
 * as the pointer crosses from one instance to another.
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
  const meshRef = useRef<THREE.InstancedMesh>(null);
  // Shared long-press timer state across all spheres (only one touch-down at a time).
  const touchDownRef = useRef<TouchDownState | null>(null);

  // One shared unit-sphere geometry + one invisible material, created once. `dispose={null}`
  // on the mesh keeps R3F from disposing them on the count-driven remount; the cleanup
  // effect disposes them when the component itself unmounts.
  const sphereGeometry = useMemo(() => new THREE.SphereGeometry(1, 16, 12), []);
  const hitMaterial = useMemo(
    // visible:false → not rendered, but still raycasted for pointer events.
    () => new THREE.MeshBasicMaterial({ visible: false, depthWrite: false, side: THREE.FrontSide }),
    []
  );

  useEffect(() => {
    return () => {
      sphereGeometry.dispose();
      hitMaterial.dispose();
    };
  }, [sphereGeometry, hitMaterial]);

  useEffect(() => {
    return () => {
      if (touchDownRef.current?.timer) clearTimeout(touchDownRef.current.timer);
    };
  }, []);

  // Write per-instance matrices whenever the pose set or cameraScale changes. Uses the
  // UNIT geometry + uniform scale, so a slider tick only touches matrices (no geometry).
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    frustums.forEach((f, index) => {
      composeSphericalHitTargetMatrix(tempMatrix, tempScale, f.position, f.quaternion, cameraScale);
      mesh.setMatrixAt(index, tempMatrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [frustums, cameraScale]);

  if (frustums.length === 0) return null;

  const meshKey = getSphericalHitTargetMeshKey(frustums.length, frustums[0]?.image.imageId);

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    const imageId = resolveSphericalHitTargetImageId(frustums, e.instanceId);
    if (imageId === null) return;
    e.stopPropagation();
    onHover(imageId);
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    const imageId = resolveSphericalHitTargetImageId(frustums, e.instanceId);
    if (imageId === null) return;
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
    const imageId = resolveSphericalHitTargetImageId(frustums, e.instanceId);
    if (imageId === null) return;
    e.stopPropagation();
    onClick(imageId);
  };

  const handleContextMenu = (e: ThreeEvent<MouseEvent>) => {
    const imageId = resolveSphericalHitTargetImageId(frustums, e.instanceId);
    if (imageId === null) return;
    e.stopPropagation();
    e.nativeEvent.preventDefault();
    e.nativeEvent.stopPropagation();
    onContextMenu(imageId);
  };

  const handlePointerDownTouch = (e: ThreeEvent<PointerEvent>) => {
    const imageId = resolveSphericalHitTargetImageId(frustums, e.instanceId);
    if (imageId === null) return;
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
    if (!down) return;
    if (down.timer) clearTimeout(down.timer);
    if (down.fired) return; // long-press already fired

    // Tap within distance threshold → treat as context menu (same as batched frustum tap).
    const dx = e.nativeEvent.clientX - down.x;
    const dy = e.nativeEvent.clientY - down.y;
    if (dx * dx + dy * dy > BATCHED_FRUSTUM_TOUCH_TAP_MAX_DISTANCE_SQUARED) return;

    e.stopPropagation();
    markFrustumTap();
    onContextMenu(down.imageId);
  };

  return (
    <instancedMesh
      key={meshKey}
      ref={meshRef}
      dispose={null}
      args={[sphereGeometry, hitMaterial, frustums.length]}
      onPointerOver={handlePointerOver}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerDown={touchMode ? handlePointerDownTouch : handlePointerDownMouse}
      onPointerUp={touchMode ? handlePointerUp : undefined}
    />
  );
}
