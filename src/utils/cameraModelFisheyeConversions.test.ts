import { describe, expect, it } from 'vitest';
import { CameraModelId } from '../types/colmap';
import { DEFAULT_CONVERSION_THRESHOLD } from './cameraModelConversionTypes';
import { convertFisheyeCameraModel } from './cameraModelFisheyeConversions';

describe('convertFisheyeCameraModel', () => {
  it('expands SIMPLE_RADIAL_FISHEYE to THIN_PRISM_FISHEYE exactly', () => {
    expect(convertFisheyeCameraModel(
      CameraModelId.SIMPLE_RADIAL_FISHEYE,
      CameraModelId.THIN_PRISM_FISHEYE,
      [500, 320, 240, 0.1],
      DEFAULT_CONVERSION_THRESHOLD
    )).toEqual({
      type: 'exact',
      params: [500, 500, 320, 240, 0.1, 0, 0, 0, 0, 0, 0, 0],
    });
  });

  it('drops negligible RADIAL_FISHEYE k2 exactly and non-negligible k2 approximately', () => {
    expect(convertFisheyeCameraModel(
      CameraModelId.RADIAL_FISHEYE,
      CameraModelId.SIMPLE_RADIAL_FISHEYE,
      [500, 320, 240, 0.1, 1e-8],
      DEFAULT_CONVERSION_THRESHOLD
    )).toEqual({
      type: 'exact',
      params: [500, 320, 240, 0.1],
    });

    expect(convertFisheyeCameraModel(
      CameraModelId.RADIAL_FISHEYE,
      CameraModelId.SIMPLE_RADIAL_FISHEYE,
      [500, 320, 240, 0.1, 0.05],
      DEFAULT_CONVERSION_THRESHOLD
    )).toMatchObject({
      type: 'approximate',
      params: [500, 320, 240, 0.1],
      maxError: 0.05,
    });
  });

  it('remaps OPENCV_FISHEYE k3/k4 into THIN_PRISM_FISHEYE indices exactly', () => {
    expect(convertFisheyeCameraModel(
      CameraModelId.OPENCV_FISHEYE,
      CameraModelId.THIN_PRISM_FISHEYE,
      [500, 520, 320, 240, 0.1, 0.2, 0.3, 0.4],
      DEFAULT_CONVERSION_THRESHOLD
    )).toEqual({
      type: 'exact',
      params: [500, 520, 320, 240, 0.1, 0.2, 0, 0, 0.3, 0.4, 0, 0],
    });
  });

  it('reports dropped higher-order and aspect-ratio terms for OPENCV_FISHEYE reductions', () => {
    const result = convertFisheyeCameraModel(
      CameraModelId.OPENCV_FISHEYE,
      CameraModelId.RADIAL_FISHEYE,
      [500, 550, 320, 240, 0.1, 0.2, 0.03, 0.04],
      DEFAULT_CONVERSION_THRESHOLD
    );

    expect(result).toMatchObject({
      type: 'approximate',
      params: [525, 320, 240, 0.1, 0.2],
    });
    expect(result?.type === 'approximate' ? result.warning : '').toContain('Dropping k3=3.000e-2');
    expect(result?.type === 'approximate' ? result.warning : '').toContain('Using mean f=525.00');
  });

  it('remaps THIN_PRISM_FISHEYE to OPENCV_FISHEYE and reports dropped side terms', () => {
    const result = convertFisheyeCameraModel(
      CameraModelId.THIN_PRISM_FISHEYE,
      CameraModelId.OPENCV_FISHEYE,
      [500, 520, 320, 240, 0.1, 0.2, 0.01, 0.02, 0.3, 0.4, 0.05, 0.06],
      DEFAULT_CONVERSION_THRESHOLD
    );

    expect(result).toMatchObject({
      type: 'approximate',
      params: [500, 520, 320, 240, 0.1, 0.2, 0.3, 0.4],
    });
    expect(result?.type === 'approximate' ? result.warning : '').toContain('Dropping tangential');
    expect(result?.type === 'approximate' ? result.warning : '').toContain('Dropping thin prism');
  });

  it('returns null for non-fisheye source models', () => {
    expect(convertFisheyeCameraModel(
      CameraModelId.OPENCV,
      CameraModelId.RADIAL_FISHEYE,
      [500, 500, 320, 240, 0.1, 0, 0, 0],
      DEFAULT_CONVERSION_THRESHOLD
    )).toBeNull();
  });
});
