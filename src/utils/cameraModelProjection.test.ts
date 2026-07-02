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

  it('THIN_PRISM_FISHEYE applies tangential p1/p2 terms (were silently dropped before refactor)', () => {
    // THIN_PRISM_FISHEYE: [fx, fy, cx, cy, k1, k2, p1, p2, k3, k4, sx1, sy1]
    const camWithP1 = makeCamera(CameraModelId.THIN_PRISM_FISHEYE, [
      1000, 1000, 960, 540,   // fx, fy, cx, cy
      0.05, 0,                // k1, k2
      5e-3, 0,                // p1, p2 — tangential distortion being tested
      0, 0,                   // k3, k4
      0, 0,                   // sx1, sy1
    ]);
    const camNoP1 = makeCamera(CameraModelId.THIN_PRISM_FISHEYE, [
      1000, 1000, 960, 540,
      0.05, 0,
      0, 0,                   // p1=0, p2=0
      0, 0,
      0, 0,
    ]);

    // Cross-camera check: unproject from the p1-camera, then re-project through the
    // no-p1-camera.  When p1 is correctly applied during unproject, the recovered
    // undistorted ray differs from what a no-p1 camera would see, so re-projection
    // produces a measurable pixel error.
    // Pre-fix (p1/p2 silently dropped): both cameras are treated identically →
    // error ≈ 0 → assertion FAILS.
    // Post-fix (delegation to canonical): tangential term is applied → error ≥ ~1 px →
    // assertion PASSES.
    const crossResult = validateCameraModelProjectionConversion(camWithP1, camNoP1, 4);
    expect(crossResult.maxError).toBeGreaterThan(0.5);

    // Round-trip through the same camera must be accurate to < 1e-6 pixels.
    const rtResult = validateCameraModelProjectionConversion(camWithP1, camWithP1, 4);
    expect(rtResult.maxError).toBeLessThan(1e-6);
  });
});
