/**
 * Camera model conversion utilities for COLMAP.
 *
 * This module provides functions to convert between COLMAP camera models,
 * handling exact conversions, approximate conversions, and detecting
 * incompatible model pairs.
 *
 * @see docs/camera-model-conversions.md for detailed documentation
 */

import type { Camera } from '../types/colmap';
import { CameraModelId } from '../types/colmap';

/** Threshold for considering a parameter negligible */
const DEFAULT_THRESHOLD = 1e-6;

/** Threshold for aspect ratio difference (fx vs fy) */
const ASPECT_RATIO_THRESHOLD = 0.01;

/**
 * Parameter names for each camera model, in order.
 */
export const PARAM_NAMES: Record<CameraModelId, string[]> = {
  [CameraModelId.SIMPLE_PINHOLE]: ['f', 'cx', 'cy'],
  [CameraModelId.PINHOLE]: ['fx', 'fy', 'cx', 'cy'],
  [CameraModelId.SIMPLE_RADIAL]: ['f', 'cx', 'cy', 'k'],
  [CameraModelId.RADIAL]: ['f', 'cx', 'cy', 'k1', 'k2'],
  [CameraModelId.OPENCV]: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'p1', 'p2'],
  [CameraModelId.OPENCV_FISHEYE]: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'k3', 'k4'],
  [CameraModelId.FULL_OPENCV]: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'p1', 'p2', 'k3', 'k4', 'k5', 'k6'],
  [CameraModelId.FOV]: ['fx', 'fy', 'cx', 'cy', 'ω'],
  [CameraModelId.SIMPLE_RADIAL_FISHEYE]: ['f', 'cx', 'cy', 'k'],
  [CameraModelId.RADIAL_FISHEYE]: ['f', 'cx', 'cy', 'k1', 'k2'],
  [CameraModelId.THIN_PRISM_FISHEYE]: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'p1', 'p2', 'k3', 'k4', 'sx1', 'sy1'],
  [CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE]: ['fx', 'fy', 'cx', 'cy', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'p1', 'p2', 'sx1', 'sy1', 'sx2', 'sy2'],
};

/**
 * Detailed characterization of a conversion.
 */
export type ConversionCharacterization =
  | 'exact'           // No change in meaning (same model or params are equivalent)
  | 'expansion'       // Adding new parameters with zero/default values
  | 'lossy'           // Dropping non-negligible parameters
  | 'approximation';  // Different mathematical formula (e.g., FOV ↔ radial)

/**
 * Preview information for a camera model conversion.
 */
export interface ConversionPreview {
  /** Source model parameter names */
  sourceParamNames: string[];
  /** Source model parameter values */
  sourceParams: number[];
  /** Target model parameter names */
  targetParamNames: string[];
  /** Target model parameter values */
  targetParams: number[];
  /** Characterization of the conversion */
  characterization: ConversionCharacterization;
  /** Whether the conversion loses information */
  isLossy: boolean;
  /** Whether the conversion adds new parameters */
  isExpansion: boolean;
  /** Description of what changes */
  description: string;
  /** Warning message if applicable */
  warning?: string;
}

/**
 * Result of a camera model conversion attempt.
 */
export type ConversionResult =
  | { type: 'exact'; params: number[] }
  | { type: 'approximate'; params: number[]; maxError: number; warning: string }
  | { type: 'incompatible'; reason: string };

/**
 * Compatibility level between two camera models.
 */
export type ConversionCompatibility = 'exact' | 'approximate' | 'incompatible';

/**
 * Result of conversion validation via reprojection.
 */
export interface ValidationResult {
  maxError: number;
  avgError: number;
  sampleCount: number;
}

/**
 * Check if a camera model is in the perspective family.
 */
function isPerspectiveModel(modelId: CameraModelId): boolean {
  return (
    modelId === CameraModelId.SIMPLE_PINHOLE ||
    modelId === CameraModelId.PINHOLE ||
    modelId === CameraModelId.SIMPLE_RADIAL ||
    modelId === CameraModelId.RADIAL ||
    modelId === CameraModelId.OPENCV ||
    modelId === CameraModelId.FULL_OPENCV ||
    modelId === CameraModelId.FOV
  );
}

/**
 * Check if a camera model is in the fisheye family.
 */
function isFisheyeModel(modelId: CameraModelId): boolean {
  return (
    modelId === CameraModelId.SIMPLE_RADIAL_FISHEYE ||
    modelId === CameraModelId.RADIAL_FISHEYE ||
    modelId === CameraModelId.OPENCV_FISHEYE ||
    modelId === CameraModelId.THIN_PRISM_FISHEYE
  );
}

/**
 * Check if conversion between two models is possible and what type.
 *
 * @param fromModel - Source camera model ID
 * @param toModel - Target camera model ID
 * @returns Compatibility level
 */
export function canConvertModel(
  fromModel: CameraModelId,
  toModel: CameraModelId
): ConversionCompatibility {
  // Same model
  if (fromModel === toModel) {
    return 'exact';
  }

  // Cross-family conversions are never compatible
  if (isPerspectiveModel(fromModel) && isFisheyeModel(toModel)) {
    return 'incompatible';
  }
  if (isFisheyeModel(fromModel) && isPerspectiveModel(toModel)) {
    return 'incompatible';
  }

  // FULL_OPENCV special handling
  if (fromModel === CameraModelId.FULL_OPENCV) {
    // FULL_OPENCV cannot be converted to any other model (rational polynomial has no inverse)
    return 'incompatible';
  }
  if (toModel === CameraModelId.FULL_OPENCV) {
    // Only perspective models that can reach OPENCV can be approximately converted to FULL_OPENCV
    // All perspective pinhole/radial models can expand to OPENCV, so they can all go to FULL_OPENCV
    if (
      fromModel === CameraModelId.SIMPLE_PINHOLE ||
      fromModel === CameraModelId.PINHOLE ||
      fromModel === CameraModelId.SIMPLE_RADIAL ||
      fromModel === CameraModelId.RADIAL ||
      fromModel === CameraModelId.OPENCV
    ) {
      return 'approximate';
    }
    return 'incompatible';
  }

  // Perspective family conversions
  if (isPerspectiveModel(fromModel) && isPerspectiveModel(toModel)) {
    return getPerspectiveCompatibility(fromModel, toModel);
  }

  // Fisheye family conversions
  if (isFisheyeModel(fromModel) && isFisheyeModel(toModel)) {
    return getFisheyeCompatibility(fromModel, toModel);
  }

  return 'incompatible';
}

function getPerspectiveCompatibility(
  fromModel: CameraModelId,
  toModel: CameraModelId
): ConversionCompatibility {
  // FOV model special cases
  if (fromModel === CameraModelId.FOV || toModel === CameraModelId.FOV) {
    // FOV <-> polynomial radial models are approximate
    if (
      toModel === CameraModelId.SIMPLE_RADIAL ||
      toModel === CameraModelId.RADIAL ||
      fromModel === CameraModelId.SIMPLE_RADIAL ||
      fromModel === CameraModelId.RADIAL
    ) {
      return 'approximate';
    }
    return 'incompatible';
  }

  // Expansion conversions (exact)
  const expansions: [CameraModelId, CameraModelId][] = [
    [CameraModelId.SIMPLE_PINHOLE, CameraModelId.PINHOLE],
    [CameraModelId.SIMPLE_PINHOLE, CameraModelId.SIMPLE_RADIAL],
    [CameraModelId.SIMPLE_PINHOLE, CameraModelId.RADIAL],
    [CameraModelId.SIMPLE_PINHOLE, CameraModelId.OPENCV],
    [CameraModelId.PINHOLE, CameraModelId.SIMPLE_RADIAL],
    [CameraModelId.PINHOLE, CameraModelId.RADIAL],
    [CameraModelId.PINHOLE, CameraModelId.OPENCV],
    [CameraModelId.SIMPLE_RADIAL, CameraModelId.RADIAL],
    [CameraModelId.SIMPLE_RADIAL, CameraModelId.OPENCV],
    [CameraModelId.RADIAL, CameraModelId.OPENCV],
  ];

  for (const [from, to] of expansions) {
    if (fromModel === from && toModel === to) {
      return 'exact';
    }
  }

  // Reduction conversions (approximate - need threshold check)
  const reductions: [CameraModelId, CameraModelId][] = [
    [CameraModelId.PINHOLE, CameraModelId.SIMPLE_PINHOLE],
    [CameraModelId.RADIAL, CameraModelId.SIMPLE_RADIAL],
    [CameraModelId.OPENCV, CameraModelId.RADIAL],
    [CameraModelId.OPENCV, CameraModelId.SIMPLE_RADIAL],
  ];

  for (const [from, to] of reductions) {
    if (fromModel === from && toModel === to) {
      return 'approximate';
    }
  }

  return 'incompatible';
}

