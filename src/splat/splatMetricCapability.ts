import type { Reconstruction } from '../types/colmap';
import type { CameraModelId } from '../types/cameraModelId';
import {
  CAMERA_MODEL_DESCRIPTORS,
  getCameraModelProjectionClass,
  type ProjectionClass,
} from '../utils/cameraModelRegistry';

/**
 * Projection classes the splat metric renderer can currently reproduce. PSNR/SSIM render
 * the splat from a camera's viewpoint and compare it to the ground-truth image, so a camera
 * is metric-capable only if the renderer implements its projection. Today that is undistorted
 * pinhole (`projectionClass === 'none'`, i.e. SIMPLE_PINHOLE / PINHOLE). This set is the one
 * place that fact lives: when the renderer learns fisheye/distorted/equirectangular, add the
 * class here and the gate, selection filter, coloring, and session assert all follow.
 */
export const SPLAT_METRIC_SUPPORTED_PROJECTION_CLASSES: ReadonlySet<ProjectionClass> = new Set<ProjectionClass>(['none']);

/** Whether the splat metric renderer can reproduce this camera model's projection. */
export function cameraModelSupportsSplatMetric(modelId: CameraModelId): boolean {
  if (!Object.prototype.hasOwnProperty.call(CAMERA_MODEL_DESCRIPTORS, modelId)) {
    return false;
  }
  return SPLAT_METRIC_SUPPORTED_PROJECTION_CLASSES.has(getCameraModelProjectionClass(modelId));
}

/** True when the reconstruction has at least one camera the splat metric can be computed for. */
export function reconstructionHasSplatMetricCapableCamera(reconstruction: Reconstruction | null): boolean {
  if (!reconstruction) return false;
  for (const camera of reconstruction.cameras.values()) {
    if (cameraModelSupportsSplatMetric(camera.modelId)) return true;
  }
  return false;
}
