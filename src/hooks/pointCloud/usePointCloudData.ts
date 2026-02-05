/**
 * Hook for computing point cloud positions and colors.
 * Handles both WASM fast path and Map fallback path.
 */

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Reconstruction, Point3D } from '../../types/colmap';
import type { ColorMode } from '../../store/types';
import type { FloorColorMode } from '../../store/stores/floorPlaneStore';
import type { WasmReconstructionWrapper } from '../../wasm/reconstruction';
import type { PointCloudDataResult } from './types';
import {
  computeColorsForFastPath,
  applyFloorColoring,
  computeColorFromWasm,
  computeColorFromPoint3D,
  type WasmColorContext,
  type MapColorContext,
} from '../../utils/pointCloudColors';

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

  const { positions, colors, selectedPositions, selectedColors } = useMemo(() => {
    if (!reconstruction) {
      indexToPoint3DIdRef.current = new Map();
      return {
        positions: null,
        colors: null,
        selectedPositions: null,
        selectedColors: null,
      };
    }

    // FAST PATH: Use WASM arrays directly when no filters are active
    const noFilters = minTrackLength <= 1 && maxReprojectionError >= 1000 && thinning === 0;

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
        distanceThreshold,
        indexToPoint3DIdRef
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
      distanceThreshold,
      indexToPoint3DIdRef
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

  return {
    positions,
    colors,
    selectedPositions,
    selectedColors,
    indexToPoint3DId: indexToPoint3DIdRef.current,
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
  distanceThreshold: number,
  indexToPoint3DIdRef: React.RefObject<Map<number, bigint>>
): {
  positions: Float32Array;
  colors: Float32Array;
  selectedPositions: Float32Array | null;
  selectedColors: Float32Array | null;
} | null {
  const count = wasmReconstruction.pointCount;

  // Build indexToPoint3DId mapping (still needed for picking)
  const indexToPoint3DId = new Map<number, bigint>();
  for (let i = 0; i < count; i++) {
    indexToPoint3DId.set(i, BigInt(i + 1)); // COLMAP uses 1-based IDs
  }
  if (indexToPoint3DIdRef.current) {
    indexToPoint3DIdRef.current = indexToPoint3DId;
  }

  // Get WASM arrays directly (zero-copy views)
  const wasmPositions = wasmReconstruction.getPositions();
  if (!wasmPositions || wasmPositions.length === 0) {
    console.warn('[PointCloud] WASM positions not available or empty, falling back to slow path');
    return null;
  }
  // Check for detached/invalid array (first value would be NaN)
  if (!Number.isFinite(wasmPositions[0])) {
    console.warn('[PointCloud] WASM positions array is invalid (NaN), falling back to slow path');
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
    const result = computeSelectionOverlay(
      wasmReconstruction,
      reconstruction,
      selectedImageId,
      wasmPositions,
      highlightColor
    );
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
  };
}

/**
 * Compute selection overlay for highlighted points.
 */
function computeSelectionOverlay(
  wasmReconstruction: WasmReconstructionWrapper,
  reconstruction: Reconstruction,
  selectedImageId: number,
  wasmPositions: Float32Array,
  highlightColor: [number, number, number]
): {
  selectedPositions: Float32Array | null;
  selectedColors: Float32Array | null;
} {
  const selectedImagePointIds =
    reconstruction.imageToPoint3DIds.get(selectedImageId) ?? new Set<bigint>();

  if (selectedImagePointIds.size === 0) {
    return { selectedPositions: null, selectedColors: null };
  }

  const count = wasmReconstruction.pointCount;
  const point3DIds = wasmReconstruction.getPoint3DIds();

  // Count matching points
  let highlightCount = 0;
  for (let i = 0; i < count; i++) {
    const point3DId = point3DIds ? point3DIds[i] : BigInt(i + 1);
    if (selectedImagePointIds.has(point3DId)) {
      highlightCount++;
    }
  }

  if (highlightCount === 0) {
    return { selectedPositions: null, selectedColors: null };
  }

  const selectedPositions = new Float32Array(highlightCount * 3);
  const selectedColors = new Float32Array(highlightCount * 3);

  let idx = 0;
  for (let i = 0; i < count; i++) {
    const point3DId = point3DIds ? point3DIds[i] : BigInt(i + 1);
    if (selectedImagePointIds.has(point3DId)) {
      const i3 = idx * 3;
      selectedPositions[i3] = wasmPositions[i * 3];
      selectedPositions[i3 + 1] = wasmPositions[i * 3 + 1];
      selectedPositions[i3 + 2] = wasmPositions[i * 3 + 2];
      selectedColors[i3] = highlightColor[0];
      selectedColors[i3 + 1] = highlightColor[1];
      selectedColors[i3 + 2] = highlightColor[2];
      idx++;
    }
  }

  return { selectedPositions, selectedColors };
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
  distanceThreshold: number,
  indexToPoint3DIdRef: React.RefObject<Map<number, bigint>>
): {
  positions: Float32Array | null;
  colors: Float32Array | null;
  selectedPositions: Float32Array | null;
  selectedColors: Float32Array | null;
} {
  // Build set of selected image point IDs
  const selectedImagePointIds =
    selectedImageId !== null
      ? reconstruction.imageToPoint3DIds.get(selectedImageId) ?? new Set<bigint>()
      : new Set<bigint>();

  // Try WASM path first (even for filtered case)
  if (wasmReconstruction?.hasPoints()) {
    const result = computeSlowPathWasm(
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
      indexToPoint3DIdRef
    );
    if (result) return result;
  }

  // FALLBACK: Iterate over points3D Map
  return computeSlowPathMap(
    reconstruction,
    colorMode,
    minTrackLength,
    maxReprojectionError,
    thinning,
    selectedImagePointIds,
    showSelectionHighlight,
    highlightColor,
    indexToPoint3DIdRef
  );
}

/**
 * Compute slow path using WASM arrays with filtering.
 */
function computeSlowPathWasm(
  wasmReconstruction: WasmReconstructionWrapper,
  colorMode: ColorMode,
  minTrackLength: number,
  maxReprojectionError: number,
  thinning: number,
  selectedImagePointIds: Set<bigint>,
  showSelectionHighlight: boolean,
  highlightColor: [number, number, number],
  floorColorMode: FloorColorMode,
  pointDistances: Float32Array | null,
  distanceThreshold: number,
  indexToPoint3DIdRef: React.RefObject<Map<number, bigint>>
): {
  positions: Float32Array | null;
  colors: Float32Array | null;
  selectedPositions: Float32Array | null;
  selectedColors: Float32Array | null;
} | null {
  const count = wasmReconstruction.pointCount;
  const wasmPositions = wasmReconstruction.getPositions();
  const wasmColors = wasmReconstruction.getColors();
  const wasmErrors = wasmReconstruction.getErrors();
  const wasmTrackLengths = wasmReconstruction.getTrackLengths();
  const point3DIds = wasmReconstruction.getPoint3DIds();

  if (!wasmPositions || !wasmErrors || !wasmTrackLengths) {
    return null;
  }

  // Check for detached/invalid array (WASM memory may have been freed)
  if (wasmPositions.length === 0 || !Number.isFinite(wasmPositions[0])) {
    console.warn('[PointCloud] WASM slow path: positions array is invalid');
    return null;
  }

  // First pass: find min/max and count filtered points
  // 0=skip, 1=include, 2=include+highlight
  let minErrorVal = Infinity;
  let maxErrorVal = -Infinity;
  let minTrackVal = Infinity;
  let maxTrackVal = -Infinity;
  let totalCount = 0;
  let highlightCount = 0;
  const pointState = new Uint8Array(count);

  for (let i = 0; i < count; i++) {
    // Thinning: skip points based on index
    if (thinning > 0 && i % (thinning + 1) !== 0) continue;
    // Filter by track length
    if (wasmTrackLengths[i] < minTrackLength) continue;
    // Filter by reprojection error
    if (wasmErrors[i] > maxReprojectionError) continue;

    // Update stats
    if (wasmErrors[i] >= 0) {
      minErrorVal = Math.min(minErrorVal, wasmErrors[i]);
      maxErrorVal = Math.max(maxErrorVal, wasmErrors[i]);
    }
    minTrackVal = Math.min(minTrackVal, wasmTrackLengths[i]);
    maxTrackVal = Math.max(maxTrackVal, wasmTrackLengths[i]);

    // Check if highlighted
    const point3DId = point3DIds ? point3DIds[i] : BigInt(i + 1);
    const shouldHighlight = showSelectionHighlight && selectedImagePointIds.has(point3DId);

    pointState[i] = shouldHighlight ? 2 : 1;
    totalCount++;
    if (shouldHighlight) highlightCount++;
  }

  if (totalCount === 0) {
    if (indexToPoint3DIdRef.current) {
      indexToPoint3DIdRef.current = new Map();
    }
    return { positions: null, colors: null, selectedPositions: null, selectedColors: null };
  }

  if (minErrorVal === maxErrorVal) maxErrorVal = minErrorVal + 1;
  if (minTrackVal === maxTrackVal) maxTrackVal = minTrackVal + 1;

  // Compute max distance for floor mode normalization
  let maxFloorDist = 0;
  if (floorColorMode === 'distance' && pointDistances) {
    for (let i = 0; i < count; i++) {
      if (pointState[i] > 0) {
        maxFloorDist = Math.max(maxFloorDist, Math.abs(pointDistances[i]));
      }
    }
    if (maxFloorDist === 0) maxFloorDist = 1;
  }

  // Build color context
  const colorContext: WasmColorContext = {
    wasmColors,
    wasmErrors,
    wasmTrackLengths,
    minError: minErrorVal,
    maxError: maxErrorVal,
    minTrack: minTrackVal,
    maxTrack: maxTrackVal,
    floorColorMode,
    pointDistances,
    distanceThreshold,
    maxFloorDist,
  };

  // Build output arrays
  const positions = new Float32Array(totalCount * 3);
  const colors = new Float32Array(totalCount * 3);
  const selectedPositions = highlightCount > 0 ? new Float32Array(highlightCount * 3) : null;
  const selectedColors = highlightCount > 0 ? new Float32Array(highlightCount * 3) : null;
  const indexToPoint3DId = new Map<number, bigint>();

  let mainIdx = 0;
  let highlightIdx = 0;
  for (let i = 0; i < count; i++) {
    const state = pointState[i];
    if (state === 0) continue;

    // All filtered points go in main arrays
    const i3 = mainIdx * 3;
    positions[i3] = wasmPositions[i * 3];
    positions[i3 + 1] = wasmPositions[i * 3 + 1];
    positions[i3 + 2] = wasmPositions[i * 3 + 2];
    const c = computeColorFromWasm(i, colorMode, colorContext);
    colors[i3] = c[0];
    colors[i3 + 1] = c[1];
    colors[i3 + 2] = c[2];
    const point3DId = point3DIds ? point3DIds[i] : BigInt(i + 1);
    indexToPoint3DId.set(mainIdx, point3DId);
    mainIdx++;

    // Highlighted points also go in overlay
    if (state === 2 && selectedPositions && selectedColors) {
      const h3 = highlightIdx * 3;
      selectedPositions[h3] = wasmPositions[i * 3];
      selectedPositions[h3 + 1] = wasmPositions[i * 3 + 1];
      selectedPositions[h3 + 2] = wasmPositions[i * 3 + 2];
      selectedColors[h3] = highlightColor[0];
      selectedColors[h3 + 1] = highlightColor[1];
      selectedColors[h3 + 2] = highlightColor[2];
      highlightIdx++;
    }
  }

  if (indexToPoint3DIdRef.current) {
    indexToPoint3DIdRef.current = indexToPoint3DId;
  }

  return { positions, colors, selectedPositions, selectedColors };
}

/**
 * Compute slow path using points3D Map fallback.
 */
function computeSlowPathMap(
  reconstruction: Reconstruction,
  colorMode: ColorMode,
  minTrackLength: number,
  maxReprojectionError: number,
  thinning: number,
  selectedImagePointIds: Set<bigint>,
  showSelectionHighlight: boolean,
  highlightColor: [number, number, number],
  indexToPoint3DIdRef: React.RefObject<Map<number, bigint>>
): {
  positions: Float32Array | null;
  colors: Float32Array | null;
  selectedPositions: Float32Array | null;
  selectedColors: Float32Array | null;
} {
  if (!reconstruction.points3D || reconstruction.points3D.size === 0) {
    console.warn('[PointCloud] No points3D Map and WASM not available');
    if (indexToPoint3DIdRef.current) {
      indexToPoint3DIdRef.current = new Map();
    }
    return { positions: null, colors: null, selectedPositions: null, selectedColors: null };
  }

  // SINGLE PASS: filter, compute stats, and collect all points
  let minError = Infinity;
  let maxError = -Infinity;
  let minTrack = Infinity;
  let maxTrack = -Infinity;
  const allPoints: Point3D[] = [];
  const highlightedPoints: Point3D[] = [];

  let iterIndex = 0;
  for (const point of reconstruction.points3D.values()) {
    // Thinning: skip points based on iteration index
    if (thinning > 0 && iterIndex % (thinning + 1) !== 0) {
      iterIndex++;
      continue;
    }
    iterIndex++;
    // Filter by track length
    if (point.track.length < minTrackLength) continue;
    // Filter by reprojection error
    if (point.error > maxReprojectionError) continue;

    // Update stats
    if (point.error >= 0) {
      minError = Math.min(minError, point.error);
      maxError = Math.max(maxError, point.error);
    }
    minTrack = Math.min(minTrack, point.track.length);
    maxTrack = Math.max(maxTrack, point.track.length);

    // All filtered points go in main array
    allPoints.push(point);

    // Highlighted points also go in overlay array
    const isInSet = selectedImagePointIds.has(point.point3DId);
    const shouldHighlight = showSelectionHighlight && isInSet;
    if (shouldHighlight) {
      highlightedPoints.push(point);
    }
  }

  if (allPoints.length === 0) {
    if (indexToPoint3DIdRef.current) {
      indexToPoint3DIdRef.current = new Map();
    }
    return { positions: null, colors: null, selectedPositions: null, selectedColors: null };
  }

  if (minError === maxError) maxError = minError + 1;
  if (minTrack === maxTrack) maxTrack = minTrack + 1;

  const colorContext: MapColorContext = {
    minError,
    maxError,
    minTrack,
    maxTrack,
  };

  // Build index-to-point3DId mapping for point picking
  const indexToPoint3DId = new Map<number, bigint>();

  // All filtered points go in main arrays
  const positions = new Float32Array(allPoints.length * 3);
  const colors = new Float32Array(allPoints.length * 3);
  for (let i = 0; i < allPoints.length; i++) {
    const point = allPoints[i];
    const i3 = i * 3;
    positions[i3] = point.xyz[0];
    positions[i3 + 1] = point.xyz[1];
    positions[i3 + 2] = point.xyz[2];
    const c = computeColorFromPoint3D(point, colorMode, colorContext);
    colors[i3] = c[0];
    colors[i3 + 1] = c[1];
    colors[i3 + 2] = c[2];
    // Store mapping for point picking
    indexToPoint3DId.set(i, point.point3DId);
  }

  // Update ref with new mapping
  if (indexToPoint3DIdRef.current) {
    indexToPoint3DIdRef.current = indexToPoint3DId;
  }

  // Highlighted points overlay
  let selectedPositions: Float32Array | null = null;
  let selectedColors: Float32Array | null = null;
  if (highlightedPoints.length > 0) {
    selectedPositions = new Float32Array(highlightedPoints.length * 3);
    selectedColors = new Float32Array(highlightedPoints.length * 3);
    for (let i = 0; i < highlightedPoints.length; i++) {
      const point = highlightedPoints[i];
      const i3 = i * 3;
      selectedPositions[i3] = point.xyz[0];
      selectedPositions[i3 + 1] = point.xyz[1];
      selectedPositions[i3 + 2] = point.xyz[2];
      selectedColors[i3] = highlightColor[0];
      selectedColors[i3 + 1] = highlightColor[1];
      selectedColors[i3 + 2] = highlightColor[2];
    }
  }

  return { positions, colors, selectedPositions, selectedColors };
}