function getFisheyeCompatibility(
  fromModel: CameraModelId,
  toModel: CameraModelId
): ConversionCompatibility {
  // Expansion conversions (exact)
  const expansions: [CameraModelId, CameraModelId][] = [
    [CameraModelId.SIMPLE_RADIAL_FISHEYE, CameraModelId.RADIAL_FISHEYE],
    [CameraModelId.SIMPLE_RADIAL_FISHEYE, CameraModelId.OPENCV_FISHEYE],
    [CameraModelId.SIMPLE_RADIAL_FISHEYE, CameraModelId.THIN_PRISM_FISHEYE],
    [CameraModelId.RADIAL_FISHEYE, CameraModelId.OPENCV_FISHEYE],
    [CameraModelId.RADIAL_FISHEYE, CameraModelId.THIN_PRISM_FISHEYE],
    [CameraModelId.OPENCV_FISHEYE, CameraModelId.THIN_PRISM_FISHEYE],
  ];

  for (const [from, to] of expansions) {
    if (fromModel === from && toModel === to) {
      return 'exact';
    }
  }

  // Reduction conversions (approximate)
  const reductions: [CameraModelId, CameraModelId][] = [
    [CameraModelId.RADIAL_FISHEYE, CameraModelId.SIMPLE_RADIAL_FISHEYE],
    [CameraModelId.OPENCV_FISHEYE, CameraModelId.RADIAL_FISHEYE],
    [CameraModelId.OPENCV_FISHEYE, CameraModelId.SIMPLE_RADIAL_FISHEYE],
    [CameraModelId.THIN_PRISM_FISHEYE, CameraModelId.OPENCV_FISHEYE],
    [CameraModelId.THIN_PRISM_FISHEYE, CameraModelId.RADIAL_FISHEYE],
    [CameraModelId.THIN_PRISM_FISHEYE, CameraModelId.SIMPLE_RADIAL_FISHEYE],
  ];

  for (const [from, to] of reductions) {
    if (fromModel === from && toModel === to) {
      return 'approximate';
    }
  }

  return 'incompatible';
}

/**
 * Convert a camera to a different model.
 *
 * @param camera - Source camera
 * @param targetModelId - Target camera model ID
 * @param threshold - Threshold for considering parameters negligible (default: 1e-6)
 * @returns Conversion result with new parameters or error
 */
export function convertCameraModel(
  camera: Camera,
  targetModelId: CameraModelId,
  threshold: number = DEFAULT_THRESHOLD
): ConversionResult {
  const { modelId: fromModel, params } = camera;

  // Same model - no conversion needed
  if (fromModel === targetModelId) {
    return { type: 'exact', params: [...params] };
  }

  // Check compatibility first
  const compatibility = canConvertModel(fromModel, targetModelId);
  if (compatibility === 'incompatible') {
    return {
      type: 'incompatible',
      reason: getIncompatibilityReason(fromModel, targetModelId),
    };
  }

  // Perform the conversion
  return performConversion(fromModel, targetModelId, params, threshold);
}

function getIncompatibilityReason(from: CameraModelId, to: CameraModelId): string {
  const fromName = getModelName(from);
  const toName = getModelName(to);

  if (isPerspectiveModel(from) && isFisheyeModel(to)) {
    return `Cannot convert ${fromName} (perspective) to ${toName} (fisheye): different projection models`;
  }
  if (isFisheyeModel(from) && isPerspectiveModel(to)) {
    return `Cannot convert ${fromName} (fisheye) to ${toName} (perspective): different projection models`;
  }
  if (from === CameraModelId.FULL_OPENCV) {
    return `Cannot convert from FULL_OPENCV: rational polynomial formula has no equivalent in other models`;
  }
  if (to === CameraModelId.FULL_OPENCV) {
    return `Cannot convert ${fromName} to FULL_OPENCV: only perspective pinhole/radial models can be approximately converted`;
  }

  return `No valid conversion path from ${fromName} to ${toName}`;
}

function getModelName(modelId: CameraModelId): string {
  const names: Record<CameraModelId, string> = {
    [CameraModelId.SIMPLE_PINHOLE]: 'SIMPLE_PINHOLE',
    [CameraModelId.PINHOLE]: 'PINHOLE',
    [CameraModelId.SIMPLE_RADIAL]: 'SIMPLE_RADIAL',
    [CameraModelId.RADIAL]: 'RADIAL',
    [CameraModelId.OPENCV]: 'OPENCV',
    [CameraModelId.OPENCV_FISHEYE]: 'OPENCV_FISHEYE',
    [CameraModelId.FULL_OPENCV]: 'FULL_OPENCV',
    [CameraModelId.FOV]: 'FOV',
    [CameraModelId.SIMPLE_RADIAL_FISHEYE]: 'SIMPLE_RADIAL_FISHEYE',
    [CameraModelId.RADIAL_FISHEYE]: 'RADIAL_FISHEYE',
    [CameraModelId.THIN_PRISM_FISHEYE]: 'THIN_PRISM_FISHEYE',
    [CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE]: 'RAD_TAN_THIN_PRISM_FISHEYE',
  };
  return names[modelId] ?? `Unknown(${modelId})`;
}

function performConversion(
  from: CameraModelId,
  to: CameraModelId,
  params: number[],
  threshold: number
): ConversionResult {
  // Perspective expansions
  if (from === CameraModelId.SIMPLE_PINHOLE) {
    return convertFromSimplePinhole(to, params);
  }
  if (from === CameraModelId.PINHOLE) {
    return convertFromPinhole(to, params, threshold);
  }
  if (from === CameraModelId.SIMPLE_RADIAL) {
    return convertFromSimpleRadial(to, params);
  }
  if (from === CameraModelId.RADIAL) {
    return convertFromRadial(to, params, threshold);
  }
  if (from === CameraModelId.OPENCV) {
    return convertFromOpencv(to, params, threshold);
  }
  if (from === CameraModelId.FOV) {
    return convertFromFov(to, params);
  }

  // Fisheye expansions
  if (from === CameraModelId.SIMPLE_RADIAL_FISHEYE) {
    return convertFromSimpleRadialFisheye(to, params);
  }
  if (from === CameraModelId.RADIAL_FISHEYE) {
    return convertFromRadialFisheye(to, params, threshold);
  }
  if (from === CameraModelId.OPENCV_FISHEYE) {
    return convertFromOpencvFisheye(to, params, threshold);
  }
  if (from === CameraModelId.THIN_PRISM_FISHEYE) {
    return convertFromThinPrismFisheye(to, params, threshold);
  }

  return {
    type: 'incompatible',
    reason: `Conversion from ${getModelName(from)} to ${getModelName(to)} not implemented`,
  };
}

// ============================================================================
// Perspective Model Conversions
// ============================================================================

function convertFromSimplePinhole(
  to: CameraModelId,
  params: number[]
): ConversionResult {
  const [f, cx, cy] = params;

  switch (to) {
    case CameraModelId.PINHOLE:
      return { type: 'exact', params: [f, f, cx, cy] };

    case CameraModelId.SIMPLE_RADIAL:
      return { type: 'exact', params: [f, cx, cy, 0] };

    case CameraModelId.RADIAL:
      return { type: 'exact', params: [f, cx, cy, 0, 0] };

    case CameraModelId.OPENCV:
      return { type: 'exact', params: [f, f, cx, cy, 0, 0, 0, 0] };

    case CameraModelId.FULL_OPENCV:
      return {
        type: 'approximate',
        params: [f, f, cx, cy, 0, 0, 0, 0, 0, 0, 0, 0],
        maxError: 0,
        warning: 'FULL_OPENCV uses rational polynomial formula; behavior differs from simpler models',
      };

    default:
      return { type: 'incompatible', reason: `Cannot convert SIMPLE_PINHOLE to ${getModelName(to)}` };
  }
}

