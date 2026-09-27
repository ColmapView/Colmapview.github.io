import type { Camera, Image, ImageId, Reconstruction } from '../../types/colmap';
import type { Sim3dEuler } from '../../types/sim3d';
import type { DatasetManager } from '../../dataset';
import type { DatasetState } from '../../dataset/types';
import type { ImageMetricsState, NotificationState, SplatPsnrComputeRequest } from '../../store';
import { appLogger } from '../../utils/logger';
import { composeSim3d, createSim3dFromEuler, isIdentityEuler, sim3dToEuler } from '../../utils/sim3dTransforms';
import { getWebGpuSplatDefaultBackgroundColor } from '../webgpu/splatRenderBackground';
import { isPsnrMetricImageDimensionMismatchError } from '../webgpu/psnrMetricImageError';
import { getSplatPsnrRenderSize, type PsnrResult } from './psnrTypes';

export type SplatPsnrDatasetIdentity = Pick<DatasetState,
  'sourceType' | 'imageUrlBase' | 'maskUrlBase' | 'loadedFiles'>;

export interface SplatPsnrRenderSession {
  computeImageMetric: (options: {
    imageFile: File;
    maskFile?: File | null;
    image: Image;
    camera: Camera;
    width: number;
    height: number;
    transform?: Sim3dEuler;
    modelTransform?: Sim3dEuler;
  }) => Promise<PsnrResult>;
  submitImageMetric?: (options: {
    imageFile: File;
    maskFile?: File | null;
    image: Image;
    camera: Camera;
    width: number;
    height: number;
    transform?: Sim3dEuler;
    modelTransform?: Sim3dEuler;
  }) => Promise<SplatPsnrSubmittedMetric>;
  dispose: () => void;
}

interface SplatPsnrSubmittedMetric {
  result: Promise<PsnrResult>;
  dispose: () => void;
}

export interface SplatPsnrTaskControl {
  requestId: number;
  dataIdentity: SplatPsnrDataIdentity;
  cancelled: boolean;
  mediaController: AbortController;
  renderSession: SplatPsnrRenderSession | null;
  /**
   * Set once a metric-image/camera size mismatch is seen. The mismatch is
   * systematic for the whole dataset, so the remaining images are skipped
   * instead of failing (and refetching masks for) every one.
   */
  metricImagesIncompatible: boolean;
}

export interface SplatPsnrTaskActions {
  setSplatPsnrPending: ImageMetricsState['setSplatPsnrPending'];
  setSplatPsnrComputingImage: ImageMetricsState['setSplatPsnrComputingImage'];
  setSplatPsnrMetric: ImageMetricsState['setSplatPsnrMetric'];
  setSplatPsnrMetrics: ImageMetricsState['setSplatPsnrMetrics'];
  setSplatPsnrImageError: ImageMetricsState['setSplatPsnrImageError'];
  finishSplatPsnrCompute: ImageMetricsState['finishSplatPsnrCompute'];
}

export interface SplatPsnrTaskSnapshot {
  imageIds: ImageId[];
  onImageReady: (image: Image, file: File, shouldCancel: () => boolean) => void;
  reconstruction: Reconstruction;
  dataset: DatasetManager;
  splatFile: File;
  request: SplatPsnrComputeRequest;
  transform: Sim3dEuler;
  splatTransform: Sim3dEuler;
  actions: SplatPsnrTaskActions;
  getRenderSession: (dataIdentity: SplatPsnrDataIdentity, splatFile: File) => Promise<SplatPsnrRenderSession>;
  releaseRenderSession: (renderSession: SplatPsnrRenderSession) => void;
}

export interface SplatPsnrDataIdentity {
  reconstruction: Reconstruction;
  dataset: SplatPsnrDatasetIdentity;
  splatFile: File;
}

const MAX_IN_FLIGHT_ALL_IMAGE_PSNR = 2;

const ALL_IMAGE_PSNR_METRIC_BATCH_SIZE = 16;

