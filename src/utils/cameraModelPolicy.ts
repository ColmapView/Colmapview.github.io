import { CameraModelId } from '../types/colmap';
import {
  CAMERA_MODEL_DESCRIPTORS,
  getCameraModelColmapName as getRegistryCameraModelColmapName,
  isSphericalCameraModel as isSphericalCameraModelFromRegistry,
} from './cameraModelRegistry';

export type ConversionCompatibility = 'exact' | 'approximate' | 'incompatible';
export { CAMERA_MODEL_COLMAP_NAMES } from './cameraModelNames';

export const PARAM_NAMES: Record<CameraModelId, string[]> = Object.fromEntries(
  Object.values(CAMERA_MODEL_DESCRIPTORS).map((d) => [d.id, [...d.paramNames]])
) as Record<CameraModelId, string[]>;

export const PERSPECTIVE_CAMERA_MODELS: readonly CameraModelId[] =
  Object.values(CAMERA_MODEL_DESCRIPTORS).filter((d) => d.family === 'pinhole').map((d) => d.id);

export const FISHEYE_CAMERA_MODELS: readonly CameraModelId[] =
  Object.values(CAMERA_MODEL_DESCRIPTORS).filter((d) => d.family === 'fisheye').map((d) => d.id);

// Delegates to the registry (single source of truth); behavior is identical.
export function isSphericalCameraModel(modelId: CameraModelId): boolean {
  return isSphericalCameraModelFromRegistry(modelId);
}

const CAMERA_MODEL_ID_VALUES: ReadonlySet<number> = new Set(Object.values(CameraModelId));

const FULL_OPENCV_SOURCE_MODELS: readonly CameraModelId[] = [
  CameraModelId.SIMPLE_PINHOLE,
  CameraModelId.PINHOLE,
  CameraModelId.SIMPLE_RADIAL,
  CameraModelId.RADIAL,
  CameraModelId.OPENCV,
];

