/**
 * Point cloud visualization component.
 * Orchestrates data computation, rendering, and interaction.
 */

import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import {
  useReconstructionStore,
  usePointPickingStore,
  useDeletionStore,
} from '../../../store';
import { usePointsNode, useSelectionNode } from '../../../nodes';
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

  // Node hooks for points and selection state
  const points = usePointsNode();
  const selection = useSelectionNode();

  // Extract points state
  const {
    visible: showPointCloud,
    colorMode,
    size: pointSize,
    opacity: pointOpacity,
    minTrackLength,
    maxReprojectionError: maxReprojectionErrorRaw,
    thinning,
  } = points;

  // Convert null back to Infinity for usePointCloudData hook
  const maxReprojectionError = maxReprojectionErrorRaw ?? Infinity;

  // Extract selection state
  const {
    selectedImageId,
    visible: showSelectionHighlight,
    colorMode: selectionColorMode,
    animationSpeed: selectionAnimationSpeed,
    color: selectionColor,
  } = selection;

  // Point picking state
  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const selectedPointsLength = usePointPickingStore((s) => s.selectedPoints.length);
  const addSelectedPoint = usePointPickingStore((s) => s.addSelectedPoint);
  const setHoveredPoint = usePointPickingStore((s) => s.setHoveredPoint);

  // Floor plane state
  const pointDistances = useFloorPlaneStore((s) => s.pointDistances);
  const distanceThreshold = useFloorPlaneStore((s) => s.distanceThreshold);
  const floorColorMode = useFloorPlaneStore((s) => s.floorColorMode);

  // Pending deletions - filter selection if selected image is pending deletion
  const pendingDeletions = useDeletionStore((s) => s.pendingDeletions);
  const effectiveSelectedImageId = selectedImageId !== null && pendingDeletions.has(selectedImageId)
    ? null
    : selectedImageId;

  // Compute point cloud data (positions, colors, selection)
  const { positions, colors, selectedPositions, selectedColors, indexToPoint3DIdRef } =
    usePointCloudData({
      reconstruction,
      wasmReconstruction,
      colorMode,
      minTrackLength,
      maxReprojectionError,
      thinning,
      selectedImageId: effectiveSelectedImageId,
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
    if (!positions || !colors || positions.length === 0) return null;
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
