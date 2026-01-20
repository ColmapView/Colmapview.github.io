import { Suspense, useMemo, useEffect, useCallback, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PointCloud } from './PointCloud';
import { CameraFrustums, CameraMatches } from './CameraFrustums';
import { RigConnections } from './RigConnections';
import { ViewerControls } from './ViewerControls';
import { TrackballControls } from './TrackballControls';
import { OriginAxes, OriginGrid } from './OriginVisualization';
import { TransformGizmo } from './TransformGizmo';
import { SelectedPointMarkers } from './SelectedPointMarkers';
import { PickingCursor } from './PickingCursor';
import { ScreenshotCapture } from './ScreenshotCapture';
import { FooterBranding } from './FooterBranding';
import { GlobalContextMenu } from './GlobalContextMenu';
import { DistanceInputModal } from '../modals/DistanceInputModal';
import { useReconstructionStore, useUIStore, useCameraStore, useTransformStore, usePointPickingStore } from '../../store';
import { getImageWorldPosition } from '../../utils/colmapTransforms';
import { createSim3dFromEuler, sim3dToMatrix4, isIdentityEuler, transformPoint } from '../../utils/sim3dTransforms';
import { percentile, median } from '../../utils/mathUtils';
import { CAMERA, VIZ_COLORS, OPACITY } from '../../theme';

