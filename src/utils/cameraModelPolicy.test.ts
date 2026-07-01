import { describe, expect, it } from 'vitest';
import { CameraModelId } from '../types/colmap';
import {
  CAMERA_MODEL_COLMAP_NAMES,
  FISHEYE_CAMERA_MODELS,
  getCameraModelCompatibility,
  getCameraModelColmapName,
  isCameraModelId,
  isFisheyeCameraModel,
  isPerspectiveCameraModel,
  PARAM_NAMES,
  parseCameraModelId,
  PERSPECTIVE_CAMERA_MODELS,
} from './cameraModelPolicy';

describe('cameraModelPolicy', () => {
  const allModels = Object.values(CameraModelId).filter(
    (value): value is CameraModelId => typeof value === 'number'
  );

  it('defines names and ordered params for every COLMAP camera model id', () => {
    for (const modelId of allModels) {
      expect(CAMERA_MODEL_COLMAP_NAMES[modelId]).toBeDefined();
      expect(getCameraModelColmapName(modelId)).not.toMatch(/^Unknown/);
      expect(PARAM_NAMES[modelId]).toBeDefined();
      expect(PARAM_NAMES[modelId].length).toBeGreaterThan(0);
    }
  });

  it('classifies supported conversion families explicitly', () => {
    expect(PERSPECTIVE_CAMERA_MODELS).toContain(CameraModelId.FOV);
    expect(FISHEYE_CAMERA_MODELS).toContain(CameraModelId.OPENCV_FISHEYE);

    expect(isPerspectiveCameraModel(CameraModelId.RADIAL)).toBe(true);
    expect(isFisheyeCameraModel(CameraModelId.RADIAL_FISHEYE)).toBe(true);
    expect(isPerspectiveCameraModel(CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE)).toBe(false);
    expect(isFisheyeCameraModel(CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE)).toBe(true); // model 11 is fisheye per registry
  });

  it('returns exact compatibility for same-model and expansion conversions', () => {
    expect(getCameraModelCompatibility(CameraModelId.OPENCV, CameraModelId.OPENCV)).toBe('exact');
    expect(getCameraModelCompatibility(CameraModelId.SIMPLE_PINHOLE, CameraModelId.OPENCV)).toBe('exact');
    expect(getCameraModelCompatibility(CameraModelId.SIMPLE_RADIAL_FISHEYE, CameraModelId.THIN_PRISM_FISHEYE)).toBe('exact');
  });

  it('returns approximate compatibility for reductions, FOV radial conversions, and FULL_OPENCV expansion', () => {
    expect(getCameraModelCompatibility(CameraModelId.OPENCV, CameraModelId.RADIAL)).toBe('approximate');
    expect(getCameraModelCompatibility(CameraModelId.FOV, CameraModelId.RADIAL)).toBe('approximate');
    expect(getCameraModelCompatibility(CameraModelId.RADIAL, CameraModelId.FOV)).toBe('approximate');
    expect(getCameraModelCompatibility(CameraModelId.OPENCV, CameraModelId.FULL_OPENCV)).toBe('approximate');
  });

  it('rejects cross-family, unsupported, and one-way FULL_OPENCV conversions', () => {
    expect(getCameraModelCompatibility(CameraModelId.OPENCV, CameraModelId.OPENCV_FISHEYE)).toBe('incompatible');
    expect(getCameraModelCompatibility(CameraModelId.FULL_OPENCV, CameraModelId.OPENCV)).toBe('incompatible');
    expect(getCameraModelCompatibility(CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE, CameraModelId.OPENCV_FISHEYE)).toBe('incompatible');
  });

  it('narrows raw values to known COLMAP camera model IDs', () => {
    expect(isCameraModelId(CameraModelId.PINHOLE)).toBe(true);
    expect(isCameraModelId(999)).toBe(false);
    expect(isCameraModelId(1.5)).toBe(false);
    expect(isCameraModelId('1')).toBe(false);
  });

  it('parses supported camera model IDs and rejects unsupported IDs with context', () => {
    expect(parseCameraModelId(CameraModelId.OPENCV, 'binary camera 3')).toBe(CameraModelId.OPENCV);
    expect(() => parseCameraModelId(999, 'binary camera 3')).toThrow(
      'Unsupported camera model id 999 in binary camera 3'
    );
  });
});
