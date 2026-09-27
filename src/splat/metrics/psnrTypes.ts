import type { Camera } from '../../types/colmap';

export const SPLAT_PSNR_DEFAULT_MAX_DIMENSION = Number.POSITIVE_INFINITY;

interface RenderSize {
  width: number;
  height: number;
  scale: number;
}

export interface PsnrResult {
  psnr: number;
  ssim?: number;
  mse: number;
  validPixelCount: number;
}

export function getSplatPsnrRenderSize(
  camera: Camera,
  maxDimension = SPLAT_PSNR_DEFAULT_MAX_DIMENSION
): RenderSize {
  if (camera.width <= 0 || camera.height <= 0) {
    return { width: 0, height: 0, scale: 0 };
  }

  if (maxDimension <= 0) {
    return { width: 0, height: 0, scale: 0 };
  }

  const largestSide = Math.max(camera.width, camera.height);
  const scale = Number.isFinite(maxDimension)
    ? Math.min(1, maxDimension / largestSide)
    : 1;
  return {
    width: Math.max(1, Math.round(camera.width * scale)),
    height: Math.max(1, Math.round(camera.height * scale)),
    scale,
  };
}