const ALL_IMAGE_PSNR_METRIC_FLUSH_DELAY_MS = 32;

function getSplatModelTransform(
  transform: Sim3dEuler,
  splatTransform: Sim3dEuler
): Sim3dEuler | undefined {
  const hasTransform = !isIdentityEuler(transform);
  const hasSplatTransform = !isIdentityEuler(splatTransform);
  if (!hasTransform && !hasSplatTransform) return undefined;
  if (!hasTransform) return splatTransform;
  if (!hasSplatTransform) return transform;
  return sim3dToEuler(composeSim3d(
    createSim3dFromEuler(transform),
    createSim3dFromEuler(splatTransform)
  ));
}

export function getSplatPsnrDataIdentity(snapshot: {
  reconstruction: Reconstruction;
  datasetIdentity: SplatPsnrDatasetIdentity;
  splatFile: File;
}): SplatPsnrDataIdentity {
  return {
    reconstruction: snapshot.reconstruction,
    dataset: snapshot.datasetIdentity,
    splatFile: snapshot.splatFile,
  };
}

export function getSplatPsnrDataIdentityMismatchReason(
  a: SplatPsnrDataIdentity,
  b: SplatPsnrDataIdentity
): string | null {
  if (a.reconstruction !== b.reconstruction) return 'reconstruction changed';
  if (a.dataset.sourceType !== b.dataset.sourceType) return 'dataset source type changed';
  if (a.dataset.imageUrlBase !== b.dataset.imageUrlBase) return 'dataset image base changed';
  if (a.dataset.maskUrlBase !== b.dataset.maskUrlBase) return 'dataset mask base changed';
  if (a.dataset.loadedFiles !== b.dataset.loadedFiles) return 'dataset files changed';
  if (a.splatFile !== b.splatFile) return 'splat file changed';
  return null;
}

export function hasSameSplatPsnrDataIdentity(
  a: SplatPsnrDataIdentity | null,
  b: SplatPsnrDataIdentity
): boolean {
  return Boolean(a && !getSplatPsnrDataIdentityMismatchReason(a, b));
}

/**
 * Interruption notice for cancels the user did not ask for. A silent stop
 * reads as a bug (user report 2026-07-12: applying a scene change mid-run
 * looked like PSNR just died) — every non-replacement cancel surfaces its
 * reason as a persistent warning. Intentional replacements (a new compute
 * request superseding the old one) pass no notice.
 */
interface SplatPsnrInterruptionNotice {
  addNotification: NotificationState['addNotification'];
  reason: string;
}

export function cancelSplatPsnrTask(
  task: SplatPsnrTaskControl,
  actions: SplatPsnrTaskActions,
  finishCompute: boolean,
  releaseRenderSession?: (renderSession: SplatPsnrRenderSession) => void,
  interruption?: SplatPsnrInterruptionNotice
): void {
  const alreadyCancelled = task.cancelled;
  task.cancelled = true;
  task.mediaController.abort();
  const renderSession = task.renderSession;
  task.renderSession = null;
  if (renderSession) {
    if (releaseRenderSession) {
      releaseRenderSession(renderSession);
    } else {
      renderSession.dispose();
    }
  }
  if (finishCompute) {
    actions.finishSplatPsnrCompute();
  }
  // One notice per task: overlapping cancel effects (identity mismatch +
  // request clear both fire on a reconstruction swap) must not double-toast.
  if (interruption && !alreadyCancelled) {
    interruption.addNotification('warning', `PSNR computation stopped: ${interruption.reason}`);
  }
}

function publishSplatPsnrMetric({
  imageId,
  metric,
  width,
  height,
  setSplatPsnrMetric,
  setSplatPsnrImageError,
}: {
  imageId: ImageId;
  metric: PsnrResult;
  width: number;
  height: number;
  setSplatPsnrMetric: ImageMetricsState['setSplatPsnrMetric'];
  setSplatPsnrImageError: ImageMetricsState['setSplatPsnrImageError'];
}): void {
  const storeMetric = createSplatPsnrStoreMetric({
    imageId,
    metric,
    width,
    height,
    setSplatPsnrImageError,
  });
  if (!storeMetric) {
    return;
  }

  setSplatPsnrMetric(storeMetric);
}

