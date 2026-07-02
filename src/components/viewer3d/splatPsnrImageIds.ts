import type { ImageId, Reconstruction } from '../../types/colmap';
import type { NotificationType, SplatPsnrComputeRequest } from '../../store';
import { cameraModelHasPinholeIntrinsics } from '../../utils/cameraModelRegistry';

/**
 * The image IDs to evaluate for a splat PSNR compute request, plus the
 * spherical-exclusion bookkeeping needed to notify the user.
 *
 * Spherical (EQUIRECTANGULAR) cameras are filtered out here — they have no
 * focal-length intrinsics and cannot be rendered by the pinhole splat pipeline.
 * `cameraModelHasPinholeIntrinsics` is the exact complement of the spherical
 * family, so the excluded set is precisely the spherical cameras.
 */
export interface SplatPsnrImageSelection {
  /** Image IDs that should proceed into the PSNR pipeline. */
  imageIds: ImageId[];
  /**
   * `scope: 'all'` only — how many images were dropped because their camera is
   * spherical. Zero for `scope: 'selected'` (see `selectedIsSpherical` instead).
   */
  excludedSphericalCount: number;
  /**
   * `scope: 'selected'` only — true when the selected image's camera is
   * spherical, i.e. the compute would be a silent no-op.
   */
  selectedIsSpherical: boolean;
}

/**
 * A one-shot notification describing why images were excluded from a PSNR
 * compute, or `null` when nothing needs to be surfaced.
 */
export interface SplatPsnrExclusionNotice {
  type: NotificationType;
  message: string;
}

/**
 * Resolves the image IDs to evaluate for a splat PSNR compute request and the
 * spherical-exclusion facts a caller needs to notify the user exactly once.
 *
 * Spherical (EQUIRECTANGULAR) cameras are filtered out — they have no
 * focal-length intrinsics and cannot be rendered by the pinhole splat pipeline.
 * Filtering here means they never enter the pending queue, so the store is not
 * left with orphaned pending entries.
 *
 * Other non-pinhole cameras (fisheye, etc.) are still passed through so that
 * the existing `assertPinholeCamera` backstop in the WebGPU PSNR session can
 * handle them consistently.
 */
export function getSplatPsnrImageSelection(
  request: SplatPsnrComputeRequest,
  reconstruction: Reconstruction
): SplatPsnrImageSelection {
  if (request.scope === 'selected') {
    const { selectedImageId } = request;
    if (selectedImageId === undefined || selectedImageId === null) {
      return { imageIds: [], excludedSphericalCount: 0, selectedIsSpherical: false };
    }
    const image = reconstruction.images.get(selectedImageId);
    const camera = image ? reconstruction.cameras.get(image.cameraId) : undefined;
    if (camera && !cameraModelHasPinholeIntrinsics(camera.modelId)) {
      // The selected image's camera is spherical — nothing to compute.
      return { imageIds: [], excludedSphericalCount: 0, selectedIsSpherical: true };
    }
    return { imageIds: [selectedImageId], excludedSphericalCount: 0, selectedIsSpherical: false };
  }

  // scope === 'all': exclude images with spherical cameras and count them.
  // Images whose camera cannot be found are kept so that prepareSplatPsnrImage
  // can report the "Missing camera or image" error as usual (not counted as
  // spherical exclusions).
  const imageIds: ImageId[] = [];
  let excludedSphericalCount = 0;
  for (const imageId of reconstruction.images.keys()) {
    const image = reconstruction.images.get(imageId);
    if (!image) continue;
    const camera = reconstruction.cameras.get(image.cameraId);
    if (!camera) {
      imageIds.push(imageId); // missing camera — pass through to existing error handling
      continue;
    }
    if (cameraModelHasPinholeIntrinsics(camera.modelId)) {
      imageIds.push(imageId);
    } else {
      excludedSphericalCount++;
    }
  }
  return { imageIds, excludedSphericalCount, selectedIsSpherical: false };
}

/**
 * Returns the image IDs that should be evaluated by the splat PSNR metric for
 * a given compute request. Thin wrapper over {@link getSplatPsnrImageSelection}
 * kept for callers that only need the IDs.
 */
export function getRequestedSplatPsnrImageIds(
  request: SplatPsnrComputeRequest,
  reconstruction: Reconstruction
): ImageId[] {
  return getSplatPsnrImageSelection(request, reconstruction).imageIds;
}

/** Warning shown when a spherical camera is selected for a PSNR compute. */
export const SPLAT_PSNR_SELECTED_SPHERICAL_MESSAGE =
  'PSNR is not available for spherical cameras. Select a pinhole camera to compute PSNR.';

/**
 * Info shown when some (but not all) images are dropped from a compute-all.
 * The count is per IMAGE (one spherical camera is often shared by many
 * panorama images), so the message must say "image(s)", not "camera(s)".
 */
export function formatSplatPsnrExcludedSphericalMessage(count: number): string {
  return `Skipped ${count} spherical image(s) for PSNR; only pinhole cameras are supported.`;
}

/**
 * Derives the single notification (if any) to surface for a compute action,
 * given its resolved selection. Callers emit this once per user-triggered
 * compute — never per frame or per image.
 */
export function getSplatPsnrExclusionNotice(
  selection: SplatPsnrImageSelection
): SplatPsnrExclusionNotice | null {
  if (selection.selectedIsSpherical) {
    return { type: 'warning', message: SPLAT_PSNR_SELECTED_SPHERICAL_MESSAGE };
  }
  if (selection.excludedSphericalCount > 0) {
    return {
      type: 'info',
      message: formatSplatPsnrExcludedSphericalMessage(selection.excludedSphericalCount),
    };
  }
  return null;
}
