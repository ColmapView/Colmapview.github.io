import { describe, it, expect } from 'vitest';
import { CameraModelId, CAMERA_MODEL_NUM_PARAMS } from '../types/colmap';
import { PARAM_NAMES, CAMERA_MODEL_COLMAP_NAMES, isPerspectiveCameraModel, isFisheyeCameraModel, isSphericalCameraModel } from './cameraModelPolicy';
import { CAMERA_MODEL_NAMES } from './cameraModelNames';
import {
  type CameraModelFamily,
  CAMERA_MODEL_DESCRIPTORS,
  getCameraModelNumParams,
  getCameraModelParamNames,
  getCameraModelColmapName,
  getCameraModelDisplayName,
  colmapNameToModelId,
  getCameraModelFamily,
  cameraModelHasPinholeIntrinsics,
  isSphericalCameraModel,
} from './cameraModelRegistry';

describe('cameraModelRegistry', () => {
  it('has a descriptor for every CameraModelId', () => {
    for (const id of Object.values(CameraModelId)) {
      expect(CAMERA_MODEL_DESCRIPTORS[id]).toBeDefined();
      expect(CAMERA_MODEL_DESCRIPTORS[id].id).toBe(id);
    }
  });

  it('param count equals paramNames length and matches the legacy table', () => {
    for (const id of Object.values(CameraModelId)) {
      expect(getCameraModelNumParams(id)).toBe(getCameraModelParamNames(id).length);
      expect(getCameraModelNumParams(id)).toBe(CAMERA_MODEL_NUM_PARAMS[id]);
    }
  });

  it('round-trips colmap names', () => {
    for (const id of Object.values(CameraModelId)) {
      expect(colmapNameToModelId(getCameraModelColmapName(id))).toBe(id);
    }
  });

  it('classifies every model into its expected family', () => {
    const expectedFamily: Record<number, CameraModelFamily> = {
      [CameraModelId.SIMPLE_PINHOLE]: 'pinhole',
      [CameraModelId.PINHOLE]: 'pinhole',
      [CameraModelId.SIMPLE_RADIAL]: 'pinhole',
      [CameraModelId.RADIAL]: 'pinhole',
      [CameraModelId.OPENCV]: 'pinhole',
      [CameraModelId.OPENCV_FISHEYE]: 'fisheye',
      [CameraModelId.FULL_OPENCV]: 'pinhole',
      [CameraModelId.FOV]: 'pinhole',
      [CameraModelId.SIMPLE_RADIAL_FISHEYE]: 'fisheye',
      [CameraModelId.RADIAL_FISHEYE]: 'fisheye',
      [CameraModelId.THIN_PRISM_FISHEYE]: 'fisheye',
      [CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE]: 'fisheye',
    };
    for (const id of Object.values(CameraModelId)) {
      expect(getCameraModelFamily(id)).toBe(expectedFamily[id]);
    }
  });

  it('every current model has pinhole intrinsics and none is spherical yet', () => {
    for (const id of Object.values(CameraModelId)) {
      expect(cameraModelHasPinholeIntrinsics(id)).toBe(true);
      expect(isSphericalCameraModel(id)).toBe(false);
    }
  });

  it('registry paramNames, colmap names, and display names match the legacy tables', () => {
    for (const id of Object.values(CameraModelId)) {
      expect(getCameraModelParamNames(id)).toEqual(PARAM_NAMES[id]);
      expect(getCameraModelColmapName(id)).toBe(CAMERA_MODEL_COLMAP_NAMES[id]);
      expect(getCameraModelDisplayName(id)).toBe(CAMERA_MODEL_NAMES[id]);
    }
  });
});

describe('registry-derived classification parity', () => {
  it('reproduces perspective membership for the original models', () => {
    expect(isPerspectiveCameraModel(CameraModelId.PINHOLE)).toBe(true);
    expect(isPerspectiveCameraModel(CameraModelId.FULL_OPENCV)).toBe(true);
    expect(isPerspectiveCameraModel(CameraModelId.FOV)).toBe(true);
    expect(isPerspectiveCameraModel(CameraModelId.OPENCV_FISHEYE)).toBe(false);
  });

  it('classifies the previously-unwired RAD_TAN_THIN_PRISM_FISHEYE as fisheye', () => {
    expect(isFisheyeCameraModel(CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE)).toBe(true);
    expect(isPerspectiveCameraModel(CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE)).toBe(false);
    expect(isSphericalCameraModel(CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE)).toBe(false);
  });
});
