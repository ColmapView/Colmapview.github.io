import type { ColorMode } from '../../store/types';
import type { Point3D, Point3DId } from '../../types/colmap';
import { appLogger } from '../../utils/logger';
import {
  computeColorFromPoint3D,
  type MapColorContext,
} from '../../utils/pointCloudColors';
import type { PointCloudDataResult } from './types';
import {
  normalizeEqualRange,
  shouldIncludePointByFilters,
} from './pointCloudDataPolicy';

export interface PointCloudMapSlowPathParams {
  points3D: Map<Point3DId, Point3D> | undefined;
  colorMode: ColorMode;
  minTrackLength: number;
  maxReprojectionError: number;
  thinning: number;
  selectedImagePointIds: Set<bigint>;
  showSelectionHighlight: boolean;
  highlightColor: [number, number, number];
}

/**
 * Compute filtered point-cloud data from the JS points3D Map fallback.
 */
export function computeSlowPathMap({
  points3D,
  colorMode,
  minTrackLength,
  maxReprojectionError,
  thinning,
  selectedImagePointIds,
  showSelectionHighlight,
  highlightColor,
}: PointCloudMapSlowPathParams): PointCloudDataResult {
  if (!points3D || points3D.size === 0) {
    appLogger.warn('[PointCloud] No points3D Map and WASM not available');
    return createEmptyPointCloudData();
  }

  let minError = Infinity;
  let maxError = -Infinity;
  let minTrack = Infinity;
  let maxTrack = -Infinity;
  const allPoints: Point3D[] = [];
  const highlightedPoints: Point3D[] = [];

  let iterIndex = 0;
  for (const point of points3D.values()) {
    const pointIndex = iterIndex;
    iterIndex++;

    if (!shouldIncludePointByFilters(pointIndex, point.track.length, point.error, {
      minTrackLength,
      maxReprojectionError,
      thinning,
    })) {
      continue;
    }

    if (point.error >= 0) {
      minError = Math.min(minError, point.error);
      maxError = Math.max(maxError, point.error);
    }
    minTrack = Math.min(minTrack, point.track.length);
    maxTrack = Math.max(maxTrack, point.track.length);

    allPoints.push(point);

    const shouldHighlight = showSelectionHighlight && selectedImagePointIds.has(point.point3DId);
    if (shouldHighlight) {
      highlightedPoints.push(point);
    }
  }

  if (allPoints.length === 0) {
    return createEmptyPointCloudData();
  }

  const errorRange = normalizeEqualRange(minError, maxError);
  const trackRange = normalizeEqualRange(minTrack, maxTrack);
  const colorContext: MapColorContext = {
    minError: errorRange.min,
    maxError: errorRange.max,
    minTrack: trackRange.min,
    maxTrack: trackRange.max,
  };

  const indexToPoint3DId = new Map<number, bigint>();
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
    indexToPoint3DId.set(i, point.point3DId);
  }

  const { selectedPositions, selectedColors } = buildHighlightedPointArrays(
    highlightedPoints,
    highlightColor
  );

  return { positions, colors, selectedPositions, selectedColors, indexToPoint3DId };
}

function buildHighlightedPointArrays(
  highlightedPoints: Point3D[],
  highlightColor: [number, number, number]
): Pick<PointCloudDataResult, 'selectedPositions' | 'selectedColors'> {
  if (highlightedPoints.length === 0) {
    return { selectedPositions: null, selectedColors: null };
  }

  const selectedPositions = new Float32Array(highlightedPoints.length * 3);
  const selectedColors = new Float32Array(highlightedPoints.length * 3);

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

  return { selectedPositions, selectedColors };
}

function createEmptyPointCloudData(): PointCloudDataResult {
  return {
    positions: null,
    colors: null,
    selectedPositions: null,
    selectedColors: null,
    indexToPoint3DId: new Map(),
  };
}