function convertFromPinhole(
  to: CameraModelId,
  params: number[],
  _threshold: number
): ConversionResult {
  const [fx, fy, cx, cy] = params;

  switch (to) {
    case CameraModelId.SIMPLE_PINHOLE: {
      const aspectDiff = Math.abs(fx - fy) / fx;
      if (aspectDiff > ASPECT_RATIO_THRESHOLD) {
        // Use mean focal length to minimize max error in both directions
        const fMean = (fx + fy) / 2;
        return {
          type: 'approximate',
          params: [fMean, cx, cy],
          maxError: (Math.abs(fx - fMean) / fMean) * Math.max(cx, cy),
          warning: `Using mean f=${fMean.toFixed(2)} (fx=${fx.toFixed(2)}, fy=${fy.toFixed(2)}, diff ${(aspectDiff * 100).toFixed(2)}%)`,
        };
      }
      return { type: 'exact', params: [fx, cx, cy] };
    }

    case CameraModelId.SIMPLE_RADIAL: {
      const aspectDiff = Math.abs(fx - fy) / fx;
      if (aspectDiff > ASPECT_RATIO_THRESHOLD) {
        // Use mean focal length to minimize max error in both directions
        const fMean = (fx + fy) / 2;
        return {
          type: 'approximate',
          params: [fMean, cx, cy, 0],
          maxError: (Math.abs(fx - fMean) / fMean) * Math.max(cx, cy),
          warning: `Using mean f=${fMean.toFixed(2)} (fx=${fx.toFixed(2)}, fy=${fy.toFixed(2)}, diff ${(aspectDiff * 100).toFixed(2)}%)`,
        };
      }
      return { type: 'exact', params: [fx, cx, cy, 0] };
    }

    case CameraModelId.RADIAL: {
      const aspectDiff = Math.abs(fx - fy) / fx;
      if (aspectDiff > ASPECT_RATIO_THRESHOLD) {
        // Use mean focal length to minimize max error in both directions
        const fMean = (fx + fy) / 2;
        return {
          type: 'approximate',
          params: [fMean, cx, cy, 0, 0],
          maxError: (Math.abs(fx - fMean) / fMean) * Math.max(cx, cy),
          warning: `Using mean f=${fMean.toFixed(2)} (fx=${fx.toFixed(2)}, fy=${fy.toFixed(2)}, diff ${(aspectDiff * 100).toFixed(2)}%)`,
        };
      }
      return { type: 'exact', params: [fx, cx, cy, 0, 0] };
    }

    case CameraModelId.OPENCV:
      return { type: 'exact', params: [fx, fy, cx, cy, 0, 0, 0, 0] };

    case CameraModelId.FULL_OPENCV:
      return {
        type: 'approximate',
        params: [fx, fy, cx, cy, 0, 0, 0, 0, 0, 0, 0, 0],
        maxError: 0,
        warning: 'FULL_OPENCV uses rational polynomial formula; behavior differs from simpler models',
      };

    default:
      return { type: 'incompatible', reason: `Cannot convert PINHOLE to ${getModelName(to)}` };
  }
}

function convertFromSimpleRadial(
  to: CameraModelId,
  params: number[]
): ConversionResult {
  const [f, cx, cy, k] = params;

  switch (to) {
    case CameraModelId.RADIAL:
      return { type: 'exact', params: [f, cx, cy, k, 0] };

    case CameraModelId.OPENCV:
      return { type: 'exact', params: [f, f, cx, cy, k, 0, 0, 0] };

    case CameraModelId.FULL_OPENCV:
      return {
        type: 'approximate',
        params: [f, f, cx, cy, k, 0, 0, 0, 0, 0, 0, 0],
        maxError: 0,
        warning: 'FULL_OPENCV uses rational polynomial formula; behavior differs from OPENCV',
      };

    case CameraModelId.FOV: {
      // Taylor approximation: omega ≈ sqrt(3 * k1) when k1 > 0
      if (k <= 0) {
        return {
          type: 'incompatible',
          reason: 'FOV model requires positive distortion (k > 0)',
        };
      }
      const omega = Math.sqrt(3 * k);
      return {
        type: 'approximate',
        params: [f, f, cx, cy, omega],
        maxError: omega > 0.1 ? 0.1 : 0.01, // Rough estimate
        warning: `Taylor approximation; omega=${omega.toFixed(4)} radians`,
      };
    }

    default:
      return { type: 'incompatible', reason: `Cannot convert SIMPLE_RADIAL to ${getModelName(to)}` };
  }
}

function convertFromRadial(
  to: CameraModelId,
  params: number[],
  threshold: number
): ConversionResult {
  const [f, cx, cy, k1, k2] = params;

  switch (to) {
    case CameraModelId.SIMPLE_RADIAL: {
      if (Math.abs(k2) > threshold) {
        return {
          type: 'approximate',
          params: [f, cx, cy, k1],
          maxError: Math.abs(k2),
          warning: `Dropping k2=${k2.toExponential(3)} exceeds threshold`,
        };
      }
      return { type: 'exact', params: [f, cx, cy, k1] };
    }

    case CameraModelId.OPENCV:
      return { type: 'exact', params: [f, f, cx, cy, k1, k2, 0, 0] };

    case CameraModelId.FULL_OPENCV:
      return {
        type: 'approximate',
        params: [f, f, cx, cy, k1, k2, 0, 0, 0, 0, 0, 0],
        maxError: 0,
        warning: 'FULL_OPENCV uses rational polynomial formula; behavior differs from OPENCV',
      };

    case CameraModelId.FOV: {
      if (Math.abs(k2) > threshold) {
        return {
          type: 'incompatible',
          reason: 'FOV model cannot represent k2 distortion',
        };
      }
      if (k1 <= 0) {
        return {
          type: 'incompatible',
          reason: 'FOV model requires positive distortion (k1 > 0)',
        };
      }
      const omega = Math.sqrt(3 * k1);
      return {
        type: 'approximate',
        params: [f, f, cx, cy, omega],
        maxError: omega > 0.1 ? 0.1 : 0.01,
        warning: `Taylor approximation; omega=${omega.toFixed(4)} radians`,
      };
    }

    default:
      return { type: 'incompatible', reason: `Cannot convert RADIAL to ${getModelName(to)}` };
  }
}

