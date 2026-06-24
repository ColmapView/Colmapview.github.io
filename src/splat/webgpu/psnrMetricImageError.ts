/**
 * Lightweight, dependency-free error type for the PSNR metric-image/camera size
 * mismatch. Split out from psnrSplatSession so consumers (e.g. the evaluator)
 * can classify the error without statically importing the heavy, dynamically
 * loaded WebGPU session module.
 */

/** Stable phrase in the mismatch message; used to classify across worker boundaries. */
export const PSNR_METRIC_IMAGE_MISMATCH_MARKER = 'undistorted metric image matching the PINHOLE camera';

/**
 * Thrown when a ground-truth metric image's decoded size doesn't match its
 * PINHOLE camera — i.e. the loaded image set isn't the (undistorted) one the
 * sparse model was built on. Systematic for a whole dataset, so callers can
 * detect it once and skip the remaining images instead of failing (and
 * refetching masks for) every one.
 */
export class PsnrMetricImageDimensionMismatchError extends Error {
  readonly isPsnrMetricImageDimensionMismatch = true as const;
  constructor(message: string) {
    super(message);
    this.name = 'PsnrMetricImageDimensionMismatchError';
  }
}

/**
 * Detect the metric-image/camera size mismatch. Robust to the error losing its
 * class across a worker/structured-clone boundary by also matching the marker
 * flag and the stable message phrase.
 */
export function isPsnrMetricImageDimensionMismatchError(error: unknown): boolean {
  if (error instanceof PsnrMetricImageDimensionMismatchError) {
    return true;
  }
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { isPsnrMetricImageDimensionMismatch?: unknown; message?: unknown };
    if (candidate.isPsnrMetricImageDimensionMismatch === true) {
      return true;
    }
    if (
      typeof candidate.message === 'string'
      && candidate.message.includes(PSNR_METRIC_IMAGE_MISMATCH_MARKER)
    ) {
      return true;
    }
  }
  return false;
}
