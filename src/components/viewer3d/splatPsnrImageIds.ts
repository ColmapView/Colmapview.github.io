import type { ImageId, Reconstruction } from '../../types/colmap';
import type { NotificationType, SplatPsnrComputeRequest } from '../../store';
import { cameraModelSupportsSplatMetric } from '../../splat/splatMetricCapability';

/**
 * The image IDs to evaluate for a splat PSNR compute request, plus the
 * unsupported-camera bookkeeping needed to notify the user.
 *
 * Metric-capable cameras are currently undistorted pinhole cameras. Distorted
 * pinhole, fisheye, and spherical cameras are filtered out here so they never
 * enter the pending queue or reach the session backstop in normal flow.
 */
export interface SplatPsnrImageSelection {
  /** Image IDs that should proceed into the PSNR pipeline. */
  imageIds: ImageId[];
  /**
   * `scope: 'all'` only — how many images were dropped because their camera is
   * unsupported. Zero for `scope: 'selected'` (see `selectedIsUnsupported` instead).
   */
  excludedUnsupportedCount: number;
  /**
   * `scope: 'selected'` only — true when the selected image's camera is
   * unsupported, i.e. the compute would be a silent no-op.
   */
  selectedIsUnsupported: boolean;
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
 * unsupported-camera exclusion facts a caller needs to notify the user exactly once.
 *
 * Metric-capable cameras (undistorted pinhole) are kept; everything else
 * (distorted pinhole, fisheye, spherical) is excluded here so it never enters
 * the pending queue, rather than being passed through to the session backstop.
 */
export function getSplatPsnrImageSelection(
  request: SplatPsnrComputeRequest,
  reconstruction: Reconstruction
): SplatPsnrImageSelection {
  if (request.scope === 'selected') {
    const { selectedImageId } = request;
    if (selectedImageId === undefined || selectedImageId === null) {
      return { imageIds: [], excludedUnsupportedCount: 0, selectedIsUnsupported: false };
    }
    const image = reconstruction.images.get(selectedImageId);
    const camera = image ? reconstruction.cameras.get(image.cameraId) : undefined;
    if (camera && !cameraModelSupportsSplatMetric(camera.modelId)) {
      // The selected image's camera is unsupported, so there is nothing to compute.
      return { imageIds: [], excludedUnsupportedCount: 0, selectedIsUnsupported: true };
    }
    return { imageIds: [selectedImageId], excludedUnsupportedCount: 0, selectedIsUnsupported: false };
  }

  // scope === 'all': exclude images with unsupported cameras and count them.
  // Images whose camera cannot be found are kept so that prepareSplatPsnrImage
  // can report the "Missing camera or image" error as usual (not counted as
  // unsupported exclusions).
  const imageIds: ImageId[] = [];
  let excludedUnsupportedCount = 0;
  for (const imageId of reconstruction.images.keys()) {
    const image = reconstruction.images.get(imageId);
    if (!image) continue;
    const camera = reconstruction.cameras.get(image.cameraId);
    if (!camera) {
      imageIds.push(imageId); // missing camera — pass through to existing error handling
      continue;
    }
    if (cameraModelSupportsSplatMetric(camera.modelId)) {
      imageIds.push(imageId);
    } else {
      excludedUnsupportedCount++;
    }
  }
  return { imageIds, excludedUnsupportedCount, selectedIsUnsupported: false };
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

/** Warning shown when an unsupported camera model is selected for a PSNR compute. */
export const SPLAT_PSNR_SELECTED_UNSUPPORTED_MESSAGE =
  'PSNR is not available for this camera model. Select an undistorted pinhole camera to compute PSNR.';

/**
 * Info shown when some (but not all) images are dropped from a compute-all.
 * The count is per IMAGE, so the message must say "image(s)", not "camera(s)".
 */
export function formatSplatPsnrExcludedUnsupportedMessage(count: number): string {
  return `Skipped ${count} unsupported image(s) for PSNR; only undistorted pinhole cameras are supported.`;
}

/**
 * Derives the single notification (if any) to surface for a compute action,
 * given its resolved selection. Callers emit this once per user-triggered
 * compute — never per frame or per image.
 */
export function getSplatPsnrExclusionNotice(
  selection: SplatPsnrImageSelection
): SplatPsnrExclusionNotice | null {
  if (selection.selectedIsUnsupported) {
    return { type: 'warning', message: SPLAT_PSNR_SELECTED_UNSUPPORTED_MESSAGE };
  }
  if (selection.excludedUnsupportedCount > 0) {
    return {
      type: 'info',
      message: formatSplatPsnrExcludedUnsupportedMessage(selection.excludedUnsupportedCount),
    };
  }
  return null;
}
