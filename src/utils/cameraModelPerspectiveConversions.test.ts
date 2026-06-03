import { describe, expect, it } from 'vitest';
import { CameraModelId } from '../types/colmap';
import { DEFAULT_CONVERSION_THRESHOLD } from './cameraModelConversionTypes';
import { convertPerspectiveCameraModel } from './cameraModelPerspectiveConversions';

describe('convertPerspectiveCameraModel', () => {
  it('expands SIMPLE_PINHOLE to OPENCV exactly', () => {
    expect(convertPerspectiveCameraModel(
      CameraModelId.SIMPLE_PINHOLE,
      CameraModelId.OPENCV,
      [500, 320, 240],
      DEFAULT_CONVERSION_THRESHOLD
    )).toEqual({
      type: 'exact',
      params: [500, 500, 320, 240, 0, 0, 0, 0],
    });
  });

  it('uses mean focal length when reducing non-square PINHOLE intrinsics', () => {
    const result = convertPerspectiveCameraModel(
      CameraModelId.PINHOLE,
      CameraModelId.SIMPLE_PINHOLE,
      [500, 550, 320, 240],
      DEFAULT_CONVERSION_THRESHOLD
    );

    expect(result).toMatchObject({
      type: 'approximate',
      params: [525, 320, 240],
    });
    expect(result?.type === 'approximate' ? result.warning : '').toContain('Using mean f=525.00');
  });

  it('rejects SIMPLE_RADIAL to FOV when distortion is not positive', () => {
    expect(convertPerspectiveCameraModel(
      CameraModelId.SIMPLE_RADIAL,
      CameraModelId.FOV,
      [500, 320, 240, -0.1],
      DEFAULT_CONVERSION_THRESHOLD
    )).toEqual({
      type: 'incompatible',
      reason: 'FOV model requires positive distortion (k > 0)',
    });
  });

  it('drops negligible RADIAL k2 exactly and non-negligible k2 approximately', () => {
    expect(convertPerspectiveCameraModel(
      CameraModelId.RADIAL,
      CameraModelId.SIMPLE_RADIAL,
      [500, 320, 240, 0.1, 1e-8],
      DEFAULT_CONVERSION_THRESHOLD
    )).toEqual({
      type: 'exact',
      params: [500, 320, 240, 0.1],
    });

    expect(convertPerspectiveCameraModel(
      CameraModelId.RADIAL,
      CameraModelId.SIMPLE_RADIAL,
      [500, 320, 240, 0.1, 0.05],
      DEFAULT_CONVERSION_THRESHOLD
    )).toMatchObject({
      type: 'approximate',
      params: [500, 320, 240, 0.1],
      maxError: 0.05,
    });
  });

  it('preserves OPENCV radial terms while reporting dropped tangential distortion', () => {
    const result = convertPerspectiveCameraModel(
      CameraModelId.OPENCV,
      CameraModelId.RADIAL,
      [500, 500, 320, 240, 0.1, 0.05, 0.01, 0.02],
      DEFAULT_CONVERSION_THRESHOLD
    );

    expect(result).toMatchObject({
      type: 'approximate',
      params: [500, 320, 240, 0.1, 0.05],
    });
    expect(result?.type === 'approximate' ? result.warning : '').toContain('Dropping tangential');
  });

  it('returns null for non-perspective source models', () => {
    expect(convertPerspectiveCameraModel(
      CameraModelId.OPENCV_FISHEYE,
      CameraModelId.RADIAL,
      [500, 500, 320, 240, 0.1, 0, 0, 0],
      DEFAULT_CONVERSION_THRESHOLD
    )).toBeNull();
  });
});