const PERSPECTIVE_EXACT_CONVERSIONS: ReadonlyArray<readonly [CameraModelId, CameraModelId]> = [
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

const PERSPECTIVE_APPROXIMATE_CONVERSIONS: ReadonlyArray<readonly [CameraModelId, CameraModelId]> = [
  [CameraModelId.PINHOLE, CameraModelId.SIMPLE_PINHOLE],
  [CameraModelId.RADIAL, CameraModelId.SIMPLE_RADIAL],
  [CameraModelId.OPENCV, CameraModelId.RADIAL],
  [CameraModelId.OPENCV, CameraModelId.SIMPLE_RADIAL],
];

const FISHEYE_EXACT_CONVERSIONS: ReadonlyArray<readonly [CameraModelId, CameraModelId]> = [
  [CameraModelId.SIMPLE_RADIAL_FISHEYE, CameraModelId.RADIAL_FISHEYE],
  [CameraModelId.SIMPLE_RADIAL_FISHEYE, CameraModelId.OPENCV_FISHEYE],
  [CameraModelId.SIMPLE_RADIAL_FISHEYE, CameraModelId.THIN_PRISM_FISHEYE],
  [CameraModelId.RADIAL_FISHEYE, CameraModelId.OPENCV_FISHEYE],
  [CameraModelId.RADIAL_FISHEYE, CameraModelId.THIN_PRISM_FISHEYE],
  [CameraModelId.OPENCV_FISHEYE, CameraModelId.THIN_PRISM_FISHEYE],
];

const FISHEYE_APPROXIMATE_CONVERSIONS: ReadonlyArray<readonly [CameraModelId, CameraModelId]> = [
  [CameraModelId.RADIAL_FISHEYE, CameraModelId.SIMPLE_RADIAL_FISHEYE],
  [CameraModelId.OPENCV_FISHEYE, CameraModelId.RADIAL_FISHEYE],
  [CameraModelId.OPENCV_FISHEYE, CameraModelId.SIMPLE_RADIAL_FISHEYE],
  [CameraModelId.THIN_PRISM_FISHEYE, CameraModelId.OPENCV_FISHEYE],
  [CameraModelId.THIN_PRISM_FISHEYE, CameraModelId.RADIAL_FISHEYE],
  [CameraModelId.THIN_PRISM_FISHEYE, CameraModelId.SIMPLE_RADIAL_FISHEYE],
];

function hasConversionPair(
  pairs: ReadonlyArray<readonly [CameraModelId, CameraModelId]>,
  fromModel: CameraModelId,
  toModel: CameraModelId
): boolean {
  return pairs.some(([from, to]) => fromModel === from && toModel === to);
}

export function getCameraModelColmapName(modelId: CameraModelId): string {
  // Delegates to the registry (single source of truth), but preserves this
  // module's historical non-throwing fallback for out-of-registry ids — the
  // registry's getCameraModelColmapName throws on an unknown id.
  return isCameraModelId(modelId)
    ? getRegistryCameraModelColmapName(modelId)
    : `Unknown(${modelId})`;
}

export function isCameraModelId(value: unknown): value is CameraModelId {
  return typeof value === 'number'
    && Number.isInteger(value)
    && CAMERA_MODEL_ID_VALUES.has(value);
}

export function parseCameraModelId(value: number, context = 'camera'): CameraModelId {
  if (isCameraModelId(value)) {
    return value;
  }

  throw new Error(`Unsupported camera model id ${value} in ${context}`);
}

export function isPerspectiveCameraModel(modelId: CameraModelId): boolean {
  return PERSPECTIVE_CAMERA_MODELS.includes(modelId);
}

export function isFisheyeCameraModel(modelId: CameraModelId): boolean {
  return FISHEYE_CAMERA_MODELS.includes(modelId);
}

export function getCameraModelCompatibility(
  fromModel: CameraModelId,
  toModel: CameraModelId
): ConversionCompatibility {
  if (fromModel === toModel) {
    return 'exact';
  }

  if (isPerspectiveCameraModel(fromModel) && isFisheyeCameraModel(toModel)) {
    return 'incompatible';
  }
  if (isFisheyeCameraModel(fromModel) && isPerspectiveCameraModel(toModel)) {
    return 'incompatible';
  }

  if (fromModel === CameraModelId.FULL_OPENCV) {
    return 'incompatible';
  }
  if (toModel === CameraModelId.FULL_OPENCV) {
    return FULL_OPENCV_SOURCE_MODELS.includes(fromModel) ? 'approximate' : 'incompatible';
  }

  if (isPerspectiveCameraModel(fromModel) && isPerspectiveCameraModel(toModel)) {
    return getPerspectiveCompatibility(fromModel, toModel);
  }

  if (isFisheyeCameraModel(fromModel) && isFisheyeCameraModel(toModel)) {
    return getFisheyeCompatibility(fromModel, toModel);
  }

  return 'incompatible';
}

function getPerspectiveCompatibility(
  fromModel: CameraModelId,
  toModel: CameraModelId
): ConversionCompatibility {
  if (fromModel === CameraModelId.FOV || toModel === CameraModelId.FOV) {
    return (
      toModel === CameraModelId.SIMPLE_RADIAL ||
      toModel === CameraModelId.RADIAL ||
      fromModel === CameraModelId.SIMPLE_RADIAL ||
      fromModel === CameraModelId.RADIAL
    ) ? 'approximate' : 'incompatible';
  }

  if (hasConversionPair(PERSPECTIVE_EXACT_CONVERSIONS, fromModel, toModel)) {
    return 'exact';
  }

  if (hasConversionPair(PERSPECTIVE_APPROXIMATE_CONVERSIONS, fromModel, toModel)) {
    return 'approximate';
  }

  return 'incompatible';
}

function getFisheyeCompatibility(
  fromModel: CameraModelId,
  toModel: CameraModelId
): ConversionCompatibility {
  if (hasConversionPair(FISHEYE_EXACT_CONVERSIONS, fromModel, toModel)) {
    return 'exact';
  }

  if (hasConversionPair(FISHEYE_APPROXIMATE_CONVERSIONS, fromModel, toModel)) {
    return 'approximate';
  }

  return 'incompatible';
}
