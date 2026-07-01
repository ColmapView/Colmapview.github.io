import type { ImageId, Reconstruction } from '../../types/colmap';
import type { SplatPsnrComputeRequest } from '../../store';
import { cameraModelHasPinholeIntrinsics } from '../../utils/cameraModelRegistry';

/**
 * Returns the image IDs that should be evaluated by the splat PSNR metric for
 * a given compute request.
 *
 * Spherical (EQUIRECTANGULAR) cameras are filtered out here — they have no
 * focal-length intrinsics and cannot be rendered by the pinhole splat pipeline.
 * Filtering upstream means they never enter the pending queue, so the store is
 * not left with orphaned pending entries.
 *
 * Other non-pinhole cameras (fisheye, etc.) are still passed through so that
 * the existing `assertPinholeCamera` backstop in the WebGPU PSNR session can
 * handle them consistently.
 */
export function getRequestedSplatPsnrImageIds(
  request: SplatPsnrComputeRequest,
  reconstruction: Reconstruction
): ImageId[] {
  if (request.scope === 'selected') {
    const { selectedImageId } = request;
    if (selectedImageId === undefined || selectedImageId === null) {
      return [];
    }
    // Silently skip the selected image if its camera is spherical.
    const image = reconstruction.images.get(selectedImageId);
    const camera = image ? reconstruction.cameras.get(image.cameraId) : undefined;
    if (camera && !cameraModelHasPinholeIntrinsics(camera.modelId)) {
      return [];
    }
    return [selectedImageId];
  }

  // scope === 'all': exclude images with spherical cameras.
  // Images whose camera cannot be found are kept so that prepareSplatPsnrImage
  // can report the "Missing camera or image" error as usual.
  return Array.from(reconstruction.images.keys()).filter((imageId) => {
    const image = reconstruction.images.get(imageId);
    if (!image) return false;
    const camera = reconstruction.cameras.get(image.cameraId);
    if (!camera) return true; // missing camera — pass through to existing error handling
    return cameraModelHasPinholeIntrinsics(camera.modelId);
  });
}
