import { CAMERA_MODEL_COLMAP_NAMES, CAMERA_MODEL_NAMES } from '../../utils/cameraModelNames';
import {
  CAMERA_MODEL_DESCRIPTORS,
  cameraModelHasPinholeIntrinsics,
  getCameraModelParamNames,
} from '../../utils/cameraModelRegistry';
import type { CameraModelId } from '../../types/cameraModelId';

export interface CameraPoseParameterDisplay {
  name: string;
  value: string;
}

export interface CameraPoseNumericDisplay {
  className: string;
  value: string;
  isNegative: boolean;
}

export interface CameraPoseDisplayModel {
  modelName: string;
  modelTitle: string;
  width: number;
  height: number;
  parameters: CameraPoseParameterDisplay[];
  rotation: CameraPoseNumericDisplay[];
  translation: CameraPoseNumericDisplay[];
}

export interface CameraPoseSource {
  modelId: number;
  width: number;
  height: number;
  params: readonly number[];
}

export function formatImageDetailCameraParam(value: number): string {
  const absVal = Math.abs(value);
  if (absVal >= 1) {
    return value.toFixed(1);
  }
  if (absVal === 0) {
    return '0';
  }
  return value.toPrecision(4);
}

export function getCameraPoseSignedValueClassName(value: number): string {
  return value < 0 ? 'text-ds-error' : 'text-ds-primary';
}

function formatSignedPoseValue(value: number, fractionDigits: number): CameraPoseNumericDisplay {
  return {
    className: getCameraPoseSignedValueClassName(value),
    value: value.toFixed(fractionDigits),
    isNegative: value < 0,
  };
}

export function buildCameraPoseDisplayModel(
  camera: CameraPoseSource,
  qvec: readonly number[],
  tvec: readonly number[]
): CameraPoseDisplayModel {
  const modelId = camera.modelId as CameraModelId;

  const base = {
    modelName: CAMERA_MODEL_NAMES[camera.modelId] ?? `MODEL_${camera.modelId}`,
    modelTitle: CAMERA_MODEL_COLMAP_NAMES[camera.modelId] ?? `MODEL_${camera.modelId}`,
    width: camera.width,
    height: camera.height,
    rotation: [qvec[1], qvec[2], qvec[3], qvec[0]].map((value) => formatSignedPoseValue(value, 3)),
    translation: tvec.map((value) => formatSignedPoseValue(value, 2)),
  };

  // Spherical cameras have no pinhole intrinsics (getCameraIntrinsics returns dummy
  // fx=1/fy=1/cx=0/cy=0). Instead of the raw [w, h] params or those meaningless
  // defaults, surface a single friendly "panorama" entry carrying the resolution.
  // Check modelId in CAMERA_MODEL_DESCRIPTORS first so unknown model IDs (test
  // fixtures, future models) fall through safely.
  if (modelId in CAMERA_MODEL_DESCRIPTORS && !cameraModelHasPinholeIntrinsics(modelId)) {
    return { ...base, parameters: [{ name: 'panorama', value: `${base.width}x${base.height}` }] };
  }

  // Param labels come from the registry (single source of truth); unknown /
  // out-of-registry ids fall through to the `p${index}` fallback below.
  const paramNames: readonly string[] =
    modelId in CAMERA_MODEL_DESCRIPTORS ? getCameraModelParamNames(modelId) : [];

  return {
    ...base,
    parameters: camera.params.map((param, index) => ({
      name: paramNames[index] || `p${index}`,
      value: formatImageDetailCameraParam(param),
    })),
  };
}