function convertFromOpencv(
  to: CameraModelId,
  params: number[],
  threshold: number
): ConversionResult {
  const [fx, fy, cx, cy, k1, k2, p1, p2] = params;

  switch (to) {
    case CameraModelId.RADIAL: {
      const warnings: string[] = [];
      let maxError = 0;

      if (Math.abs(p1) > threshold || Math.abs(p2) > threshold) {
        const tangentialError = Math.max(Math.abs(p1), Math.abs(p2));
        warnings.push(`Dropping tangential: p1=${p1.toExponential(3)}, p2=${p2.toExponential(3)}`);
        maxError = Math.max(maxError, tangentialError);
      }

      const aspectDiff = Math.abs(fx - fy) / fx;
      // Use mean focal length when aspect ratio differs
      const fOut = aspectDiff > ASPECT_RATIO_THRESHOLD ? (fx + fy) / 2 : fx;
      if (aspectDiff > ASPECT_RATIO_THRESHOLD) {
        warnings.push(`Using mean f=${fOut.toFixed(2)} (fx=${fx.toFixed(2)}, fy=${fy.toFixed(2)})`);
        maxError = Math.max(maxError, (Math.abs(fx - fOut) / fOut) * Math.max(cx, cy));
      }

      if (warnings.length > 0) {
        return {
          type: 'approximate',
          params: [fOut, cx, cy, k1, k2],
          maxError,
          warning: warnings.join('; '),
        };
      }
      return { type: 'exact', params: [fx, cx, cy, k1, k2] };
    }

    case CameraModelId.SIMPLE_RADIAL: {
      const warnings: string[] = [];
      let maxError = 0;

      if (Math.abs(k2) > threshold) {
        warnings.push(`Dropping k2=${k2.toExponential(3)}`);
        maxError = Math.max(maxError, Math.abs(k2));
      }

      if (Math.abs(p1) > threshold || Math.abs(p2) > threshold) {
        warnings.push(`Dropping tangential: p1=${p1.toExponential(3)}, p2=${p2.toExponential(3)}`);
        maxError = Math.max(maxError, Math.max(Math.abs(p1), Math.abs(p2)));
      }

      const aspectDiff = Math.abs(fx - fy) / fx;
      // Use mean focal length when aspect ratio differs
      const fOut = aspectDiff > ASPECT_RATIO_THRESHOLD ? (fx + fy) / 2 : fx;
      if (aspectDiff > ASPECT_RATIO_THRESHOLD) {
        warnings.push(`Using mean f=${fOut.toFixed(2)} (fx=${fx.toFixed(2)}, fy=${fy.toFixed(2)})`);
        maxError = Math.max(maxError, (Math.abs(fx - fOut) / fOut) * Math.max(cx, cy));
      }

      if (warnings.length > 0) {
        return {
          type: 'approximate',
          params: [fOut, cx, cy, k1],
          maxError,
          warning: warnings.join('; '),
        };
      }
      return { type: 'exact', params: [fx, cx, cy, k1] };
    }

    case CameraModelId.FULL_OPENCV:
      return {
        type: 'approximate',
        params: [fx, fy, cx, cy, k1, k2, p1, p2, 0, 0, 0, 0],
        maxError: 0,
        warning: 'FULL_OPENCV uses rational polynomial formula; not mathematically equivalent to OPENCV',
      };

    default:
      return { type: 'incompatible', reason: `Cannot convert OPENCV to ${getModelName(to)}` };
  }
}

function convertFromFov(
  to: CameraModelId,
  params: number[]
): ConversionResult {
  const [fx, _fy, cx, cy, omega] = params;

  switch (to) {
    case CameraModelId.SIMPLE_RADIAL: {
      // Taylor approximation: k1 ≈ omega² / 3
      const k1 = (omega * omega) / 3;
      const quality = omega < 0.1 ? 'good' : omega < 0.5 ? 'rough' : 'poor';
      return {
        type: 'approximate',
        params: [fx, cx, cy, k1],
        maxError: quality === 'good' ? 0.01 : quality === 'rough' ? 0.1 : 0.5,
        warning: `Taylor approximation (${quality}); omega=${omega.toFixed(4)} radians (${(omega * 180 / Math.PI).toFixed(1)}°)`,
      };
    }

    case CameraModelId.RADIAL: {
      const k1 = (omega * omega) / 3;
      const quality = omega < 0.1 ? 'good' : omega < 0.5 ? 'rough' : 'poor';
      return {
        type: 'approximate',
        params: [fx, cx, cy, k1, 0],
        maxError: quality === 'good' ? 0.01 : quality === 'rough' ? 0.1 : 0.5,
        warning: `Taylor approximation (${quality}); omega=${omega.toFixed(4)} radians (${(omega * 180 / Math.PI).toFixed(1)}°)`,
      };
    }

    default:
      return { type: 'incompatible', reason: `Cannot convert FOV to ${getModelName(to)}` };
  }
}

// ============================================================================
// Fisheye Model Conversions
// ============================================================================

function convertFromSimpleRadialFisheye(
  to: CameraModelId,
  params: number[]
): ConversionResult {
  const [f, cx, cy, k] = params;

  switch (to) {
    case CameraModelId.RADIAL_FISHEYE:
      return { type: 'exact', params: [f, cx, cy, k, 0] };

    case CameraModelId.OPENCV_FISHEYE:
      return { type: 'exact', params: [f, f, cx, cy, k, 0, 0, 0] };

    case CameraModelId.THIN_PRISM_FISHEYE:
      // k1, k2 at indices 4-5, p1, p2 at 6-7, k3, k4 at 8-9, sx1, sy1 at 10-11
      return { type: 'exact', params: [f, f, cx, cy, k, 0, 0, 0, 0, 0, 0, 0] };

    default:
      return { type: 'incompatible', reason: `Cannot convert SIMPLE_RADIAL_FISHEYE to ${getModelName(to)}` };
  }
}

function convertFromRadialFisheye(
  to: CameraModelId,
  params: number[],
  threshold: number
): ConversionResult {
  const [f, cx, cy, k1, k2] = params;

  switch (to) {
    case CameraModelId.SIMPLE_RADIAL_FISHEYE: {
      if (Math.abs(k2) > threshold) {
        return {
          type: 'approximate',
          params: [f, cx, cy, k1],
          maxError: Math.abs(k2),
          warning: `Dropping k2=${k2.toExponential(3)} exceeds threshold`,
        };
      }
      return { type: 'exact', params: [f, cx, cy, k1] };
    }

    case CameraModelId.OPENCV_FISHEYE:
      return { type: 'exact', params: [f, f, cx, cy, k1, k2, 0, 0] };

    case CameraModelId.THIN_PRISM_FISHEYE:
      return { type: 'exact', params: [f, f, cx, cy, k1, k2, 0, 0, 0, 0, 0, 0] };

    default:
      return { type: 'incompatible', reason: `Cannot convert RADIAL_FISHEYE to ${getModelName(to)}` };
  }
}

function convertFromOpencvFisheye(
  to: CameraModelId,
  params: number[],
  threshold: number
): ConversionResult {
  // OPENCV_FISHEYE: [fx, fy, cx, cy, k1, k2, k3, k4]
  const [fx, fy, cx, cy, k1, k2, k3, k4] = params;

  switch (to) {
    case CameraModelId.RADIAL_FISHEYE: {
      const warnings: string[] = [];
      let maxError = 0;

      if (Math.abs(k3) > threshold || Math.abs(k4) > threshold) {
        warnings.push(`Dropping k3=${k3.toExponential(3)}, k4=${k4.toExponential(3)}`);
        maxError = Math.max(maxError, Math.abs(k3), Math.abs(k4));
      }

      const aspectDiff = Math.abs(fx - fy) / fx;
      // Use mean focal length when aspect ratio differs
      const fOut = aspectDiff > ASPECT_RATIO_THRESHOLD ? (fx + fy) / 2 : fx;
      if (aspectDiff > ASPECT_RATIO_THRESHOLD) {
        warnings.push(`Using mean f=${fOut.toFixed(2)} (fx=${fx.toFixed(2)}, fy=${fy.toFixed(2)})`);
        maxError = Math.max(maxError, (Math.abs(fx - fOut) / fOut) * Math.max(cx, cy));
      }

      if (warnings.length > 0) {
        return {
          type: 'approximate',
          params: [fOut, cx, cy, k1, k2],
          maxError,
          warning: warnings.join('; '),
        };
      }
      return { type: 'exact', params: [fx, cx, cy, k1, k2] };
    }

    case CameraModelId.SIMPLE_RADIAL_FISHEYE: {
      const warnings: string[] = [];
      let maxError = 0;

      if (Math.abs(k2) > threshold) {
        warnings.push(`Dropping k2=${k2.toExponential(3)}`);
        maxError = Math.max(maxError, Math.abs(k2));
      }
      if (Math.abs(k3) > threshold || Math.abs(k4) > threshold) {
        warnings.push(`Dropping k3=${k3.toExponential(3)}, k4=${k4.toExponential(3)}`);
        maxError = Math.max(maxError, Math.abs(k3), Math.abs(k4));
      }

      const aspectDiff = Math.abs(fx - fy) / fx;
      // Use mean focal length when aspect ratio differs
      const fOut = aspectDiff > ASPECT_RATIO_THRESHOLD ? (fx + fy) / 2 : fx;
      if (aspectDiff > ASPECT_RATIO_THRESHOLD) {
        warnings.push(`Using mean f=${fOut.toFixed(2)} (fx=${fx.toFixed(2)}, fy=${fy.toFixed(2)})`);
        maxError = Math.max(maxError, (Math.abs(fx - fOut) / fOut) * Math.max(cx, cy));
      }

      if (warnings.length > 0) {
        return {
          type: 'approximate',
          params: [fOut, cx, cy, k1],
          maxError,
          warning: warnings.join('; '),
        };
      }
      return { type: 'exact', params: [fx, cx, cy, k1] };
    }

    case CameraModelId.THIN_PRISM_FISHEYE:
      // IMPORTANT: Index remapping!
      // OPENCV_FISHEYE: k1,k2 at 4-5, k3,k4 at 6-7
      // THIN_PRISM_FISHEYE: k1,k2 at 4-5, p1,p2 at 6-7, k3,k4 at 8-9, sx1,sy1 at 10-11
      return {
        type: 'exact',
        params: [fx, fy, cx, cy, k1, k2, 0, 0, k3, k4, 0, 0],
      };

    default:
      return { type: 'incompatible', reason: `Cannot convert OPENCV_FISHEYE to ${getModelName(to)}` };
  }
}