function SceneContent() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const isPicking = pickingMode !== 'off';

  const bounds = useMemo(() => {
    if (!reconstruction) {
      return { center: [0, 0, 0] as [number, number, number], radius: 5 };
    }

    const images = Array.from(reconstruction.images.values());

    if (images.length > 0) {
      const xCoords: number[] = [];
      const yCoords: number[] = [];
      const zCoords: number[] = [];

      for (const image of images) {
        const pos = getImageWorldPosition(image);
        xCoords.push(pos.x);
        yCoords.push(pos.y);
        zCoords.push(pos.z);
      }

      const center: [number, number, number] = [
        median(xCoords),
        median(yCoords),
        median(zCoords),
      ];

      const sortedX = [...xCoords].sort((a, b) => a - b);
      const sortedY = [...yCoords].sort((a, b) => a - b);
      const sortedZ = [...zCoords].sort((a, b) => a - b);

      const rangeX = percentile(sortedX, 95) - percentile(sortedX, 5);
      const rangeY = percentile(sortedY, 95) - percentile(sortedY, 5);
      const rangeZ = percentile(sortedZ, 95) - percentile(sortedZ, 5);

      const radius = Math.max(rangeX, rangeY, rangeZ, 0.001) / 2;

      return { center, radius };
    }

    // Use WASM bounding box if available (avoids iterating points3D Map)
    if (wasmReconstruction?.hasPoints()) {
      const bbox = wasmReconstruction.getBoundingBox();
      if (bbox) {
        const center: [number, number, number] = [
          (bbox.minX + bbox.maxX) / 2,
          (bbox.minY + bbox.maxY) / 2,
          (bbox.minZ + bbox.maxZ) / 2,
        ];
        const radius = Math.max(
          bbox.maxX - bbox.minX,
          bbox.maxY - bbox.minY,
          bbox.maxZ - bbox.minZ
        ) / 2;
        return { center, radius: Math.max(radius, 0.001) };
      }
    }

    // Fallback: iterate points3D Map if available (JS parser path)
    if (reconstruction.points3D && reconstruction.points3D.size > 0) {
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

      for (const point of reconstruction.points3D.values()) {
        minX = Math.min(minX, point.xyz[0]);
        maxX = Math.max(maxX, point.xyz[0]);
        minY = Math.min(minY, point.xyz[1]);
        maxY = Math.max(maxY, point.xyz[1]);
        minZ = Math.min(minZ, point.xyz[2]);
        maxZ = Math.max(maxZ, point.xyz[2]);
      }

      const center: [number, number, number] = [
        (minX + maxX) / 2,
        (minY + maxY) / 2,
        (minZ + maxZ) / 2,
      ];

      const radius = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2;

      return { center, radius };
    }

    return { center: [0, 0, 0] as [number, number, number], radius: 5 };
  }, [reconstruction, wasmReconstruction]);

  const axesDisplayMode = useUIStore((s) => s.axesDisplayMode);
  const axesCoordinateSystem = useUIStore((s) => s.axesCoordinateSystem);
  const axesScale = useUIStore((s) => s.axesScale);
  const gridScale = useUIStore((s) => s.gridScale);
  const axisLabelMode = useUIStore((s) => s.axisLabelMode);
  const gizmoMode = useUIStore((s) => s.gizmoMode);
  const viewResetTrigger = useUIStore((s) => s.viewResetTrigger);
  const viewDirection = useUIStore((s) => s.viewDirection);
  const viewTrigger = useUIStore((s) => s.viewTrigger);

  // Transform preview state (always enabled)
  const transform = useTransformStore((s) => s.transform);

  // Compute transform for visual preview
  const { transformMatrix, transformedCenter } = useMemo(() => {
    if (isIdentityEuler(transform)) {
      return { transformMatrix: null, transformedCenter: bounds.center };
    }
    const sim3d = createSim3dFromEuler(transform);
    const matrix = sim3dToMatrix4(sim3d);
    const newCenter = transformPoint(sim3d, bounds.center);
    return { transformMatrix: matrix, transformedCenter: newCenter as [number, number, number] };
  }, [transform, bounds.center]);

  return (
    <>
      <ambientLight intensity={OPACITY.light.ambient} />
      <directionalLight position={[10, 10, 5]} intensity={OPACITY.light.directional} />

      {/* Transformable content - wrapped in group when preview is active */}
      {/* Hide frustums during point picking for cleaner selection */}
      {transformMatrix ? (
        <group matrixAutoUpdate={false} matrix={transformMatrix}>
          <PointCloud />
          {!isPicking && <CameraFrustums />}
          {!isPicking && <CameraMatches />}
          {!isPicking && <RigConnections />}
        </group>
      ) : (
        <>
          <PointCloud />
          {!isPicking && <CameraFrustums />}
          {!isPicking && <CameraMatches />}
          {!isPicking && <RigConnections />}
        </>
      )}

      {/* Axes/Grid stay in original coordinate system */}
      <Suspense fallback={null}>
        {(axesDisplayMode === 'axes' || axesDisplayMode === 'both') && <OriginAxes size={bounds.radius * axesScale} scale={axesScale} coordinateSystem={axesCoordinateSystem} labelMode={axisLabelMode} axesDisplayMode={axesDisplayMode} />}
        {(axesDisplayMode === 'grid' || axesDisplayMode === 'both') && <OriginGrid size={bounds.radius} scale={gridScale} />}
      </Suspense>

      {/* Transform gizmo follows the transformed data - hidden during picking */}
      {!isPicking && reconstruction && gizmoMode !== 'off' && <TransformGizmo center={transformedCenter} size={bounds.radius * transform.scale * axesScale} coordinateMode={gizmoMode} />}

      {/* Point picking markers - rendered outside transform group for stable display */}
      <SelectedPointMarkers />

      <TrackballControls target={bounds.center} radius={bounds.radius} resetTrigger={viewResetTrigger} viewDirection={viewDirection} viewTrigger={viewTrigger} />
    </>
  );
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color={VIZ_COLORS.wireframe} wireframe />
    </mesh>
  );
}

function BackgroundColor({ color }: { color: string }) {
  const { scene, invalidate } = useThree();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- THREE.js scene requires direct property assignment
    scene.background = new THREE.Color(color);
    // Force frame invalidation to ensure render happens after background change
    invalidate();
  }, [scene, color, invalidate]);

  return null;
}

