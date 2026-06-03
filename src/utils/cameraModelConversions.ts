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
import {
  ASPECT_RATIO_THRESHOLD,
  DEFAULT_CONVERSION_THRESHOLD,
} from './cameraModelConversionTypes';
import type { ConversionResult } from './cameraModelConversionTypes';
import { convertFisheyeCameraModel } from './cameraModelFisheyeConversions';
import {
  getCameraModelCompatibility,
  getCameraModelColmapName as getModelName,
  isFisheyeCameraModel as isFisheyeModel,
  isPerspectiveCameraModel as isPerspectiveModel,
  PARAM_NAMES,
} from './cameraModelPolicy';
import type { ConversionCompatibility } from './cameraModelPolicy';
import { convertPerspectiveCameraModel } from './cameraModelPerspectiveConversions';
import { validateCameraModelProjectionConversion } from './cameraModelProjection';
import type { ValidationResult } from './cameraModelProjection';
import { characterizeCameraModelConversion } from './cameraModelPreviewPolicy';
import type { ConversionPreview } from './cameraModelPreviewPolicy';

export { PARAM_NAMES } from './cameraModelPolicy';
export type { ConversionResult } from './cameraModelConversionTypes';
export type { ConversionCompatibility } from './cameraModelPolicy';
export type { ValidationResult } from './cameraModelProjection';
export type {
  ConversionCharacterization,
  ConversionPreview,
} from './cameraModelPreviewPolicy';

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
  return getCameraModelCompatibility(fromModel, toModel);
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
  threshold: number = DEFAULT_CONVERSION_THRESHOLD
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

function performConversion(
  from: CameraModelId,
  to: CameraModelId,
  params: number[],
  threshold: number
): ConversionResult {
  const perspectiveResult = convertPerspectiveCameraModel(from, to, params, threshold);
  if (perspectiveResult) {
    return perspectiveResult;
  }

  const fisheyeResult = convertFisheyeCameraModel(from, to, params, threshold);
  if (fisheyeResult) {
    return fisheyeResult;
  }

  return {
    type: 'incompatible',
    reason: `Conversion from ${getModelName(from)} to ${getModelName(to)} not implemented`,
  };
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
  return validateCameraModelProjectionConversion(srcCamera, dstCamera, sampleCount);
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
  threshold: number = DEFAULT_CONVERSION_THRESHOLD
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
  threshold: number = DEFAULT_CONVERSION_THRESHOLD
): ConversionPreview | null {
  const result = convertCameraModel(camera, targetModelId, threshold);

  if (result.type === 'incompatible') {
    return null;
  }

  const sourceParamNames = PARAM_NAMES[camera.modelId] ?? [];
  const targetParamNames = PARAM_NAMES[targetModelId] ?? [];

  const { characterization, isLossy, isExpansion, description } = characterizeCameraModelConversion({
    fromModel: camera.modelId,
    toModel: targetModelId,
    sourceParams: camera.params,
    targetParams: result.params,
    resultType: result.type,
    threshold,
    aspectRatioThreshold: ASPECT_RATIO_THRESHOLD,
  });

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
