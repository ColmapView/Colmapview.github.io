import type { Camera } from '../types/colmap';
import { getCameraIntrinsics } from './cameraIntrinsics';
import { distortNormalized, undistortNormalized } from './cameraUndistortion';

export interface ValidationResult {
  maxError: number;
  avgError: number;
  sampleCount: number;
}

export function validateCameraModelProjectionConversion(
  srcCamera: Camera,
  dstCamera: Camera,
  sampleCount: number = 10
): ValidationResult {
  const { width, height } = srcCamera;
  const errors: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    for (let j = 0; j < sampleCount; j++) {
      const x = (width * (i + 0.5)) / sampleCount;
      const y = (height * (j + 0.5)) / sampleCount;

      const srcNorm = unprojectPoint(srcCamera, x, y);
      if (!srcNorm) continue;

      const dstPoint = projectPoint(dstCamera, srcNorm.x, srcNorm.y);
      if (!dstPoint) continue;

      const dx = dstPoint.x - x;
      const dy = dstPoint.y - y;
      errors.push(Math.sqrt(dx * dx + dy * dy));
    }
  }

  if (errors.length === 0) {
    return { maxError: Infinity, avgError: Infinity, sampleCount: 0 };
  }

  const maxError = Math.max(...errors);
  const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;

  return { maxError, avgError, sampleCount: errors.length };
}

/**
 * Unproject a pixel coordinate to undistorted pinhole-normalised coordinates
 * (X/Z, Y/Z) by delegating distortion removal to the canonical
 * `undistortNormalized` from `cameraUndistortion.ts`.
 *
 * Returns null when the ray falls outside the representable domain (e.g. a
 * fisheye ray past ~90°, or a FOV ray past the tangent singularity).
 */
function unprojectPoint(
  camera: Camera,
  px: number,
  py: number
): { x: number; y: number } | null {
  const i = getCameraIntrinsics(camera);
  const xd = (px - i.cx) / i.fx;
  const yd = (py - i.cy) / i.fy;
  const result = undistortNormalized({ x: xd, y: yd }, i, camera.modelId);
  if (!result.valid) return null;
  return { x: result.x, y: result.y };
}

/**
 * Project undistorted pinhole-normalised coordinates (X/Z, Y/Z) to pixel
 * coordinates by delegating distortion application to the canonical
 * `distortNormalized` from `cameraUndistortion.ts`.
 */
function projectPoint(
  camera: Camera,
  nx: number,
  ny: number
): { x: number; y: number } | null {
  const i = getCameraIntrinsics(camera);
  const d = distortNormalized({ x: nx, y: ny }, i, camera.modelId);
  return { x: d.x * i.fx + i.cx, y: d.y * i.fy + i.cy };
}