export function Scene3D() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const backgroundColor = useUIStore((s) => s.backgroundColor);
  const setSelectedImageId = useCameraStore((s) => s.setSelectedImageId);
  const openContextMenu = useUIStore((s) => s.openContextMenu);
  const closeContextMenu = useUIStore((s) => s.closeContextMenu);

  // Point picking state for right-click cancellation
  // Only subscribe to length to avoid re-renders when point contents change
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const selectedPointsLength = usePointPickingStore((s) => s.selectedPoints.length);
  const removeLastPoint = usePointPickingStore((s) => s.removeLastPoint);
  const reset = usePointPickingStore((s) => s.reset);
  const markerRightClickHandled = usePointPickingStore((s) => s.markerRightClickHandled);

  // Track mouse position for distinguishing click from drag
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);
  const DRAG_THRESHOLD = 5; // pixels

  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);

  const cameraPosition = useMemo(() => {
    // Use WASM bounding box if available
    if (wasmReconstruction?.hasPoints()) {
      const bbox = wasmReconstruction.getBoundingBox();
      if (bbox) {
        const maxDist = Math.max(
          Math.abs(bbox.minX), Math.abs(bbox.maxX),
          Math.abs(bbox.minY), Math.abs(bbox.maxY),
          Math.abs(bbox.minZ), Math.abs(bbox.maxZ)
        );
        return [0, 0, maxDist * 2] as [number, number, number];
      }
    }

    // Fallback: use points3D Map if available
    if (!reconstruction || !reconstruction.points3D || reconstruction.points3D.size === 0) {
      return [0, 0, 5] as [number, number, number];
    }

    let maxDist = 0;
    for (const point of reconstruction.points3D.values()) {
      const dist = Math.sqrt(
        point.xyz[0] ** 2 + point.xyz[1] ** 2 + point.xyz[2] ** 2
      );
      maxDist = Math.max(maxDist, dist);
    }

    return [0, 0, maxDist * 2] as [number, number, number];
  }, [reconstruction, wasmReconstruction]);

  // Handle right-click for context menu (only if not dragging/panning)
  // In point picking mode, right-click cancels instead of opening menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // Check if this was a click (not a drag)
    if (mouseDownPos.current) {
      const dx = Math.abs(e.clientX - mouseDownPos.current.x);
      const dy = Math.abs(e.clientY - mouseDownPos.current.y);
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
        // This was a drag, don't show menu
        return;
      }
    }
    e.preventDefault();

    // If in point picking mode, right-click cancels instead of opening context menu
    if (pickingMode !== 'off') {
      // Check if a marker was already right-clicked (handled by SelectedPointMarkers)
      // If so, skip to avoid double-removal (Three.js and DOM events are separate)
      if (markerRightClickHandled) {
        // Clear the flag for next time
        usePointPickingStore.setState({ markerRightClickHandled: false });
        return;
      }

      if (selectedPointsLength > 0) {
        // Remove the last selected point
        removeLastPoint();
      } else {
        // No points selected, exit picking mode entirely
        reset();
      }
      return;
    }

    openContextMenu(e.clientX, e.clientY);
  }, [openContextMenu, pickingMode, selectedPointsLength, removeLastPoint, reset, markerRightClickHandled]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2) {
      mouseDownPos.current = { x: e.clientX, y: e.clientY };
      closeContextMenu(); // Close any open menu when starting new interaction
    }
  }, [closeContextMenu]);

  const handleMouseUp = useCallback(() => {
    // Clear after a short delay to allow contextmenu event to check it
    setTimeout(() => {
      mouseDownPos.current = null;
    }, 0);
  }, []);

  return (
    <div
      className="w-full h-full relative isolate"
      style={{ backgroundColor }}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <Canvas
        camera={{
          position: cameraPosition,
          fov: CAMERA.fov,
          near: CAMERA.nearPlane,
          far: CAMERA.farPlane,
        }}
        gl={{ antialias: true }}
        onPointerMissed={(e) => {
          // Left-click or right-click on empty space deselects
          if (e.button === 0 || e.button === 2) {
            setSelectedImageId(null);
          }
        }}
      >
        <BackgroundColor color={backgroundColor} />
        <ScreenshotCapture />
        <Suspense fallback={<LoadingFallback />}>
          <SceneContent />
        </Suspense>
      </Canvas>
      <ViewerControls />
      <FooterBranding />
      <PickingCursor />
      <GlobalContextMenu />
      <DistanceInputModal />
    </div>
  );
}
