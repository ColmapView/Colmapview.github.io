/**
 * Utility functions for point cloud color computation.
 * Extracted from PointCloud.tsx for testability.
 */

import { COLORMAP } from '../theme';
import { sRGBToLinear, jetColormap } from './colorUtils';

/**
 * Statistics result from computing min/max values.
 */
export interface MinMaxStats {
  min: number;
  max: number;
}

/**
 * Options for computing point colors.
 */
export interface ColorComputeOptions {
  // For RGB mode
  wasmColors?: Float32Array;
  // For error mode
  errors?: Float32Array;
  errorStats?: MinMaxStats;
  // For trackLength mode
  trackLengths?: Uint32Array;
  trackStats?: MinMaxStats;
  // For floor mode
  pointDistances?: Float32Array;
  distanceThreshold?: number;
  floorColorMode?: 'off' | 'binary' | 'distance';
  maxFloorDist?: number;
}

/**
 * Compute min/max for error values, ignoring negative values.
 * Returns { min: Infinity, max: -Infinity } for empty arrays.
 */
export function computeErrorStats(errors: Float32Array): MinMaxStats {
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < errors.length; i++) {
    const val = errors[i];
    if (val >= 0) {
      if (val < min) min = val;
      if (val > max) max = val;
    }
  }

  return { min, max };
}

/**
 * Compute min/max for track lengths.
 * Returns { min: Infinity, max: -Infinity } for empty arrays.
 */
export function computeTrackStats(trackLengths: Uint32Array): MinMaxStats {
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < trackLengths.length; i++) {
    const val = trackLengths[i];
    if (val < min) min = val;
    if (val > max) max = val;
  }

  return { min, max };
}

/**
 * Normalize a value to 0-1 range.
 * Handles edge case where min === max by returning 0.
 * Clamps result to [0, 1].
 */
