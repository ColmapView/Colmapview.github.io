import { CameraModelId } from '../types/colmap';
import { CAMERA_MODEL_COLMAP_NAMES } from './cameraModelNames';

export type ConversionCompatibility = 'exact' | 'approximate' | 'incompatible';
export { CAMERA_MODEL_COLMAP_NAMES } from './cameraModelNames';

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

export const PERSPECTIVE_CAMERA_MODELS: readonly CameraModelId[] = [
  CameraModelId.SIMPLE_PINHOLE,
  CameraModelId.PINHOLE,
  CameraModelId.SIMPLE_RADIAL,
  CameraModelId.RADIAL,
  CameraModelId.OPENCV,
  CameraModelId.FULL_OPENCV,
  CameraModelId.FOV,
];

export const FISHEYE_CAMERA_MODELS: readonly CameraModelId[] = [
  CameraModelId.SIMPLE_RADIAL_FISHEYE,
  CameraModelId.RADIAL_FISHEYE,
  CameraModelId.OPENCV_FISHEYE,
  CameraModelId.THIN_PRISM_FISHEYE,
];

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
  return CAMERA_MODEL_COLMAP_NAMES[modelId] ?? `Unknown(${modelId})`;
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