function convertFromThinPrismFisheye(
  to: CameraModelId,
  params: number[],
  threshold: number
): ConversionResult {
  // THIN_PRISM_FISHEYE: [fx, fy, cx, cy, k1, k2, p1, p2, k3, k4, sx1, sy1]
  const [fx, fy, cx, cy, k1, k2, p1, p2, k3, k4, sx1, sy1] = params;

  switch (to) {
    case CameraModelId.OPENCV_FISHEYE: {
      const warnings: string[] = [];
      let maxError = 0;

      if (Math.abs(p1) > threshold || Math.abs(p2) > threshold) {
        warnings.push(`Dropping tangential: p1=${p1.toExponential(3)}, p2=${p2.toExponential(3)}`);
        maxError = Math.max(maxError, Math.abs(p1), Math.abs(p2));
      }
      if (Math.abs(sx1) > threshold || Math.abs(sy1) > threshold) {
        warnings.push(`Dropping thin prism: sx1=${sx1.toExponential(3)}, sy1=${sy1.toExponential(3)}`);
        maxError = Math.max(maxError, Math.abs(sx1), Math.abs(sy1));
      }

      // IMPORTANT: Index remapping - k3,k4 move from indices 8-9 to 6-7
      if (warnings.length > 0) {
        return {
          type: 'approximate',
          params: [fx, fy, cx, cy, k1, k2, k3, k4],
          maxError,
          warning: warnings.join('; '),
        };
      }
      return { type: 'exact', params: [fx, fy, cx, cy, k1, k2, k3, k4] };
    }

    case CameraModelId.RADIAL_FISHEYE: {
      const warnings: string[] = [];
      let maxError = 0;

      if (Math.abs(k3) > threshold || Math.abs(k4) > threshold) {
        warnings.push(`Dropping k3=${k3.toExponential(3)}, k4=${k4.toExponential(3)}`);
        maxError = Math.max(maxError, Math.abs(k3), Math.abs(k4));
      }
      if (Math.abs(p1) > threshold || Math.abs(p2) > threshold) {
        warnings.push(`Dropping tangential: p1=${p1.toExponential(3)}, p2=${p2.toExponential(3)}`);
        maxError = Math.max(maxError, Math.abs(p1), Math.abs(p2));
      }
      if (Math.abs(sx1) > threshold || Math.abs(sy1) > threshold) {
        warnings.push(`Dropping thin prism: sx1=${sx1.toExponential(3)}, sy1=${sy1.toExponential(3)}`);
        maxError = Math.max(maxError, Math.abs(sx1), Math.abs(sy1));
      }

      const aspectDiff = Math.abs(fx - fy) / fx;
      // Use mean focal length when aspect ratio differs
      const fOut = aspectDiff > ASPECT_RATIO_THRESHOLD ? (fx + fy) / 2 : fx;
      if (aspectDiff > ASPECT_RATIO_THRESHOLD) {
        warnings.push(`Using mean f=${fOut.toFixed(2)} (fx=${fx.toFixed(2)}, fy=${fy.toFixed(2)})`);
        maxError = Math.max(maxError, (Math.abs(fx - fOut) / fOut) * Math.max(cx, cy));
      }

      if (warnings.length > 0) {
        return {
          type: 'approximate',
          params: [fOut, cx, cy, k1, k2],
          maxError,
          warning: warnings.join('; '),
        };
      }
      return { type: 'exact', params: [fx, cx, cy, k1, k2] };
    }

    case CameraModelId.SIMPLE_RADIAL_FISHEYE: {
      const warnings: string[] = [];
      let maxError = 0;

      if (Math.abs(k2) > threshold) {
        warnings.push(`Dropping k2=${k2.toExponential(3)}`);
        maxError = Math.max(maxError, Math.abs(k2));
      }
      if (Math.abs(k3) > threshold || Math.abs(k4) > threshold) {
        warnings.push(`Dropping k3=${k3.toExponential(3)}, k4=${k4.toExponential(3)}`);
        maxError = Math.max(maxError, Math.abs(k3), Math.abs(k4));
      }
      if (Math.abs(p1) > threshold || Math.abs(p2) > threshold) {
        warnings.push(`Dropping tangential: p1=${p1.toExponential(3)}, p2=${p2.toExponential(3)}`);
        maxError = Math.max(maxError, Math.abs(p1), Math.abs(p2));
      }
      if (Math.abs(sx1) > threshold || Math.abs(sy1) > threshold) {
        warnings.push(`Dropping thin prism: sx1=${sx1.toExponential(3)}, sy1=${sy1.toExponential(3)}`);
        maxError = Math.max(maxError, Math.abs(sx1), Math.abs(sy1));
      }

      const aspectDiff = Math.abs(fx - fy) / fx;
      // Use mean focal length when aspect ratio differs
      const fOut = aspectDiff > ASPECT_RATIO_THRESHOLD ? (fx + fy) / 2 : fx;
      if (aspectDiff > ASPECT_RATIO_THRESHOLD) {
        warnings.push(`Using mean f=${fOut.toFixed(2)} (fx=${fx.toFixed(2)}, fy=${fy.toFixed(2)})`);
        maxError = Math.max(maxError, (Math.abs(fx - fOut) / fOut) * Math.max(cx, cy));
      }

      if (warnings.length > 0) {
        return {
          type: 'approximate',
          params: [fOut, cx, cy, k1],
          maxError,
          warning: warnings.join('; '),
        };
      }
      return { type: 'exact', params: [fx, cx, cy, k1] };
    }

    default:
      return { type: 'incompatible', reason: `Cannot convert THIN_PRISM_FISHEYE to ${getModelName(to)}` };
  }
}

/**
 * Validate conversion accuracy by computing reprojection error.
 *
 * Projects a grid of points through both camera models and measures the
 * maximum pixel difference. This helps verify approximate conversions.
 *
 * @param srcCamera - Source camera
 * @param dstCamera - Destination camera (after conversion)
 * @param sampleCount - Number of sample points per dimension (default: 10)
 * @returns Validation result with max and average errors
 */
export function validateConversion(
  srcCamera: Camera,
  dstCamera: Camera,
  sampleCount: number = 10
): ValidationResult {
  // Generate sample points across the image
  const { width, height } = srcCamera;
  const errors: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    for (let j = 0; j < sampleCount; j++) {
      // Sample points in image coordinates
      const x = (width * (i + 0.5)) / sampleCount;
      const y = (height * (j + 0.5)) / sampleCount;

      // Project through source model to normalized coordinates
      const srcNorm = unprojectPoint(srcCamera, x, y);
      if (!srcNorm) continue;

      // Unproject through destination model back to image coordinates
      const dstPoint = projectPoint(dstCamera, srcNorm.x, srcNorm.y);
      if (!dstPoint) continue;

      // Compute pixel error
      const dx = dstPoint.x - x;
      const dy = dstPoint.y - y;
      const error = Math.sqrt(dx * dx + dy * dy);
      errors.push(error);
    }
  }

  if (errors.length === 0) {
    return { maxError: Infinity, avgError: Infinity, sampleCount: 0 };
  }

  const maxError = Math.max(...errors);
  const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;

  return { maxError, avgError, sampleCount: errors.length };
}