function createSplatPsnrStoreMetric({
  imageId,
  metric,
  width,
  height,
  setSplatPsnrImageError,
}: {
  imageId: ImageId;
  metric: PsnrResult;
  width: number;
  height: number;
  setSplatPsnrImageError: ImageMetricsState['setSplatPsnrImageError'];
}): Parameters<ImageMetricsState['setSplatPsnrMetric']>[0] | null {
  if (!Number.isFinite(metric.psnr) && metric.psnr !== Infinity) {
    setSplatPsnrImageError(imageId, 'No valid ground truth pixels');
    return null;
  }

  return {
    imageId,
    psnr: metric.psnr,
    ssim: metric.ssim,
    mse: metric.mse,
    validPixelCount: metric.validPixelCount,
    width,
    height,
    computedAt: Date.now(),
    renderBackground: {
      label: 'opaque-black',
      rgba: getWebGpuSplatDefaultBackgroundColor(),
    },
  };
}

interface PreparedSplatPsnrImage {
  imageId: ImageId;
  image: Image;
  camera: Camera;
  imageFile: File;
  maskFile: File | null;
  width: number;
  height: number;
}

async function prepareSplatPsnrImage(
  task: SplatPsnrTaskControl,
  snapshot: SplatPsnrTaskSnapshot,
  imageId: ImageId,
  options: { markComputing?: boolean } = {}
): Promise<PreparedSplatPsnrImage | null> {
  const {
    reconstruction,
    dataset,
    actions: {
      setSplatPsnrComputingImage,
      setSplatPsnrImageError,
    },
  } = snapshot;
  if (task.cancelled) return null;

  const image = reconstruction.images.get(imageId);
  const camera = image ? reconstruction.cameras.get(image.cameraId) : null;
  if (!image || !camera) {
    setSplatPsnrImageError(imageId, 'Missing camera or image');
    return null;
  }

  if (options.markComputing ?? true) {
    setSplatPsnrComputingImage(imageId);
  }
  let imageFailure: string | undefined;
  const imageFile = await dataset.getMetricImage(image.name, {
    signal: task.mediaController.signal, priority: 'metric', onError: error => { imageFailure = error.message; },
  });
  if (task.cancelled) return null;
  if (!imageFile) {
    setSplatPsnrImageError(imageId, imageFailure ?? 'Missing image file');
    return null;
  }
  let maskFailure: string | undefined;
  const maskFile = dataset.hasMasks() ? await dataset.getMask(image.name, {
    signal: task.mediaController.signal, priority: 'metric', onError: error => { maskFailure = error.message; },
  }) : null;
  if (task.cancelled) return null;
  if (maskFailure) {
    setSplatPsnrImageError(imageId, `Mask unavailable: ${maskFailure}`);
    return null;
  }
  snapshot.onImageReady(image, imageFile, () => task.cancelled);

  const size = getSplatPsnrRenderSize(camera);
  if (size.width <= 0 || size.height <= 0) {
    setSplatPsnrImageError(imageId, 'Invalid render size');
    return null;
  }

  return {
    imageId,
    image,
    camera,
    imageFile,
    maskFile,
    width: size.width,
    height: size.height,
  };
}

const SPLAT_PSNR_INCOMPATIBLE_METRIC_IMAGES_MESSAGE =
  'Ground-truth images do not match the sparse model resolution; PSNR is unavailable for this dataset.';

/**
 * Handle a per-image PSNR compute failure. A metric-image/camera size mismatch
 * is systematic for the whole dataset, so the first occurrence flips a task flag
 * and logs a single summary; callers then skip the remaining images. Every other
 * failure keeps its per-image warning.
 */