export function normalizeValue(value: number, min: number, max: number): number {
  if (min === max) return 0;
  const normalized = (value - min) / (max - min);
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Safe stats that handle edge cases (returns adjusted max if min === max).
 */
export function safeMinMax(stats: MinMaxStats): MinMaxStats {
  if (stats.min === stats.max) {
    return { min: stats.min, max: stats.min + 1 };
  }
  if (stats.min === Infinity) {
    return { min: 0, max: 1 };
  }
  return stats;
}

/**
 * Compute color array for a given mode.
 * @param mode - Color mode: 'rgb', 'error', 'trackLength', or 'floor'
 * @param count - Number of points
 * @param options - Mode-specific data arrays and settings
 * @returns Float32Array of RGB values (count * 3 length)
 */
export function computePointColors(
  mode: 'rgb' | 'error' | 'trackLength' | 'floor',
  count: number,
  options: ColorComputeOptions
): Float32Array {
  const colors = new Float32Array(count * 3);

  if (mode === 'rgb') {
    return computeRGBColors(count, options.wasmColors, colors);
  } else if (mode === 'error') {
    return computeErrorColors(count, options.errors, options.errorStats, colors);
  } else if (mode === 'trackLength') {
    return computeTrackLengthColors(count, options.trackLengths, options.trackStats, colors);
  } else if (mode === 'floor') {
    return computeFloorColors(count, options, colors);
  }

  // Fallback: white
  colors.fill(1);
  return colors;
}

/**
 * Compute RGB colors from WASM color array with sRGB to linear conversion.
 */
function computeRGBColors(
  count: number,
  wasmColors: Float32Array | undefined,
  colors: Float32Array
): Float32Array {
  if (wasmColors && wasmColors.length >= count * 3) {
    for (let i = 0; i < count * 3; i++) {
      colors[i] = sRGBToLinear(wasmColors[i]);
    }
  } else {
    colors.fill(1);
  }
  return colors;
}

/**
 * Compute error-based colors using jet colormap.
 */
function computeErrorColors(
  count: number,
  errors: Float32Array | undefined,
  stats: MinMaxStats | undefined,
  colors: Float32Array
): Float32Array {
  if (!errors) {
    colors.fill(1);
    return colors;
  }

  const safeStats = stats ? safeMinMax(stats) : safeMinMax(computeErrorStats(errors));
  const { min, max } = safeStats;

  for (let i = 0; i < count; i++) {
    const errorNorm = errors[i] >= 0 ? normalizeValue(errors[i], min, max) : 0;
    const [r, g, b] = jetColormap(errorNorm);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  return colors;
}

/**
 * Compute track length-based colors using custom colormap.
 */
function computeTrackLengthColors(
  count: number,
  trackLengths: Uint32Array | undefined,
  stats: MinMaxStats | undefined,
  colors: Float32Array
): Float32Array {
  if (!trackLengths) {
    colors.fill(1);
    return colors;
  }

  const safeStats = stats ? safeMinMax(stats) : safeMinMax(computeTrackStats(trackLengths));
  const { min, max } = safeStats;
  const { baseR, rangeR, baseG, rangeG, baseB, rangeB } = COLORMAP.trackLength;

  for (let i = 0; i < count; i++) {
    const trackNorm = normalizeValue(trackLengths[i], min, max);
    colors[i * 3] = baseR + trackNorm * rangeR;
    colors[i * 3 + 1] = baseG + trackNorm * rangeG;
    colors[i * 3 + 2] = baseB - trackNorm * rangeB;
  }

  return colors;
}

/**
 * Compute floor distance-based colors.
 */
function computeFloorColors(
  count: number,
  options: ColorComputeOptions,
  colors: Float32Array
): Float32Array {
  const { pointDistances, distanceThreshold, floorColorMode, maxFloorDist, wasmColors } = options;

  if (!pointDistances || pointDistances.length < count || floorColorMode === 'off') {
    // Fallback to RGB colors
    return computeRGBColors(count, wasmColors, colors);
  }

  if (floorColorMode === 'binary') {
    const threshold = distanceThreshold ?? 0.1;
    for (let i = 0; i < count; i++) {
      const isInlier = Math.abs(pointDistances[i]) <= threshold;
      colors[i * 3] = isInlier ? 0.2 : 0.9;     // R: low for inliers
      colors[i * 3 + 1] = isInlier ? 0.9 : 0.2; // G: high for inliers
      colors[i * 3 + 2] = 0.2;                   // B: low for both
    }
  } else {
    // 'distance' mode: jet colormap by absolute distance
    const maxDist = maxFloorDist && maxFloorDist > 0 ? maxFloorDist : computeMaxDistance(pointDistances);
    for (let i = 0; i < count; i++) {
      const distNorm = Math.abs(pointDistances[i]) / maxDist;
      const [r, g, b] = jetColormap(distNorm);
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
  }

  return colors;
}

/**
 * Compute maximum absolute distance from point distances array.
 */
function computeMaxDistance(pointDistances: Float32Array): number {
  let maxDist = 0;
  for (let i = 0; i < pointDistances.length; i++) {
    const absDist = Math.abs(pointDistances[i]);
    if (absDist > maxDist) maxDist = absDist;
  }
  return maxDist === 0 ? 1 : maxDist;
}

/**
 * Compute color for a single point at index (for slow path with filtering).
 */
export function computeSinglePointColor(
  index: number,
  mode: 'rgb' | 'error' | 'trackLength' | 'floor',
  options: ColorComputeOptions & {
    minError: number;
    maxError: number;
    minTrack: number;
    maxTrack: number;
  }
): [number, number, number] {
  if (mode === 'error' && options.errors) {
    const errorNorm = options.errors[index] >= 0
      ? normalizeValue(options.errors[index], options.minError, options.maxError)
      : 0;
    return jetColormap(errorNorm);
  }

  if (mode === 'trackLength' && options.trackLengths) {
    const { baseR, rangeR, baseG, rangeG, baseB, rangeB } = COLORMAP.trackLength;
    const trackNorm = normalizeValue(options.trackLengths[index], options.minTrack, options.maxTrack);
    return [
      baseR + trackNorm * rangeR,
      baseG + trackNorm * rangeG,
      baseB - trackNorm * rangeB,
    ];
  }

  if (mode === 'floor' && options.pointDistances && options.floorColorMode !== 'off') {
    if (options.floorColorMode === 'binary') {
      const isInlier = Math.abs(options.pointDistances[index]) <= (options.distanceThreshold ?? 0.1);
      return isInlier ? [0.2, 0.9, 0.2] : [0.9, 0.2, 0.2];
    } else {
      const maxDist = options.maxFloorDist ?? 1;
      const distNorm = Math.abs(options.pointDistances[index]) / maxDist;
      return jetColormap(distNorm);
    }
  }

  // RGB mode (default)
  if (options.wasmColors) {
    return [
      sRGBToLinear(options.wasmColors[index * 3]),
      sRGBToLinear(options.wasmColors[index * 3 + 1]),
      sRGBToLinear(options.wasmColors[index * 3 + 2]),
    ];
  }

  return [1, 1, 1];
}
