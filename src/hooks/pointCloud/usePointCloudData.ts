/**
 * Hook for computing point cloud positions and colors.
 * Handles both WASM fast path and Map fallback path.
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Reconstruction } from '../../types/colmap';
import type { ColorMode } from '../../store/types';
import type { FloorColorMode } from '../../store/stores/floorPlaneStore';
import type { WasmReconstructionWrapper } from '../../wasm/reconstruction';
import { appLogger } from '../../utils/logger';
import type { PointCloudDataResult } from './types';
import {
  computeColorsForFastPath,
  applyFloorColoring,
} from '../../utils/pointCloudColors';
import {
  shouldUsePointCloudFastPath,
} from './pointCloudDataPolicy';
import { computeSelectedPointOverlay } from './pointCloudSelectionOverlay';
import { computeSlowPathMap } from './pointCloudMapData';
import { computeSlowPathWasm } from './pointCloudWasmData';

export interface UsePointCloudDataParams {
  reconstruction: Reconstruction | null;
  wasmReconstruction: WasmReconstructionWrapper | null;
  colorMode: ColorMode;
  minTrackLength: number;
  maxReprojectionError: number;
  thinning: number;
  selectedImageId: number | null;
  showSelectionHighlight: boolean;
  selectionColor: string;
  floorColorMode: FloorColorMode;
  pointDistances: Float32Array | null;
  distanceThreshold: number;
}

export interface UsePointCloudDataResult extends PointCloudDataResult {
  indexToPoint3DIdRef: React.RefObject<Map<number, bigint>>;
}

/**
 * Hook that computes point cloud positions and colors.
 *
 * This hook implements two rendering paths:
 * 1. Fast path: Uses WASM arrays directly when no filters are active
 * 2. Slow path: Iterates over points for filtering or when WASM is unavailable
 *
 * @param params - Configuration parameters
 * @returns Computed positions, colors, and index-to-point3DId mapping
 */
export function usePointCloudData(params: UsePointCloudDataParams): UsePointCloudDataResult {
  const {
    reconstruction,
    wasmReconstruction,
    colorMode,
    minTrackLength,
    maxReprojectionError,
    thinning,
    selectedImageId,
    showSelectionHighlight,
    selectionColor,
    floorColorMode,
    pointDistances,
    distanceThreshold,
  } = params;

  const indexToPoint3DIdRef = useRef<Map<number, bigint>>(new Map());

  // Compute highlight color directly in useMemo to avoid stale ref issue
  // (useEffect runs after render, so ref would have old value during useMemo execution)
  const highlightColor = useMemo((): [number, number, number] => {
    const c = new THREE.Color(selectionColor);
    return [c.r, c.g, c.b];
  }, [selectionColor]);

  const pointCloudData = useMemo((): PointCloudDataResult => {
    if (!reconstruction) {
      return {
        positions: null,
        colors: null,
        selectedPositions: null,
        selectedColors: null,
        indexToPoint3DId: new Map(),
      };
    }

    // FAST PATH: Use WASM arrays directly when no filters are active
    const noFilters = shouldUsePointCloudFastPath({
      minTrackLength,
      maxReprojectionError,
      thinning,
    });

    if (wasmReconstruction?.hasPoints() && noFilters) {
      const result = computeFastPath(
        wasmReconstruction,
        reconstruction,
        colorMode,
        selectedImageId,
        showSelectionHighlight,
        highlightColor,
        floorColorMode,
        pointDistances,
        distanceThreshold
      );
      if (result) return result;
    }

    // SLOW PATH: Filtered iteration
    const result = computeSlowPath(
      reconstruction,
      wasmReconstruction,
      colorMode,
      minTrackLength,
      maxReprojectionError,
      thinning,
      selectedImageId,
      showSelectionHighlight,
      highlightColor,
      floorColorMode,
      pointDistances,
      distanceThreshold
    );

    return result;
  }, [
    reconstruction,
    wasmReconstruction,
    colorMode,
    minTrackLength,
    maxReprojectionError,
    thinning,
    selectedImageId,
    showSelectionHighlight,
    highlightColor,
    pointDistances,
    distanceThreshold,
    floorColorMode,
  ]);

  useEffect(() => {
    indexToPoint3DIdRef.current = pointCloudData.indexToPoint3DId;
  }, [pointCloudData.indexToPoint3DId]);

  return {
    ...pointCloudData,
    indexToPoint3DIdRef,
  };
}