function handleSplatPsnrComputeError(
  task: SplatPsnrTaskControl,
  imageId: ImageId,
  error: unknown,
  setSplatPsnrImageError: ImageMetricsState['setSplatPsnrImageError']
): void {
  const message = error instanceof Error ? error.message : String(error);
  setSplatPsnrImageError(imageId, message);
  if (isPsnrMetricImageDimensionMismatchError(error)) {
    if (!task.metricImagesIncompatible) {
      task.metricImagesIncompatible = true;
      appLogger.warn(
        `[PSNR] ${SPLAT_PSNR_INCOMPATIBLE_METRIC_IMAGES_MESSAGE} Skipping the remaining images. (${message})`
      );
    }
    return;
  }
  appLogger.warn(`[PSNR] Failed to compute image ${imageId}: ${message}`);
}

/** Mark an image skipped because the dataset's metric images are incompatible. */
function skipSplatPsnrImageAsIncompatible(
  imageId: ImageId,
  setSplatPsnrImageError: ImageMetricsState['setSplatPsnrImageError']
): void {
  setSplatPsnrImageError(imageId, SPLAT_PSNR_INCOMPATIBLE_METRIC_IMAGES_MESSAGE);
}

export async function runSplatPsnrTask(
  task: SplatPsnrTaskControl,
  snapshot: SplatPsnrTaskSnapshot,
  finishTask: (task: SplatPsnrTaskControl) => void
): Promise<void> {
  const {
    splatFile,
    request,
    transform,
    splatTransform,
    actions: {
      setSplatPsnrPending,
      setSplatPsnrMetric,
      setSplatPsnrImageError,
    },
  } = snapshot;
  const imageIds = snapshot.imageIds;
  const modelTransform = getSplatModelTransform(transform, splatTransform);

  try {
    if (imageIds.length === 0) {
      return;
    }

    setSplatPsnrPending(imageIds);
    task.renderSession = await snapshot.getRenderSession(task.dataIdentity, splatFile);
    if (task.cancelled) {
      snapshot.releaseRenderSession(task.renderSession);
      task.renderSession = null;
      return;
    }

    if (request.scope === 'all' && task.renderSession.submitImageMetric) {
      await runBatchedAllImageSplatPsnrTask(task, snapshot, imageIds);
      return;
    }

    for (const imageId of imageIds) {
      if (task.cancelled) return;
      if (task.metricImagesIncompatible) {
        skipSplatPsnrImageAsIncompatible(imageId, setSplatPsnrImageError);
        continue;
      }

      try {
        const prepared = await prepareSplatPsnrImage(task, snapshot, imageId);
        if (!prepared) {
          continue;
        }

        const metric = await task.renderSession.computeImageMetric({
          imageFile: prepared.imageFile,
          maskFile: prepared.maskFile,
          image: prepared.image,
          camera: prepared.camera,
          width: prepared.width,
          height: prepared.height,
          transform,
          modelTransform,
        });
        if (task.cancelled) return;

        publishSplatPsnrMetric({
          imageId,
          metric,
          width: prepared.width,
          height: prepared.height,
          setSplatPsnrMetric,
          setSplatPsnrImageError,
        });
      } catch (error) {
        if (task.cancelled) return;
        handleSplatPsnrComputeError(task, imageId, error, setSplatPsnrImageError);
      }
    }
  } catch (error) {
    if (!task.cancelled) {
      const message = error instanceof Error ? error.message : String(error);
      appLogger.warn(`[PSNR] Failed to initialize isolated renderer: ${message}`);
      for (const imageId of imageIds) {
        setSplatPsnrImageError(imageId, message);
      }
    }
  } finally {
    task.renderSession = null;
    finishTask(task);
  }
}

