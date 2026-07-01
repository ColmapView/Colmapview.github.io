import type { CameraFrustumItem } from './cameraFrustumGeometry';
import { isSphericalCameraModel } from '../../utils/cameraModelRegistry';

export function partitionFrustumsByFamily(items: CameraFrustumItem[]): {
  spherical: CameraFrustumItem[];
  nonSpherical: CameraFrustumItem[];
} {
  const spherical: CameraFrustumItem[] = [];
  const nonSpherical: CameraFrustumItem[] = [];
  for (const item of items) {
    (isSphericalCameraModel(item.camera.modelId) ? spherical : nonSpherical).push(item);
  }
  return { spherical, nonSpherical };
}
