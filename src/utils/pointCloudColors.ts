/**
 * Pure color computation functions for point cloud rendering.
 * These functions are extracted from PointCloud.tsx for reusability and testability.
 */

import { BRIGHTNESS, COLORMAP } from '../theme';
import { sRGBToLinear, jetColormap } from './colorUtils';
import type { Point3D } from '../types/colmap';
import type { ColorMode } from '../store/types';
import type { FloorColorMode } from '../store/stores/floorPlaneStore';

/**
 * Color computation context for WASM-based rendering.
 * Contains pre-computed normalization values for efficient color lookups.
 */
export interface WasmColorContext {
  wasmColors: Float32Array | null;
  wasmErrors: Float32Array;
  wasmTrackLengths: Uint32Array;
  minError: number;
  maxError: number;
  minTrack: number;
  maxTrack: number;
  floorColorMode: FloorColorMode;
  pointDistances: Float32Array | null;
  distanceThreshold: number;
  maxFloorDist: number;
}

/**
 * Color computation context for Map-based rendering.
 * Contains pre-computed normalization values for efficient color lookups.
 */
export interface MapColorContext {
  minError: number;
  maxError: number;
  minTrack: number;
  maxTrack: number;
}

/**
 * Compute color for a point using WASM arrays.
 *
 * @param index - Point index in the WASM arrays
 * @param colorMode - The color mode to use (rgb, error, trackLength)
 * @param context - Pre-computed context with normalization values
 * @returns RGB tuple [r, g, b] with values 0-1
 */
export function computeColorFromWasm(
  index: number,
  colorMode: ColorMode,
  context: WasmColorContext
): [number, number, number] {
  const {
    wasmColors,
    wasmErrors,
    wasmTrackLengths,
    minError,
    maxError,
    minTrack,
    maxTrack,
    floorColorMode,
    pointDistances,
    distanceThreshold,
    maxFloorDist,
  } = context;

  // Floor coloring overrides normal colorMode when active
  if (floorColorMode !== 'off' && pointDistances) {
    if (floorColorMode === 'binary') {
      const isInlier = Math.abs(pointDistances[index]) <= distanceThreshold;
      return isInlier ? [0.2, 0.9, 0.2] : [0.9, 0.2, 0.2];
    }
    // distance mode
    const distNorm = Math.abs(pointDistances[index]) / maxFloorDist;
    return jetColormap(distNorm);
  }

  if (colorMode === 'error') {
    const errorNorm =
      wasmErrors[index] >= 0
        ? (wasmErrors[index] - minError) / (maxError - minError)
        : 0;
    return jetColormap(errorNorm);
  }

  if (colorMode === 'trackLength') {
    const { baseR, rangeR, baseG, rangeG, baseB, rangeB } = COLORMAP.trackLength;
    const trackNorm = (wasmTrackLengths[index] - minTrack) / (maxTrack - minTrack);
    return [
      baseR + trackNorm * rangeR,
      baseG + trackNorm * rangeG,
      baseB - trackNorm * rangeB,
    ];
  }

  // RGB mode (default fallback)
  if (wasmColors) {
    return [
      sRGBToLinear(wasmColors[index * 3]),
      sRGBToLinear(wasmColors[index * 3 + 1]),
      sRGBToLinear(wasmColors[index * 3 + 2]),
    ];
  }

  return [1, 1, 1];
}

/**
 * Compute color for a point using Point3D object.
 *
 * @param point - The Point3D object
 * @param colorMode - The color mode to use (rgb, error, trackLength)
 * @param context - Pre-computed context with normalization values
 * @returns RGB tuple [r, g, b] with values 0-1
 */
export function computeColorFromPoint3D(
  point: Point3D,
  colorMode: ColorMode,
  context: MapColorContext
): [number, number, number] {
  const { minError, maxError, minTrack, maxTrack } = context;

  if (colorMode === 'error') {
    const errorNorm =
      point.error >= 0 ? (point.error - minError) / (maxError - minError) : 0;
    return jetColormap(errorNorm);
  }

  if (colorMode === 'trackLength') {
    const { baseR, rangeR, baseG, rangeG, baseB, rangeB } = COLORMAP.trackLength;
    const trackNorm = (point.track.length - minTrack) / (maxTrack - minTrack);
    return [
      baseR + trackNorm * rangeR,
      baseG + trackNorm * rangeG,
      baseB - trackNorm * rangeB,
    ];
  }

  // RGB mode (default fallback)
  // Convert sRGB colors from COLMAP to linear space for proper rendering
  return [
    sRGBToLinear(point.rgb[0] / BRIGHTNESS.max),
    sRGBToLinear(point.rgb[1] / BRIGHTNESS.max),
    sRGBToLinear(point.rgb[2] / BRIGHTNESS.max),
  ];
}