async function runBatchedAllImageSplatPsnrTask(
  task: SplatPsnrTaskControl,
  snapshot: SplatPsnrTaskSnapshot,
  imageIds: ImageId[]
): Promise<void> {
  const renderSession = task.renderSession;
  if (!renderSession?.submitImageMetric) return;

  const {
    transform,
    splatTransform,
    actions: {
      setSplatPsnrMetrics,
      setSplatPsnrImageError,
    },
  } = snapshot;
  const modelTransform = getSplatModelTransform(transform, splatTransform);
  const inFlight = new Set<Promise<void>>();
  const metricBatcher = createAllImageSplatPsnrMetricBatcher({
    task,
    setSplatPsnrMetrics,
  });
  let nextIndex = 0;

  const startNext = async (): Promise<boolean> => {
    while (nextIndex < imageIds.length && !task.cancelled) {
      const imageId = imageIds[nextIndex++];
      if (task.metricImagesIncompatible) {
        skipSplatPsnrImageAsIncompatible(imageId, setSplatPsnrImageError);
        continue;
      }
      try {
        const prepared = await prepareSplatPsnrImage(task, snapshot, imageId, {
          markComputing: false,
        });
        if (!prepared) {
          continue;
        }

        const submitted = await renderSession.submitImageMetric?.({
          imageFile: prepared.imageFile,
          maskFile: prepared.maskFile,
          image: prepared.image,
          camera: prepared.camera,
          width: prepared.width,
          height: prepared.height,
          transform,
          modelTransform,
        });
        if (!submitted) {
          return false;
        }
        if (task.cancelled) {
          submitted.dispose();
          return false;
        }

        const completion = submitted.result
          .then((metric) => {
            if (task.cancelled) return;
            const storeMetric = createSplatPsnrStoreMetric({
              imageId,
              metric,
              width: prepared.width,
              height: prepared.height,
              setSplatPsnrImageError,
            });
            if (storeMetric) {
              metricBatcher.enqueue(storeMetric);
            }
          })
          .catch((error: unknown) => {
            if (task.cancelled) return;
            handleSplatPsnrComputeError(task, imageId, error, setSplatPsnrImageError);
          })
          .finally(() => {
            submitted.dispose();
            inFlight.delete(completion);
          });
        inFlight.add(completion);
        return true;
      } catch (error) {
        if (task.cancelled) return false;
        handleSplatPsnrComputeError(task, imageId, error, setSplatPsnrImageError);
      }
    }

    return false;
  };

  try {
    while (inFlight.size < MAX_IN_FLIGHT_ALL_IMAGE_PSNR && await startNext()) {
      // Fill the initial pipeline window.
    }

    while (inFlight.size > 0 && !task.cancelled) {
      await Promise.race(inFlight);
      while (inFlight.size < MAX_IN_FLIGHT_ALL_IMAGE_PSNR && await startNext()) {
        // Keep the pipeline window full until all images are scheduled.
      }
    }
  } finally {
    metricBatcher.dispose();
  }
}

function createAllImageSplatPsnrMetricBatcher({
  task,
  setSplatPsnrMetrics,
}: {
  task: SplatPsnrTaskControl;
  setSplatPsnrMetrics: ImageMetricsState['setSplatPsnrMetrics'];
}) {
  const pending: Parameters<ImageMetricsState['setSplatPsnrMetrics']>[0] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const clearFlushTimer = () => {
    if (!flushTimer) return;
    clearTimeout(flushTimer);
    flushTimer = null;
  };

  const flush = () => {
    clearFlushTimer();
    if (task.cancelled || pending.length === 0) {
      pending.length = 0;
      return;
    }

    setSplatPsnrMetrics(pending.splice(0, pending.length));
  };

  return {
    enqueue(metric: Parameters<ImageMetricsState['setSplatPsnrMetric']>[0]): void {
      if (task.cancelled) return;
      pending.push(metric);
      if (pending.length >= ALL_IMAGE_PSNR_METRIC_BATCH_SIZE) {
        flush();
        return;
      }
      flushTimer ??= setTimeout(flush, ALL_IMAGE_PSNR_METRIC_FLUSH_DELAY_MS);
    },
    dispose(): void {
      flush();
    },
  };
}
