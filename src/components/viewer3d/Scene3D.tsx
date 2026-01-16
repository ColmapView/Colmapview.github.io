import { Suspense, useMemo, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PointCloud } from './PointCloud';
import { CameraFrustums, CameraMatches } from './CameraFrustums';
import { ViewerControls } from './ViewerControls';
import { TrackballControls } from './TrackballControls';
import { OriginAxes, OriginGrid } from './OriginVisualization';
import { TransformGizmo } from './TransformGizmo';
import { ScreenshotCapture } from './ScreenshotCapture';
import { FooterBranding } from './FooterBranding';
import { useReconstructionStore, useUIStore, useCameraStore, useTransformStore } from '../../store';
import { getImageWorldPosition } from '../../utils/colmapTransforms';
import { createSim3dFromEuler, sim3dToMatrix4, isIdentityEuler, transformPoint } from '../../utils/sim3dTransforms';
import { percentile, median } from '../../utils/mathUtils';
import { CAMERA, VIZ_COLORS, OPACITY } from '../../theme';

function SceneContent() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);

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

    if (reconstruction.points3D.size > 0) {
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
  }, [reconstruction]);

  const axesDisplayMode = useUIStore((s) => s.axesDisplayMode);
  const axesCoordinateSystem = useUIStore((s) => s.axesCoordinateSystem);
  const axesScale = useUIStore((s) => s.axesScale);
  const gizmoMode = useUIStore((s) => s.gizmoMode);
  const viewResetTrigger = useUIStore((s) => s.viewResetTrigger);

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
      {transformMatrix ? (
        <group matrixAutoUpdate={false} matrix={transformMatrix}>
          <PointCloud />
          <CameraFrustums />
          <CameraMatches />
        </group>
      ) : (
        <>
          <PointCloud />
          <CameraFrustums />
          <CameraMatches />
        </>
      )}

      {/* Axes/Grid stay in original coordinate system */}
      {(axesDisplayMode === 'axes' || axesDisplayMode === 'both') && <OriginAxes size={bounds.radius * axesScale} scale={axesScale} coordinateSystem={axesCoordinateSystem} />}
      {(axesDisplayMode === 'grid' || axesDisplayMode === 'both') && <OriginGrid size={bounds.radius} />}

      {/* Transform gizmo follows the transformed data */}
      {gizmoMode !== 'off' && <TransformGizmo center={transformedCenter} size={bounds.radius * transform.scale * axesScale} coordinateMode={gizmoMode} />}

      <TrackballControls target={bounds.center} radius={bounds.radius} resetTrigger={viewResetTrigger} />
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
  const { scene } = useThree();

  useEffect(() => {
    scene.background = new THREE.Color(color);
  }, [scene, color]);

  return null;
}

export function Scene3D() {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const backgroundColor = useUIStore((s) => s.backgroundColor);
  const setSelectedImageId = useCameraStore((s) => s.setSelectedImageId);

  const cameraPosition = useMemo(() => {
    if (!reconstruction || reconstruction.points3D.size === 0) {
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
  }, [reconstruction]);

  return (
    <div className="w-full h-full relative" style={{ backgroundColor }}>
      <Canvas
        camera={{
          position: cameraPosition,
          fov: CAMERA.fov,
          near: CAMERA.nearPlane,
          far: CAMERA.farPlane,
        }}
        gl={{ antialias: true }}
        onPointerMissed={(e) => {
          // Right-click on empty space deselects
          if (e.button === 2) {
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
    </div>
  );
}