// ============================================================================
// Distortion Functions for Validation
// ============================================================================

/**
 * Apply radial distortion to normalized coordinates.
 * Used by SIMPLE_RADIAL, RADIAL, OPENCV models.
 *
 * @param x - Normalized x coordinate
 * @param y - Normalized y coordinate
 * @param k1 - First radial distortion coefficient
 * @param k2 - Second radial distortion coefficient (default: 0)
 * @param p1 - First tangential distortion coefficient (default: 0)
 * @param p2 - Second tangential distortion coefficient (default: 0)
 * @returns Distorted normalized coordinates
 */
function applyRadialDistortion(
  x: number,
  y: number,
  k1: number,
  k2: number = 0,
  p1: number = 0,
  p2: number = 0
): { x: number; y: number } {
  const r2 = x * x + y * y;
  const r4 = r2 * r2;

  // Radial distortion
  const radialFactor = 1 + k1 * r2 + k2 * r4;

  // Tangential distortion
  const dx = 2 * p1 * x * y + p2 * (r2 + 2 * x * x);
  const dy = p1 * (r2 + 2 * y * y) + 2 * p2 * x * y;

  return {
    x: x * radialFactor + dx,
    y: y * radialFactor + dy,
  };
}

/**
 * Remove radial distortion from distorted coordinates using iterative Newton-Raphson.
 * This is the inverse of applyRadialDistortion.
 *
 * @param xd - Distorted normalized x coordinate
 * @param yd - Distorted normalized y coordinate
 * @param k1 - First radial distortion coefficient
 * @param k2 - Second radial distortion coefficient (default: 0)
 * @param p1 - First tangential distortion coefficient (default: 0)
 * @param p2 - Second tangential distortion coefficient (default: 0)
 * @param maxIter - Maximum iterations (default: 20)
 * @returns Undistorted normalized coordinates
 */
function removeRadialDistortion(
  xd: number,
  yd: number,
  k1: number,
  k2: number = 0,
  p1: number = 0,
  p2: number = 0,
  maxIter: number = 20
): { x: number; y: number } {
  // Start with distorted point as initial guess
  let x = xd;
  let y = yd;

  for (let iter = 0; iter < maxIter; iter++) {
    const r2 = x * x + y * y;
    const r4 = r2 * r2;

    // Current distortion
    const radialFactor = 1 + k1 * r2 + k2 * r4;
    const dx = 2 * p1 * x * y + p2 * (r2 + 2 * x * x);
    const dy = p1 * (r2 + 2 * y * y) + 2 * p2 * x * y;

    // Residual
    const fx = x * radialFactor + dx - xd;
    const fy = y * radialFactor + dy - yd;

    // Check convergence
    if (Math.abs(fx) < 1e-10 && Math.abs(fy) < 1e-10) {
      break;
    }

    // Jacobian approximation (simplified - using only radial component)
    const dr2_dx = 2 * x;
    const dr2_dy = 2 * y;
    const drad_dx = k1 * dr2_dx + 2 * k2 * r2 * dr2_dx;
    const drad_dy = k1 * dr2_dy + 2 * k2 * r2 * dr2_dy;

    const j00 = radialFactor + x * drad_dx + 2 * p1 * y + 6 * p2 * x;
    const j01 = x * drad_dy + 2 * p1 * x + 2 * p2 * y;
    const j10 = y * drad_dx + 2 * p1 * x + 2 * p2 * y;
    const j11 = radialFactor + y * drad_dy + 6 * p1 * y + 2 * p2 * x;

    // Solve 2x2 system
    const det = j00 * j11 - j01 * j10;
    if (Math.abs(det) < 1e-15) {
      break;
    }

    x -= (j11 * fx - j01 * fy) / det;
    y -= (-j10 * fx + j00 * fy) / det;
  }

  return { x, y };
}

/**
 * Apply fisheye distortion to normalized coordinates.
 * Uses equidistant projection model used by COLMAP fisheye cameras.
 *
 * @param x - Normalized x coordinate
 * @param y - Normalized y coordinate
 * @param k1 - First distortion coefficient
 * @param k2 - Second distortion coefficient (default: 0)
 * @param k3 - Third distortion coefficient (default: 0)
 * @param k4 - Fourth distortion coefficient (default: 0)
 * @returns Distorted normalized coordinates
 */
function applyFisheyeDistortion(
  x: number,
  y: number,
  k1: number,
  k2: number = 0,
  k3: number = 0,
  k4: number = 0
): { x: number; y: number } {
  const r = Math.sqrt(x * x + y * y);
  if (r < 1e-10) return { x, y };

  const theta = Math.atan(r);
  const theta2 = theta * theta;
  const theta4 = theta2 * theta2;
  const theta6 = theta4 * theta2;
  const theta8 = theta4 * theta4;

  const thetaD = theta * (1 + k1 * theta2 + k2 * theta4 + k3 * theta6 + k4 * theta8);
  const scale = thetaD / r;

  return { x: x * scale, y: y * scale };
}

/**
 * Remove fisheye distortion from distorted coordinates using iterative method.
 *
 * @param xd - Distorted normalized x coordinate
 * @param yd - Distorted normalized y coordinate
 * @param k1 - First distortion coefficient
 * @param k2 - Second distortion coefficient (default: 0)
 * @param k3 - Third distortion coefficient (default: 0)
 * @param k4 - Fourth distortion coefficient (default: 0)
 * @param maxIter - Maximum iterations (default: 20)
 * @returns Undistorted normalized coordinates
 */
function removeFisheyeDistortion(
  xd: number,
  yd: number,
  k1: number,
  k2: number = 0,
  k3: number = 0,
  k4: number = 0,
  maxIter: number = 20
): { x: number; y: number } {
  const rd = Math.sqrt(xd * xd + yd * yd);
  if (rd < 1e-10) return { x: xd, y: yd };

  // Find theta from thetaD using Newton-Raphson
  // thetaD = theta * (1 + k1*theta^2 + k2*theta^4 + k3*theta^6 + k4*theta^8)
  let theta = rd; // Initial guess

  for (let iter = 0; iter < maxIter; iter++) {
    const theta2 = theta * theta;
    const theta4 = theta2 * theta2;
    const theta6 = theta4 * theta2;
    const theta8 = theta4 * theta4;

    const f = theta * (1 + k1 * theta2 + k2 * theta4 + k3 * theta6 + k4 * theta8) - rd;

    // Derivative: df/dtheta
    const df =
      1 +
      3 * k1 * theta2 +
      5 * k2 * theta4 +
      7 * k3 * theta6 +
      9 * k4 * theta8;

    if (Math.abs(df) < 1e-15) break;

    const delta = f / df;
    theta -= delta;

    if (Math.abs(delta) < 1e-10) break;
  }

  // Now compute r from theta
  const r = Math.tan(theta);
  const scale = r / rd;

  return { x: xd * scale, y: yd * scale };
}

/**
 * Unproject a pixel to normalized camera coordinates.
 * Applies undistortion based on camera model.
 */