/**
 * Compute point cloud data using WASM fast path (no filtering).
 */
function computeFastPath(
  wasmReconstruction: WasmReconstructionWrapper,
  reconstruction: Reconstruction,
  colorMode: ColorMode,
  selectedImageId: number | null,
  showSelectionHighlight: boolean,
  highlightColor: [number, number, number],
  floorColorMode: FloorColorMode,
  pointDistances: Float32Array | null,
  distanceThreshold: number
): PointCloudDataResult | null {
  const count = wasmReconstruction.pointCount;

  // Build indexToPoint3DId mapping (still needed for picking)
  const indexToPoint3DId = new Map<number, bigint>();
  for (let i = 0; i < count; i++) {
    indexToPoint3DId.set(i, BigInt(i + 1)); // COLMAP uses 1-based IDs
  }
  // Get WASM arrays directly (zero-copy views)
  const wasmPositions = wasmReconstruction.getPositions();
  if (!wasmPositions || wasmPositions.length === 0) {
    appLogger.warn('[PointCloud] WASM positions not available or empty, falling back to slow path');
    return null;
  }
  // Check for detached/invalid array (first value would be NaN)
  if (!Number.isFinite(wasmPositions[0])) {
    appLogger.warn('[PointCloud] WASM positions array is invalid (NaN), falling back to slow path');
    return null;
  }

  // Compute colors based on mode
  const wasmColors = wasmReconstruction.getColors();
  const wasmErrors = wasmReconstruction.getErrors();
  const wasmTrackLengths = wasmReconstruction.getTrackLengths();

  const finalColors = computeColorsForFastPath(
    count,
    colorMode,
    wasmColors,
    wasmErrors,
    wasmTrackLengths
  );

  // Apply floor coloring if active (overrides colorMode)
  if (floorColorMode !== 'off' && pointDistances && pointDistances.length === count) {
    applyFloorColoring(finalColors, count, floorColorMode, pointDistances, distanceThreshold);
  }

  // Compute selection overlay if needed
  let selectedPositions: Float32Array | null = null;
  let selectedColors: Float32Array | null = null;

  if (showSelectionHighlight && selectedImageId !== null) {
    const selectedPointIds =
      reconstruction.imageToPoint3DIds.get(selectedImageId) ?? new Set<bigint>();
    const result = computeSelectedPointOverlay({
      pointCount: count,
      point3DIds: wasmReconstruction.getPoint3DIds(),
      positions: wasmPositions,
      selectedPointIds,
      highlightColor,
    });
    selectedPositions = result.selectedPositions;
    selectedColors = result.selectedColors;
  }

  // Copy WASM positions to prevent view invalidation when WASM memory is reallocated
  // The wasmPositions view can become detached (length 0) if WASM memory changes
  const positionsCopy = new Float32Array(wasmPositions);

  return {
    positions: positionsCopy,
    colors: finalColors,
    selectedPositions,
    selectedColors,
    indexToPoint3DId,
  };
}

/**
 * Compute point cloud data using slow path (with filtering).
 */
function computeSlowPath(
  reconstruction: Reconstruction,
  wasmReconstruction: WasmReconstructionWrapper | null,
  colorMode: ColorMode,
  minTrackLength: number,
  maxReprojectionError: number,
  thinning: number,
  selectedImageId: number | null,
  showSelectionHighlight: boolean,
  highlightColor: [number, number, number],
  floorColorMode: FloorColorMode,
  pointDistances: Float32Array | null,
  distanceThreshold: number
): PointCloudDataResult {
  // Build set of selected image point IDs
  const selectedImagePointIds =
    selectedImageId !== null
      ? reconstruction.imageToPoint3DIds.get(selectedImageId) ?? new Set<bigint>()
      : new Set<bigint>();

  // Try WASM path first (even for filtered case)
  if (wasmReconstruction?.hasPoints()) {
    const result = computeSlowPathWasm({
      wasmReconstruction,
      colorMode,
      minTrackLength,
      maxReprojectionError,
      thinning,
      selectedImagePointIds,
      showSelectionHighlight,
      highlightColor,
      floorColorMode,
      pointDistances,
      distanceThreshold,
    });
    if (result) return result;
  }

  // FALLBACK: Iterate over points3D Map
  return computeSlowPathMap({
    points3D: reconstruction.points3D,
    colorMode,
    minTrackLength,
    maxReprojectionError,
    thinning,
    selectedImagePointIds,
    showSelectionHighlight,
    highlightColor,
  });
}