/**
 * Compute colors for fast path (no filters, WASM available).
 * Returns a new Float32Array with computed colors.
 *
 * @param count - Number of points
 * @param colorMode - The color mode to use
 * @param wasmColors - WASM color array (normalized 0-1)
 * @param wasmErrors - WASM error array
 * @param wasmTrackLengths - WASM track length array
 * @returns Float32Array of RGB colors
 */
export function computeColorsForFastPath(
  count: number,
  colorMode: ColorMode,
  wasmColors: Float32Array | null,
  wasmErrors: Float32Array | null,
  wasmTrackLengths: Uint32Array | null
): Float32Array {
  const finalColors = new Float32Array(count * 3);

  if (colorMode === 'rgb') {
    // Use WASM colors directly - already in normalized 0-1 format
    if (wasmColors) {
      // Convert from sRGB to linear for proper Three.js rendering
      for (let i = 0; i < wasmColors.length; i++) {
        finalColors[i] = sRGBToLinear(wasmColors[i]);
      }
    } else {
      // Fallback: white color
      finalColors.fill(1);
    }
  } else if (colorMode === 'error') {
    // Compute error-based colors from WASM error array
    if (wasmErrors) {
      // Find min/max for normalization
      let minError = Infinity;
      let maxError = -Infinity;
      for (let i = 0; i < count; i++) {
        if (wasmErrors[i] >= 0) {
          minError = Math.min(minError, wasmErrors[i]);
          maxError = Math.max(maxError, wasmErrors[i]);
        }
      }
      if (minError === maxError) {
        maxError = minError + 1;
      }

      for (let i = 0; i < count; i++) {
        const errorNorm =
          wasmErrors[i] >= 0 ? (wasmErrors[i] - minError) / (maxError - minError) : 0;
        const [r, g, b] = jetColormap(errorNorm);
        finalColors[i * 3] = r;
        finalColors[i * 3 + 1] = g;
        finalColors[i * 3 + 2] = b;
      }
    } else {
      finalColors.fill(1);
    }
  } else {
    // trackLength mode
    if (wasmTrackLengths) {
      // Find min/max for normalization
      let minTrack = Infinity;
      let maxTrack = -Infinity;
      for (let i = 0; i < count; i++) {
        minTrack = Math.min(minTrack, wasmTrackLengths[i]);
        maxTrack = Math.max(maxTrack, wasmTrackLengths[i]);
      }
      if (minTrack === maxTrack) {
        maxTrack = minTrack + 1;
      }

      const { baseR, rangeR, baseG, rangeG, baseB, rangeB } = COLORMAP.trackLength;
      for (let i = 0; i < count; i++) {
        const trackNorm = (wasmTrackLengths[i] - minTrack) / (maxTrack - minTrack);
        finalColors[i * 3] = baseR + trackNorm * rangeR;
        finalColors[i * 3 + 1] = baseG + trackNorm * rangeG;
        finalColors[i * 3 + 2] = baseB - trackNorm * rangeB;
      }
    } else {
      finalColors.fill(1);
    }
  }

  return finalColors;
}

/**
 * Apply floor coloring to an existing color array.
 * Modifies the array in-place.
 *
 * @param colors - The color array to modify
 * @param count - Number of points
 * @param floorColorMode - The floor color mode
 * @param pointDistances - Distance array from floor plane
 * @param distanceThreshold - Threshold for binary mode
 */
export function applyFloorColoring(
  colors: Float32Array,
  count: number,
  floorColorMode: FloorColorMode,
  pointDistances: Float32Array,
  distanceThreshold: number
): void {
  if (floorColorMode === 'binary') {
    // Binary: green for inliers, red for outliers
    for (let i = 0; i < count; i++) {
      const isInlier = Math.abs(pointDistances[i]) <= distanceThreshold;
      colors[i * 3] = isInlier ? 0.2 : 0.9; // R: low for inliers
      colors[i * 3 + 1] = isInlier ? 0.9 : 0.2; // G: high for inliers
      colors[i * 3 + 2] = 0.2; // B: low for both
    }
  } else {
    // distance mode: jet colormap by absolute distance
    let maxDist = 0;
    for (let i = 0; i < count; i++) {
      maxDist = Math.max(maxDist, Math.abs(pointDistances[i]));
    }
    if (maxDist === 0) {
      maxDist = 1;
    }

    for (let i = 0; i < count; i++) {
      const distNorm = Math.abs(pointDistances[i]) / maxDist;
      const [r, g, b] = jetColormap(distNorm);
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
  }
}