function unprojectPoint(
  camera: Camera,
  px: number,
  py: number
): { x: number; y: number } | null {
  const { modelId, params } = camera;

  // Extract intrinsics and normalize
  let fx: number, fy: number, cx: number, cy: number;

  switch (modelId) {
    case CameraModelId.SIMPLE_PINHOLE:
      [fx, cx, cy] = params;
      fy = fx;
      return { x: (px - cx) / fx, y: (py - cy) / fy };

    case CameraModelId.PINHOLE:
      [fx, fy, cx, cy] = params;
      return { x: (px - cx) / fx, y: (py - cy) / fy };

    case CameraModelId.SIMPLE_RADIAL: {
      const [f, cxp, cyp, k] = params;
      const xd = (px - cxp) / f;
      const yd = (py - cyp) / f;
      return removeRadialDistortion(xd, yd, k);
    }

    case CameraModelId.RADIAL: {
      const [f, cxp, cyp, k1, k2] = params;
      const xd = (px - cxp) / f;
      const yd = (py - cyp) / f;
      return removeRadialDistortion(xd, yd, k1, k2);
    }

    case CameraModelId.OPENCV: {
      const [fxp, fyp, cxp, cyp, k1, k2, p1, p2] = params;
      const xd = (px - cxp) / fxp;
      const yd = (py - cyp) / fyp;
      return removeRadialDistortion(xd, yd, k1, k2, p1, p2);
    }

    case CameraModelId.SIMPLE_RADIAL_FISHEYE: {
      const [f, cxp, cyp, k] = params;
      const xd = (px - cxp) / f;
      const yd = (py - cyp) / f;
      return removeFisheyeDistortion(xd, yd, k);
    }

    case CameraModelId.RADIAL_FISHEYE: {
      const [f, cxp, cyp, k1, k2] = params;
      const xd = (px - cxp) / f;
      const yd = (py - cyp) / f;
      return removeFisheyeDistortion(xd, yd, k1, k2);
    }

    case CameraModelId.OPENCV_FISHEYE: {
      const [fxp, fyp, cxp, cyp, k1, k2, k3, k4] = params;
      const xd = (px - cxp) / fxp;
      const yd = (py - cyp) / fyp;
      return removeFisheyeDistortion(xd, yd, k1, k2, k3, k4);
    }

    case CameraModelId.THIN_PRISM_FISHEYE: {
      // THIN_PRISM_FISHEYE: [fx, fy, cx, cy, k1, k2, p1, p2, k3, k4, sx1, sy1]
      // For validation purposes, we ignore tangential (p1,p2) and thin prism (sx1,sy1)
      const [fxp, fyp, cxp, cyp, k1, k2, _p1, _p2, k3, k4] = params;
      const xd = (px - cxp) / fxp;
      const yd = (py - cyp) / fyp;
      return removeFisheyeDistortion(xd, yd, k1, k2, k3, k4);
    }

    default:
      // For unsupported models, fall back to pinhole
      [fx, fy, cx, cy] = params;
      return { x: (px - cx) / fx, y: (py - cy) / fy };
  }
}

/**
 * Project normalized coordinates to pixel coordinates.
 * Applies distortion based on camera model.
 */
function projectPoint(
  camera: Camera,
  nx: number,
  ny: number
): { x: number; y: number } | null {
  const { modelId, params } = camera;

  switch (modelId) {
    case CameraModelId.SIMPLE_PINHOLE: {
      const [f, cx, cy] = params;
      return { x: nx * f + cx, y: ny * f + cy };
    }

    case CameraModelId.PINHOLE: {
      const [fx, fy, cx, cy] = params;
      return { x: nx * fx + cx, y: ny * fy + cy };
    }

    case CameraModelId.SIMPLE_RADIAL: {
      const [f, cx, cy, k] = params;
      const distorted = applyRadialDistortion(nx, ny, k);
      return { x: distorted.x * f + cx, y: distorted.y * f + cy };
    }

    case CameraModelId.RADIAL: {
      const [f, cx, cy, k1, k2] = params;
      const distorted = applyRadialDistortion(nx, ny, k1, k2);
      return { x: distorted.x * f + cx, y: distorted.y * f + cy };
    }

    case CameraModelId.OPENCV: {
      const [fx, fy, cx, cy, k1, k2, p1, p2] = params;
      const distorted = applyRadialDistortion(nx, ny, k1, k2, p1, p2);
      return { x: distorted.x * fx + cx, y: distorted.y * fy + cy };
    }

    case CameraModelId.SIMPLE_RADIAL_FISHEYE: {
      const [f, cx, cy, k] = params;
      const distorted = applyFisheyeDistortion(nx, ny, k);
      return { x: distorted.x * f + cx, y: distorted.y * f + cy };
    }

    case CameraModelId.RADIAL_FISHEYE: {
      const [f, cx, cy, k1, k2] = params;
      const distorted = applyFisheyeDistortion(nx, ny, k1, k2);
      return { x: distorted.x * f + cx, y: distorted.y * f + cy };
    }

    case CameraModelId.OPENCV_FISHEYE: {
      const [fx, fy, cx, cy, k1, k2, k3, k4] = params;
      const distorted = applyFisheyeDistortion(nx, ny, k1, k2, k3, k4);
      return { x: distorted.x * fx + cx, y: distorted.y * fy + cy };
    }

    case CameraModelId.THIN_PRISM_FISHEYE: {
      // THIN_PRISM_FISHEYE: [fx, fy, cx, cy, k1, k2, p1, p2, k3, k4, sx1, sy1]
      // For validation purposes, we ignore tangential (p1,p2) and thin prism (sx1,sy1)
      const [fx, fy, cx, cy, k1, k2, _p1, _p2, k3, k4] = params;
      const distorted = applyFisheyeDistortion(nx, ny, k1, k2, k3, k4);
      return { x: distorted.x * fx + cx, y: distorted.y * fy + cy };
    }

    default: {
      // For unsupported models, fall back to pinhole
      const [fx, fy, cx, cy] = params;
      return { x: nx * fx + cx, y: ny * fy + cy };
    }
  }
}

/**
 * Create a converted camera object.
 *
 * @param camera - Source camera
 * @param targetModelId - Target camera model ID
 * @param threshold - Threshold for considering parameters negligible
 * @returns New camera object or null if conversion failed
 */
export function createConvertedCamera(
  camera: Camera,
  targetModelId: CameraModelId,
  threshold: number = DEFAULT_THRESHOLD
): Camera | null {
  const result = convertCameraModel(camera, targetModelId, threshold);

  if (result.type === 'incompatible') {
    return null;
  }

  return {
    cameraId: camera.cameraId,
    modelId: targetModelId,
    width: camera.width,
    height: camera.height,
    params: result.params,
  };
}

/**
 * Get all valid target models for a given source model.
 *
 * @param sourceModel - Source camera model ID
 * @returns Array of valid target model IDs with their compatibility
 */
export function getValidTargetModels(
  sourceModel: CameraModelId
): Array<{ modelId: CameraModelId; compatibility: ConversionCompatibility }> {
  const allModels = Object.values(CameraModelId).filter(
    (v): v is CameraModelId => typeof v === 'number'
  );

  const results: Array<{ modelId: CameraModelId; compatibility: ConversionCompatibility }> = [];

  for (const targetModel of allModels) {
    if (targetModel === sourceModel) continue;

    const compatibility = canConvertModel(sourceModel, targetModel);
    if (compatibility !== 'incompatible') {
      results.push({ modelId: targetModel, compatibility });
    }
  }

  return results;
}

/**
 * Get a detailed preview of a camera model conversion.
 *
 * @param camera - Source camera
 * @param targetModelId - Target camera model ID
 * @param threshold - Threshold for considering parameters negligible
 * @returns Preview information or null if conversion is incompatible
 */
export function getConversionPreview(
  camera: Camera,
  targetModelId: CameraModelId,
  threshold: number = DEFAULT_THRESHOLD
): ConversionPreview | null {
  const result = convertCameraModel(camera, targetModelId, threshold);

  if (result.type === 'incompatible') {
    return null;
  }

  const sourceParamNames = PARAM_NAMES[camera.modelId] ?? [];
  const targetParamNames = PARAM_NAMES[targetModelId] ?? [];

  // Determine characterization
  const { characterization, isLossy, isExpansion, description } = characterizeConversion(
    camera.modelId,
    targetModelId,
    camera.params,
    result.params,
    result.type,
    threshold
  );

  return {
    sourceParamNames,
    sourceParams: [...camera.params],
    targetParamNames,
    targetParams: result.params,
    characterization,
    isLossy,
    isExpansion,
    description,
    warning: result.type === 'approximate' ? result.warning : undefined,
  };
}

/**
 * Characterize a conversion to determine its nature.
 */
