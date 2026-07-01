import { describe, it, expect } from 'vitest';
import { CameraModelId, CAMERA_MODEL_NUM_PARAMS } from '../types/colmap';
import { PARAM_NAMES, CAMERA_MODEL_COLMAP_NAMES } from './cameraModelPolicy';
import { CAMERA_MODEL_NAMES } from './cameraModelNames';
import {
  CAMERA_MODEL_DESCRIPTORS,
  getCameraModelNumParams,
  getCameraModelParamNames,
  getCameraModelColmapName,
  getCameraModelDisplayName,
  colmapNameToModelId,
  getCameraModelFamily,
  cameraModelHasPinholeIntrinsics,
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

  it('classifies every model into a family and only spherical lacks pinhole intrinsics', () => {
    for (const id of Object.values(CameraModelId)) {
      const family = getCameraModelFamily(id);
      expect(['pinhole', 'fisheye', 'spherical']).toContain(family);
      expect(cameraModelHasPinholeIntrinsics(id)).toBe(family !== 'spherical');
    }
  });
});
