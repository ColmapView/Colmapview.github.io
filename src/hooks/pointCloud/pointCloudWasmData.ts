import type { ColorMode } from '../../store/types';
import type { FloorColorMode } from '../../store/stores/floorPlaneStore';
import type { WasmReconstructionWrapper } from '../../wasm/reconstruction';
import { appLogger } from '../../utils/logger';
import {
  computeColorFromWasm,
  type WasmColorContext,
} from '../../utils/pointCloudColors';
import type { PointCloudDataResult } from './types';
import {
  getPoint3DIdForIndex,
  normalizeEqualRange,
  shouldIncludePointByFilters,
} from './pointCloudDataPolicy';

export interface PointCloudWasmSlowPathParams {
  wasmReconstruction: WasmReconstructionWrapper;
  colorMode: ColorMode;
  minTrackLength: number;
  maxReprojectionError: number;
  thinning: number;
  selectedImagePointIds: Set<bigint>;
  showSelectionHighlight: boolean;
  highlightColor: [number, number, number];
  floorColorMode: FloorColorMode;
  pointDistances: Float32Array | null;
  distanceThreshold: number;
}

/**
 * Compute filtered point-cloud data from WASM arrays.
 */
export function computeSlowPathWasm({
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
}: PointCloudWasmSlowPathParams): PointCloudDataResult | null {
  const count = wasmReconstruction.pointCount;
  const wasmPositions = wasmReconstruction.getPositions();
  const wasmColors = wasmReconstruction.getColors();
  const wasmErrors = wasmReconstruction.getErrors();
  const wasmTrackLengths = wasmReconstruction.getTrackLengths();
  const point3DIds = wasmReconstruction.getPoint3DIds();

  if (!wasmPositions || !wasmErrors || !wasmTrackLengths) {
    return null;
  }

  if (wasmPositions.length === 0 || !Number.isFinite(wasmPositions[0])) {
    appLogger.warn('[PointCloud] WASM slow path: positions array is invalid');
    return null;
  }

  let minErrorVal = Infinity;
  let maxErrorVal = -Infinity;
  let minTrackVal = Infinity;
  let maxTrackVal = -Infinity;
  let totalCount = 0;
  let highlightCount = 0;
  const pointState = new Uint8Array(count);

  for (let i = 0; i < count; i++) {
    if (!shouldIncludePointByFilters(i, wasmTrackLengths[i], wasmErrors[i], {
      minTrackLength,
      maxReprojectionError,
      thinning,
    })) {
      continue;
    }

    if (wasmErrors[i] >= 0) {
      minErrorVal = Math.min(minErrorVal, wasmErrors[i]);
      maxErrorVal = Math.max(maxErrorVal, wasmErrors[i]);
    }
    minTrackVal = Math.min(minTrackVal, wasmTrackLengths[i]);
    maxTrackVal = Math.max(maxTrackVal, wasmTrackLengths[i]);

    const point3DId = getPoint3DIdForIndex(point3DIds, i);
    const shouldHighlight = showSelectionHighlight && selectedImagePointIds.has(point3DId);

    pointState[i] = shouldHighlight ? 2 : 1;
    totalCount++;
    if (shouldHighlight) highlightCount++;
  }

  if (totalCount === 0) {
    return {
      positions: null,
      colors: null,
      selectedPositions: null,
      selectedColors: null,
      indexToPoint3DId: new Map(),
    };
  }

  const errorRange = normalizeEqualRange(minErrorVal, maxErrorVal);
  const trackRange = normalizeEqualRange(minTrackVal, maxTrackVal);

  let maxFloorDist = 0;
  if (floorColorMode === 'distance' && pointDistances) {
    for (let i = 0; i < count; i++) {
      if (pointState[i] > 0) {
        maxFloorDist = Math.max(maxFloorDist, Math.abs(pointDistances[i]));
      }
    }
    if (maxFloorDist === 0) maxFloorDist = 1;
  }

  const colorContext: WasmColorContext = {
    wasmColors,
    wasmErrors,
    wasmTrackLengths,
    minError: errorRange.min,
    maxError: errorRange.max,
    minTrack: trackRange.min,
    maxTrack: trackRange.max,
    floorColorMode,
    pointDistances,
    distanceThreshold,
    maxFloorDist,
  };

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

    const i3 = mainIdx * 3;
    positions[i3] = wasmPositions[i * 3];
    positions[i3 + 1] = wasmPositions[i * 3 + 1];
    positions[i3 + 2] = wasmPositions[i * 3 + 2];
    const c = computeColorFromWasm(i, colorMode, colorContext);
    colors[i3] = c[0];
    colors[i3 + 1] = c[1];
    colors[i3 + 2] = c[2];
    const point3DId = getPoint3DIdForIndex(point3DIds, i);
    indexToPoint3DId.set(mainIdx, point3DId);
    mainIdx++;

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

  return { positions, colors, selectedPositions, selectedColors, indexToPoint3DId };
}
