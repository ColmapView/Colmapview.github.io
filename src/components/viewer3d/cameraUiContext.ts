import type { CameraDisplayMode } from '../../store/types';
import type { ImageId, Reconstruction } from '../../types/colmap';
import {
  CAMERA_MODEL_DESCRIPTORS,
  getCameraModelFamily,
  type CameraModelFamily,
} from '../../utils/cameraModelRegistry';
import type { CameraModelId } from '../../types/cameraModelId';

export interface CameraUiContext {
  /** Regular projective and fisheye cameras have planar display modes. */
  hasPinholeCameras: boolean;
  hasSphericalCameras: boolean;
  selectedCameraFamily: CameraModelFamily | null;
}

function cameraFamily(modelId: number): CameraModelFamily {
  return modelId in CAMERA_MODEL_DESCRIPTORS
    ? getCameraModelFamily(modelId as CameraModelId)
    : 'pinhole';
}

export function getCameraUiContext(
  reconstruction: Pick<Reconstruction, 'cameras' | 'images'> | null,
  selectedImageId: ImageId | null = null
): CameraUiContext {
  let hasPinholeCameras = !reconstruction || reconstruction.cameras.size === 0;
  let hasSphericalCameras = false;
  if (reconstruction) {
    for (const camera of reconstruction.cameras.values()) {
      if (cameraFamily(camera.modelId) === 'spherical') hasSphericalCameras = true;
      else hasPinholeCameras = true;
      if (hasPinholeCameras && hasSphericalCameras) break;
    }
  }

  const image = selectedImageId === null ? undefined : reconstruction?.images.get(selectedImageId);
  const selectedCamera = image ? reconstruction?.cameras.get(image.cameraId) : undefined;
  return {
    hasPinholeCameras,
    hasSphericalCameras,
    selectedCameraFamily: selectedCamera ? cameraFamily(selectedCamera.modelId) : null,
  };
}

/** Image planes replace regular match lines; panoramas still use camera connections. */
export function cameraDisplaySupportsMatches(
  mode: CameraDisplayMode,
  context: CameraUiContext
): boolean {
  return mode !== 'imageplane'
    || context.selectedCameraFamily === 'spherical'
    || (context.selectedCameraFamily === null && context.hasSphericalCameras);
}
