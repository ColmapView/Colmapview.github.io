/**
 * Point cloud visualization component.
 * Orchestrates data computation, rendering, and interaction.
 */

import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { usePointCloudData } from '../../../hooks/pointCloud/usePointCloudData';
import { usePointPicking } from '../../../hooks/pointCloud/usePointPicking';
import { SelectionOverlay } from './SelectionOverlay';
import { usePointCloudStoreFacade } from './usePointCloudStoreFacade';
import { shouldRenderPointGeometry } from './pointCloudRenderPolicy';

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
  const {
    data: {
      reconstruction,
      wasmReconstruction,
      points,
      selection,
      pointPicking,
      floor,
      deletion,
      splatFile,
      readySplatFile,
    },
    actions: {
      addSelectedPoint,
      setHoveredPoint,
    },
  } = usePointCloudStoreFacade();

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
  const showPointGeometry = shouldRenderPointGeometry({
    showPointCloud,
    colorMode,
    splatFile,
    readySplatFile,
  });
  const pointColorMode = colorMode === 'splats' ? 'rgb' : colorMode;

  // Extract selection state
  const {
    selectedImageId,
    visible: showSelectionHighlight,
    colorMode: selectionColorMode,
    animationSpeed: selectionAnimationSpeed,
    color: selectionColor,
  } = selection;

  // Point picking state
  const effectiveSelectedImageId = selectedImageId !== null && deletion.pendingDeletions.has(selectedImageId)
    ? null
    : selectedImageId;

  // Compute point cloud data (positions, colors, selection)
  const { positions, colors, selectedPositions, selectedColors, indexToPoint3DIdRef } =
    usePointCloudData({
      reconstruction,
      wasmReconstruction,
      colorMode: pointColorMode,
      minTrackLength,
      maxReprojectionError,
      thinning,
      selectedImageId: effectiveSelectedImageId,
      showSelectionHighlight,
      selectionColor,
      floorColorMode: floor.floorColorMode,
      pointDistances: floor.pointDistances,
      distanceThreshold: floor.distanceThreshold,
    });

  // Set up point picking
  const { pointsRef, handlePointClick, needsMorePoints } = usePointPicking({
    pickingMode: pointPicking.pickingMode,
    selectedPointsLength: pointPicking.selectedPointsLength,
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
      {/* Main point cloud - hidden when splat rendering is selected */}
      {showPointGeometry && geometry && (
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
