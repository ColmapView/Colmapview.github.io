/**
 * Point cloud visualization component.
 * Orchestrates data computation, rendering, and interaction.
 */

import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import {
  useReconstructionStore,
  usePointCloudStore,
  useCameraStore,
  usePointPickingStore,
} from '../../../store';
import { useFloorPlaneStore } from '../../../store/stores/floorPlaneStore';
import { usePointCloudData } from '../../../hooks/pointCloud/usePointCloudData';
import { usePointPicking } from '../../../hooks/pointCloud/usePointPicking';
import { SelectionOverlay } from './SelectionOverlay';

/**
 * Main point cloud component.
 *
 * Responsibilities:
 * - Subscribes to stores for configuration
 * - Orchestrates data computation via usePointCloudData
 * - Handles point picking via usePointPicking
 * - Renders main point cloud and selection overlay
 */
export function PointCloud(): React.JSX.Element | null {
  // Store subscriptions
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);
  const showPointCloud = usePointCloudStore((s) => s.showPointCloud);
  const colorMode = usePointCloudStore((s) => s.colorMode);
  const pointSize = usePointCloudStore((s) => s.pointSize);
  const pointOpacity = usePointCloudStore((s) => s.pointOpacity);
  const minTrackLength = usePointCloudStore((s) => s.minTrackLength);
  const maxReprojectionError = usePointCloudStore((s) => s.maxReprojectionError);
  const selectedImageId = useCameraStore((s) => s.selectedImageId);
  const showSelectionHighlight = useCameraStore((s) => s.showSelectionHighlight);
  const selectionColorMode = useCameraStore((s) => s.selectionColorMode);
  const selectionAnimationSpeed = useCameraStore((s) => s.selectionAnimationSpeed);
  const selectionColor = useCameraStore((s) => s.selectionColor);

  // Point picking state
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const selectedPointsLength = usePointPickingStore((s) => s.selectedPoints.length);
  const addSelectedPoint = usePointPickingStore((s) => s.addSelectedPoint);
  const setHoveredPoint = usePointPickingStore((s) => s.setHoveredPoint);

  // Floor plane state
  const pointDistances = useFloorPlaneStore((s) => s.pointDistances);
  const distanceThreshold = useFloorPlaneStore((s) => s.distanceThreshold);
  const floorColorMode = useFloorPlaneStore((s) => s.floorColorMode);

  // Compute point cloud data (positions, colors, selection)
  const { positions, colors, selectedPositions, selectedColors, indexToPoint3DIdRef } =
    usePointCloudData({
      reconstruction,
      wasmReconstruction,
      colorMode,
      minTrackLength,
      maxReprojectionError,
      selectedImageId,
      showSelectionHighlight,
      selectionColor,
      floorColorMode,
      pointDistances,
      distanceThreshold,
    });

  // Set up point picking
  const { pointsRef, handlePointClick, needsMorePoints } = usePointPicking({
    pickingMode,
    selectedPointsLength,
    pointSize,
    indexToPoint3DIdRef,
    addSelectedPoint,
    setHoveredPoint,
  });

  // Create geometry for main point cloud
  const geometry = useMemo(() => {
    if (!positions || !colors) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeBoundingSphere();
    return geo;
  }, [positions, colors]);

  // Dispose geometry when it changes to prevent GPU memory leaks
  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  // Return null only if there's nothing to render at all
  const hasMainGeometry = geometry !== null;
  const hasSelectionOverlay =
    selectedPositions !== null && selectedColors !== null && selectedPositions.length > 0;

  if (!hasMainGeometry && !hasSelectionOverlay) return null;

  return (
    <>
      {/* Main point cloud - only shown when showPointCloud is true */}
      {showPointCloud && geometry && (
        <points
          ref={pointsRef}
          matrixAutoUpdate={false}
          geometry={geometry}
          renderOrder={1}
          onClick={needsMorePoints ? handlePointClick : undefined}
        >
          <pointsMaterial
            size={pointSize}
            vertexColors
            sizeAttenuation={false}
            transparent
            opacity={pointOpacity}
          />
        </points>
      )}

      {/* Selection overlay - always shown when there's a selection, independent of showPointCloud */}
      {hasSelectionOverlay && selectedPositions && selectedColors && (
        <SelectionOverlay
          selectedPositions={selectedPositions}
          selectedColors={selectedColors}
          pointSize={pointSize}
          selectedImageId={selectedImageId}
          selectionColorMode={selectionColorMode}
          selectionAnimationSpeed={selectionAnimationSpeed}
          selectionColor={selectionColor}
        />
      )}
    </>
  );
}
