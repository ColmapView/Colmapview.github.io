import { describe, expect, it } from 'vitest';
import type { Camera } from '../types/colmap';
import { CameraModelId } from '../types/colmap';
import { validateCameraModelProjectionConversion } from './cameraModelProjection';

function makeCamera(modelId: CameraModelId, params: number[]): Camera {
  return {
    cameraId: 1,
    modelId,
    width: 1920,
    height: 1080,
    params,
  };
}

describe('validateCameraModelProjectionConversion', () => {
  it('returns zero error for identical pinhole cameras', () => {
    const camera = makeCamera(CameraModelId.PINHOLE, [1000, 1000, 960, 540]);

    const result = validateCameraModelProjectionConversion(camera, camera, 4);

    expect(result.sampleCount).toBe(16);
    expect(result.maxError).toBeCloseTo(0, 10);
    expect(result.avgError).toBeCloseTo(0, 10);
  });

  it('keeps radial to OpenCV expansion reprojection-equivalent', () => {
    const src = makeCamera(CameraModelId.SIMPLE_RADIAL, [1000, 960, 540, 0.1]);
    const dst = makeCamera(CameraModelId.OPENCV, [1000, 1000, 960, 540, 0.1, 0, 0, 0]);

    const result = validateCameraModelProjectionConversion(src, dst, 8);

    expect(result.sampleCount).toBe(64);
    expect(result.maxError).toBeLessThan(1e-5);
  });

  it('reports measurable error when k2 distortion is dropped', () => {
    const src = makeCamera(CameraModelId.RADIAL, [1000, 960, 540, 0.1, 0.05]);
    const dst = makeCamera(CameraModelId.SIMPLE_RADIAL, [1000, 960, 540, 0.1]);

    const result = validateCameraModelProjectionConversion(src, dst, 8);

    expect(result.maxError).toBeGreaterThan(0.1);
    expect(result.avgError).toBeGreaterThan(0);
  });

  it('keeps fisheye expansion reprojection-equivalent', () => {
    const src = makeCamera(CameraModelId.SIMPLE_RADIAL_FISHEYE, [1000, 960, 540, 0.1]);
    const dst = makeCamera(CameraModelId.OPENCV_FISHEYE, [1000, 1000, 960, 540, 0.1, 0, 0, 0]);

    const result = validateCameraModelProjectionConversion(src, dst, 8);

    expect(result.maxError).toBeLessThan(1e-5);
  });

  it('returns infinite errors when no samples are requested', () => {
    const camera = makeCamera(CameraModelId.SIMPLE_PINHOLE, [1000, 960, 540]);

    const result = validateCameraModelProjectionConversion(camera, camera, 0);

    expect(result).toEqual({
      maxError: Infinity,
      avgError: Infinity,
      sampleCount: 0,
    });
  });
});