function characterizeConversion(
  fromModel: CameraModelId,
  toModel: CameraModelId,
  sourceParams: number[],
  targetParams: number[],
  resultType: 'exact' | 'approximate',
  threshold: number
): {
  characterization: ConversionCharacterization;
  isLossy: boolean;
  isExpansion: boolean;
  description: string;
} {
  const sourceCount = sourceParams.length;
  const targetCount = targetParams.length;

  // FOV conversions are always approximations
  if (fromModel === CameraModelId.FOV || toModel === CameraModelId.FOV) {
    return {
      characterization: 'approximation',
      isLossy: true,
      isExpansion: false,
      description: 'Taylor series approximation between FOV and polynomial models',
    };
  }

  // FULL_OPENCV conversions are always approximations
  if (toModel === CameraModelId.FULL_OPENCV) {
    return {
      characterization: 'approximation',
      isLossy: false,
      isExpansion: true,
      description: 'Rational polynomial formula differs from simpler models',
    };
  }

  // Expansion: target has more parameters
  if (targetCount > sourceCount) {
    // Check if source values are preserved exactly
    const addedParams = targetCount - sourceCount;
    const addedZeros = targetParams.slice(-addedParams).every(p => Math.abs(p) < threshold);

    if (resultType === 'exact' || addedZeros) {
      return {
        characterization: 'expansion',
        isLossy: false,
        isExpansion: true,
        description: `Adding ${addedParams} parameter${addedParams > 1 ? 's' : ''} (set to zero)`,
      };
    }
  }

  // Reduction: target has fewer parameters
  if (targetCount < sourceCount) {
    // Determine what's being dropped
    const droppedInfo = getDroppedParamsInfo(fromModel, toModel, sourceParams, threshold);

    if (droppedInfo.hasNonZero) {
      return {
        characterization: 'lossy',
        isLossy: true,
        isExpansion: false,
        description: droppedInfo.description,
      };
    } else {
      return {
        characterization: 'exact',
        isLossy: false,
        isExpansion: false,
        description: droppedInfo.description || 'Dropped parameters were already zero',
      };
    }
  }

  // Same parameter count
  if (resultType === 'approximate') {
    // Likely aspect ratio issue or other approximation
    return {
      characterization: 'lossy',
      isLossy: true,
      isExpansion: false,
      description: 'Some parameter information is lost',
    };
  }

  return {
    characterization: 'exact',
    isLossy: false,
    isExpansion: false,
    description: 'Equivalent representation',
  };
}

/**
 * Get information about parameters being dropped in a reduction conversion.
 */
function getDroppedParamsInfo(
  fromModel: CameraModelId,
  toModel: CameraModelId,
  sourceParams: number[],
  threshold: number
): { hasNonZero: boolean; description: string } {
  const dropped: string[] = [];
  let hasNonZero = false;

  // PINHOLE -> SIMPLE_PINHOLE: loses fy (checks aspect ratio)
  if (fromModel === CameraModelId.PINHOLE && toModel === CameraModelId.SIMPLE_PINHOLE) {
    const [fx, fy] = sourceParams;
    const aspectDiff = Math.abs(fx - fy) / fx;
    if (aspectDiff > ASPECT_RATIO_THRESHOLD) {
      hasNonZero = true;
      dropped.push(`fy (aspect ratio diff: ${(aspectDiff * 100).toFixed(2)}%)`);
    } else {
      dropped.push('fy (aspect ratio preserved)');
    }
  }

  // RADIAL -> SIMPLE_RADIAL: loses k2
  if (fromModel === CameraModelId.RADIAL && toModel === CameraModelId.SIMPLE_RADIAL) {
    const k2 = sourceParams[4];
    if (Math.abs(k2) > threshold) {
      hasNonZero = true;
      dropped.push(`k2=${k2.toExponential(3)}`);
    } else {
      dropped.push('k2 (was zero)');
    }
  }

  // OPENCV -> RADIAL: loses p1, p2, and fy
  if (fromModel === CameraModelId.OPENCV && toModel === CameraModelId.RADIAL) {
    const [fx, fy, , , , , p1, p2] = sourceParams;
    const aspectDiff = Math.abs(fx - fy) / fx;

    if (Math.abs(p1) > threshold || Math.abs(p2) > threshold) {
      hasNonZero = true;
      dropped.push(`tangential (p1=${p1.toExponential(3)}, p2=${p2.toExponential(3)})`);
    }
    if (aspectDiff > ASPECT_RATIO_THRESHOLD) {
      hasNonZero = true;
      dropped.push(`fy (aspect ratio diff: ${(aspectDiff * 100).toFixed(2)}%)`);
    }
  }

  // OPENCV -> SIMPLE_RADIAL: loses k2, p1, p2, and fy
  if (fromModel === CameraModelId.OPENCV && toModel === CameraModelId.SIMPLE_RADIAL) {
    const [fx, fy, , , , k2, p1, p2] = sourceParams;
    const aspectDiff = Math.abs(fx - fy) / fx;

    if (Math.abs(k2) > threshold) {
      hasNonZero = true;
      dropped.push(`k2=${k2.toExponential(3)}`);
    }
    if (Math.abs(p1) > threshold || Math.abs(p2) > threshold) {
      hasNonZero = true;
      dropped.push(`tangential (p1=${p1.toExponential(3)}, p2=${p2.toExponential(3)})`);
    }
    if (aspectDiff > ASPECT_RATIO_THRESHOLD) {
      hasNonZero = true;
      dropped.push(`fy (aspect ratio diff: ${(aspectDiff * 100).toFixed(2)}%)`);
    }
  }

  // Fisheye reductions
  if (fromModel === CameraModelId.RADIAL_FISHEYE && toModel === CameraModelId.SIMPLE_RADIAL_FISHEYE) {
    const k2 = sourceParams[4];
    if (Math.abs(k2) > threshold) {
      hasNonZero = true;
      dropped.push(`k2=${k2.toExponential(3)}`);
    } else {
      dropped.push('k2 (was zero)');
    }
  }

  if (fromModel === CameraModelId.OPENCV_FISHEYE) {
    const [fx, fy, , , , , k3, k4] = sourceParams;
    const aspectDiff = Math.abs(fx - fy) / fx;

    if (toModel === CameraModelId.RADIAL_FISHEYE || toModel === CameraModelId.SIMPLE_RADIAL_FISHEYE) {
      if (Math.abs(k3) > threshold || Math.abs(k4) > threshold) {
        hasNonZero = true;
        dropped.push(`k3=${k3.toExponential(3)}, k4=${k4.toExponential(3)}`);
      }
      if (aspectDiff > ASPECT_RATIO_THRESHOLD) {
        hasNonZero = true;
        dropped.push(`fy (aspect ratio diff: ${(aspectDiff * 100).toFixed(2)}%)`);
      }
    }
  }

  if (fromModel === CameraModelId.THIN_PRISM_FISHEYE) {
    const [fx, fy, , , , , p1, p2, k3, k4, sx1, sy1] = sourceParams;
    const aspectDiff = Math.abs(fx - fy) / fx;

    if (toModel === CameraModelId.OPENCV_FISHEYE) {
      if (Math.abs(p1) > threshold || Math.abs(p2) > threshold) {
        hasNonZero = true;
        dropped.push(`tangential (p1=${p1.toExponential(3)}, p2=${p2.toExponential(3)})`);
      }
      if (Math.abs(sx1) > threshold || Math.abs(sy1) > threshold) {
        hasNonZero = true;
        dropped.push(`thin prism (sx1=${sx1.toExponential(3)}, sy1=${sy1.toExponential(3)})`);
      }
    } else if (toModel === CameraModelId.RADIAL_FISHEYE || toModel === CameraModelId.SIMPLE_RADIAL_FISHEYE) {
      if (Math.abs(k3) > threshold || Math.abs(k4) > threshold) {
        hasNonZero = true;
        dropped.push(`k3, k4`);
      }
      if (Math.abs(p1) > threshold || Math.abs(p2) > threshold) {
        hasNonZero = true;
        dropped.push(`tangential`);
      }
      if (Math.abs(sx1) > threshold || Math.abs(sy1) > threshold) {
        hasNonZero = true;
        dropped.push(`thin prism`);
      }
      if (aspectDiff > ASPECT_RATIO_THRESHOLD) {
        hasNonZero = true;
        dropped.push(`fy`);
      }
    }
  }

  const description = dropped.length > 0
    ? `Dropping: ${dropped.join(', ')}`
    : 'Parameter reduction';

  return { hasNonZero, description };
}
