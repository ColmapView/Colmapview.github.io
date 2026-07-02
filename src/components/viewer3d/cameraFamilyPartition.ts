import type { CameraFrustumItem } from './cameraFrustumGeometry';
import type { CameraModelId } from '../../types/colmap';
import { CAMERA_MODEL_DESCRIPTORS, isSphericalCameraModel } from '../../utils/cameraModelRegistry';

/**
 * True for spherical (360°) camera models. Out-of-registry model ids (e.g. a future COLMAP
 * model this build doesn't know) are treated as non-spherical instead of throwing through the
 * registry family lookup — mirrors the image-detail modal's `modelId in CAMERA_MODEL_DESCRIPTORS`
 * guard so unknown models degrade to the pinhole bucket.
 */
function isSphericalFamily(modelId: number): boolean {
  return modelId in CAMERA_MODEL_DESCRIPTORS && isSphericalCameraModel(modelId as CameraModelId);
}

export function partitionFrustumsByFamily(items: CameraFrustumItem[]): {
  spherical: CameraFrustumItem[];
  nonSpherical: CameraFrustumItem[];
} {
  const spherical: CameraFrustumItem[] = [];
  const nonSpherical: CameraFrustumItem[] = [];
  for (const item of items) {
    (isSphericalFamily(item.camera.modelId) ? spherical : nonSpherical).push(item);
  }
  return { spherical, nonSpherical };
}
