import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Camera, Image, ImageId, Reconstruction } from '../../types/colmap';
import type { Sim3dEuler } from '../../types/sim3d';
import type { DatasetManager } from '../../dataset';
import type { ImageMetricsState, SplatPsnrComputeRequest, SplatPsnrMetricDiagnostics } from '../../store';
import { prefetchFrustumTexturesInBackground } from '../../hooks/useFrustumTexture';
import { useLatestRef } from '../../hooks/useLatestRef';
import { appLogger } from '../../utils/logger';
import {
  ensureSplatPsnrWebGpuDevice,
  getSplatPsnrRenderSize,
  subscribeSplatPsnrWebGpuDeviceLoss,
  type PsnrResult,
} from './splatPsnrRuntime';
import {
  useSplatPsnrEvaluatorStoreFacade,
  type SplatPsnrDatasetIdentity,
} from './SplatPsnrEvaluatorStoreFacade';
import { getWebGpuSplatRequiredLimitsForCloud } from '../../splat/webgpu/webGpuSplatLimits';
import { getWebGpuSplatDefaultBackgroundColor } from '../../splat/webgpu/splatRenderBackground';

interface SplatPsnrRenderSession {
  computeImageMetric: (options: {
    imageFile: File;
    image: Image;
    camera: Camera;
    width: number;
    height: number;
    transform?: Sim3dEuler;
    includeDiagnostics?: boolean;
  }) => Promise<PsnrResult>;
  submitImageMetric?: (options: {
    imageFile: File;
    image: Image;
    camera: Camera;
    width: number;
    height: number;
    transform?: Sim3dEuler;
    includeDiagnostics?: boolean;
  }) => Promise<SplatPsnrSubmittedMetric>;
  dispose: () => void;
}

interface SplatPsnrSubmittedMetric {
  result: Promise<PsnrResult>;
  dispose: () => void;
}

interface SplatPsnrTaskControl {
  requestId: number;
  dataIdentity: SplatPsnrDataIdentity;
  cancelled: boolean;
  renderSession: SplatPsnrRenderSession | null;
}

interface SplatPsnrTaskActions {
  setSplatPsnrPending: ImageMetricsState['setSplatPsnrPending'];
  setSplatPsnrComputingImage: ImageMetricsState['setSplatPsnrComputingImage'];
  setSplatPsnrMetric: ImageMetricsState['setSplatPsnrMetric'];
  setSplatPsnrMetrics: ImageMetricsState['setSplatPsnrMetrics'];
  setSplatPsnrImageError: ImageMetricsState['setSplatPsnrImageError'];
  finishSplatPsnrCompute: ImageMetricsState['finishSplatPsnrCompute'];
}

interface SplatPsnrTaskSnapshot {
  reconstruction: Reconstruction;
  dataset: DatasetManager;
  splatFile: File;
  request: SplatPsnrComputeRequest;
  transform: Sim3dEuler;
  actions: SplatPsnrTaskActions;
  getRenderSession: (dataIdentity: SplatPsnrDataIdentity, splatFile: File) => Promise<SplatPsnrRenderSession>;
  releaseRenderSession: (renderSession: SplatPsnrRenderSession) => void;
}

interface SplatPsnrDataIdentity {
  reconstruction: Reconstruction;
  dataset: SplatPsnrDatasetIdentity;
  splatFile: File;
}

interface SplatPsnrEvaluatorSnapshot {
  reconstruction: Reconstruction | null;
  dataset: DatasetManager;
  datasetIdentity: SplatPsnrDatasetIdentity;
  splatFile?: File;
  splatPsnrFrameReady: boolean;
  splatPsnrComputeRequest: SplatPsnrComputeRequest | null;
  transform: Sim3dEuler;
  actions: SplatPsnrTaskActions;
  releaseRenderSession: (renderSession: SplatPsnrRenderSession) => void;
}

interface SplatPsnrRenderSessionCache {
  dataIdentity: SplatPsnrDataIdentity;
  renderSession: SplatPsnrRenderSession;
}

const MAX_IN_FLIGHT_ALL_IMAGE_PSNR = 2;
const LOW_PSNR_DIAGNOSTIC_THRESHOLD_DB = 20;
const ALL_IMAGE_PSNR_METRIC_BATCH_SIZE = 16;
const ALL_IMAGE_PSNR_METRIC_FLUSH_DELAY_MS = 32;
const BACKGROUND_PSNR_START_DELAY_MS = 250;
const BACKGROUND_IMAGE_PLANE_TEXTURE_COLLECT_BATCH_SIZE = 32;

function getSplatPsnrDataIdentity(snapshot: {
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

function getSplatPsnrDataIdentityMismatchReason(
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

function hasSameSplatPsnrDataIdentity(
  a: SplatPsnrDataIdentity | null,
  b: SplatPsnrDataIdentity
): boolean {
  return Boolean(a && !getSplatPsnrDataIdentityMismatchReason(a, b));
}

function cancelSplatPsnrTask(
  task: SplatPsnrTaskControl,
  actions: SplatPsnrTaskActions,
  finishCompute: boolean,
  releaseRenderSession?: (renderSession: SplatPsnrRenderSession) => void
): void {
  task.cancelled = true;
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
}

function getWebGpuDeviceLostMessage(info: GPUDeviceLostInfo): string {
  const detail = info.message || info.reason;
  return detail
    ? `WebGPU PSNR device was lost: ${detail}`
    : 'WebGPU PSNR device was lost';
}

async function createSplatPsnrRenderSession({
  splatFile,
}: {
  splatFile: File;
}): Promise<SplatPsnrRenderSession> {
  const [
    { loadGaussianCloudFromFile },
    { createWebGpuSplatPsnrSession },
  ] = await Promise.all([
    import('../../splat/gaussianCloudLoader'),
    import('../../splat/webgpu/psnrSplatSession'),
  ]);
  const loadedCloud = await loadGaussianCloudFromFile(splatFile);
  const device = await ensureSplatPsnrWebGpuDevice(getWebGpuSplatRequiredLimitsForCloud(loadedCloud.cloud));
  return createWebGpuSplatPsnrSession({ device, splatFile, loadedCloud });
}

function getRequestedSplatPsnrImageIds(
  request: SplatPsnrComputeRequest,
  reconstruction: Reconstruction
): ImageId[] {
  if (request.scope === 'selected') {
    return request.selectedImageId !== undefined && request.selectedImageId !== null
      ? [request.selectedImageId]
      : [];
  }

  return Array.from(reconstruction.images.keys());
}

function publishSplatPsnrMetric({
  imageId,
  image,
  camera,
  metric,
  width,
  height,
  setSplatPsnrMetric,
  setSplatPsnrImageError,
}: {
  imageId: ImageId;
  image: Image;
  camera: Camera;
  metric: PsnrResult;
  width: number;
  height: number;
  setSplatPsnrMetric: ImageMetricsState['setSplatPsnrMetric'];
  setSplatPsnrImageError: ImageMetricsState['setSplatPsnrImageError'];
}): void {
  const storeMetric = createSplatPsnrStoreMetric({
    imageId,
    image,
    camera,
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
  image,
  camera,
  metric,
  width,
  height,
  setSplatPsnrImageError,
}: {
  imageId: ImageId;
  image: Image;
  camera: Camera;
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
    mse: metric.mse,
    validPixelCount: metric.validPixelCount,
    width,
    height,
    computedAt: Date.now(),
    renderBackground: {
      label: 'opaque-black',
      rgba: getWebGpuSplatDefaultBackgroundColor(),
    },
    diagnostics: createSplatPsnrMetricDiagnostics({
      image,
      camera,
      metric,
      width,
      height,
    }),
  };
}

function createSplatPsnrMetricDiagnostics({
  image,
  camera,
  metric,
  width,
  height,
}: {
  image: Image;
  camera: Camera;
  metric: PsnrResult;
  width: number;
  height: number;
}): SplatPsnrMetricDiagnostics | undefined {
  if (!metric.colorDiagnostics) {
    return undefined;
  }

  return {
    lowPsnrThresholdDb: LOW_PSNR_DIAGNOSTIC_THRESHOLD_DB,
    validPixelRatio: metric.colorDiagnostics.validPixelRatio,
    renderedMeanRgb: metric.colorDiagnostics.renderedMeanRgb,
    groundTruthMeanRgb: metric.colorDiagnostics.groundTruthMeanRgb,
    meanRgbDelta: metric.colorDiagnostics.meanRgbDelta,
    bestOffset: metric.offsetDiagnostics
      ? {
          maxOffsetPixels: metric.offsetDiagnostics.maxOffsetPixels,
          evaluatedOffsetCount: metric.offsetDiagnostics.evaluatedOffsetCount,
          dx: metric.offsetDiagnostics.best.dx,
          dy: metric.offsetDiagnostics.best.dy,
          psnr: metric.offsetDiagnostics.best.psnr,
          mse: metric.offsetDiagnostics.best.mse,
          validPixelCount: metric.offsetDiagnostics.best.validPixelCount,
          improvementDb: metric.offsetDiagnostics.improvementDb,
        }
      : undefined,
    backgroundDiagnostics: metric.backgroundDiagnostics,
    backgroundMismatch: classifySplatPsnrBackgroundMismatch(metric.colorDiagnostics),
    renderSize: {
      width,
      height,
    },
    sourceImageSize: {
      width: camera.width,
      height: camera.height,
    },
    cameraId: camera.cameraId,
    cameraModelId: camera.modelId,
    imageName: image.name,
  };
}

function classifySplatPsnrBackgroundMismatch(
  diagnostics: NonNullable<PsnrResult['colorDiagnostics']>
): SplatPsnrMetricDiagnostics['backgroundMismatch'] {
  const delta = diagnostics.meanRgbDelta;
  if (!delta) {
    return {
      classification: 'unknown',
      reason: 'No valid ground-truth pixels were available for RGB diagnostics.',
    };
  }

  if (diagnostics.validPixelRatio < 0.8) {
    return {
      classification: 'unknown',
      reason: 'Valid-pixel coverage is too low for a reliable background classification.',
    };
  }

  const averageAbsDelta = (Math.abs(delta[0]) + Math.abs(delta[1]) + Math.abs(delta[2])) / 3;
  const samePositiveShift = delta.every((value) => value >= 15);
  const sameNegativeShift = delta.every((value) => value <= -15);
  if ((samePositiveShift || sameNegativeShift) && averageAbsDelta >= 15) {
    return {
      classification: 'possible',
      reason: 'Mean RGB shifts in the same direction across channels, consistent with a broad background or exposure mismatch.',
    };
  }

  return {
    classification: 'unlikely',
    reason: 'Mean RGB deltas are not a broad same-direction shift.',
  };
}

interface PreparedSplatPsnrImage {
  imageId: ImageId;
  image: Image;
  camera: Camera;
  imageFile: File;
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
  const imageFile = await dataset.getMetricImage(image.name);
  if (task.cancelled) return null;
  if (!imageFile) {
    setSplatPsnrImageError(imageId, 'Missing image file');
    return null;
  }
  warmSplatPsnrImagePlaneTexture({
    image,
    imageFile,
    shouldCancel: () => task.cancelled,
  });

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
    width: size.width,
    height: size.height,
  };
}

function warmSplatPsnrImagePlaneTexture({
  image,
  imageFile,
  shouldCancel,
}: {
  image: Image;
  imageFile: File;
  shouldCancel: () => boolean;
}): void {
  void prefetchFrustumTexturesInBackground(
    [{ file: imageFile, name: image.name }],
    { batchSize: 1, shouldCancel }
  ).catch((error: unknown) => {
    if (shouldCancel()) return;
    const message = error instanceof Error ? error.message : String(error);
    appLogger.warn(`[PSNR] Failed to warm image-plane texture for ${image.name}: ${message}`);
  });
}

async function runSplatPsnrTask(
  task: SplatPsnrTaskControl,
  snapshot: SplatPsnrTaskSnapshot,
  finishTask: (task: SplatPsnrTaskControl) => void
): Promise<void> {
  const {
    reconstruction,
    splatFile,
    request,
    transform,
    actions: {
      setSplatPsnrPending,
      setSplatPsnrMetric,
      setSplatPsnrImageError,
    },
  } = snapshot;
  const imageIds = getRequestedSplatPsnrImageIds(request, reconstruction);

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

      try {
        const prepared = await prepareSplatPsnrImage(task, snapshot, imageId);
        if (!prepared) {
          continue;
        }

        const metric = await task.renderSession.computeImageMetric({
          imageFile: prepared.imageFile,
          image: prepared.image,
          camera: prepared.camera,
          width: prepared.width,
          height: prepared.height,
          transform,
          includeDiagnostics: request.scope === 'selected',
        });
        if (task.cancelled) return;

        publishSplatPsnrMetric({
          imageId,
          image: prepared.image,
          camera: prepared.camera,
          metric,
          width: prepared.width,
          height: prepared.height,
          setSplatPsnrMetric,
          setSplatPsnrImageError,
        });
      } catch (error) {
        if (task.cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        appLogger.warn(`[PSNR] Failed to compute image ${imageId}: ${message}`);
        setSplatPsnrImageError(imageId, message);
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
    actions: {
      setSplatPsnrMetrics,
      setSplatPsnrImageError,
    },
  } = snapshot;
  const inFlight = new Set<Promise<void>>();
  const metricBatcher = createAllImageSplatPsnrMetricBatcher({
    task,
    setSplatPsnrMetrics,
  });
  let nextIndex = 0;

  const startNext = async (): Promise<boolean> => {
    while (nextIndex < imageIds.length && !task.cancelled) {
      const imageId = imageIds[nextIndex++];
      try {
        const prepared = await prepareSplatPsnrImage(task, snapshot, imageId, {
          markComputing: false,
        });
        if (!prepared) {
          continue;
        }

        const submitted = await renderSession.submitImageMetric?.({
          imageFile: prepared.imageFile,
          image: prepared.image,
          camera: prepared.camera,
          width: prepared.width,
          height: prepared.height,
          transform,
          includeDiagnostics: false,
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
              image: prepared.image,
              camera: prepared.camera,
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
            const message = error instanceof Error ? error.message : String(error);
            appLogger.warn(`[PSNR] Failed to compute image ${imageId}: ${message}`);
            setSplatPsnrImageError(imageId, message);
          })
          .finally(() => {
            submitted.dispose();
            inFlight.delete(completion);
          });
        inFlight.add(completion);
        return true;
      } catch (error) {
        if (task.cancelled) return false;
        const message = error instanceof Error ? error.message : String(error);
        appLogger.warn(`[PSNR] Failed to compute image ${imageId}: ${message}`);
        setSplatPsnrImageError(imageId, message);
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

async function prefetchSplatPsnrImagePlaneTextures({
  reconstruction,
  dataset,
  shouldCancel,
}: {
  reconstruction: Reconstruction;
  dataset: DatasetManager;
  shouldCancel: () => boolean;
}): Promise<void> {
  let batch: Array<{ file: File; name: string }> = [];

  const flushBatch = async () => {
    if (batch.length === 0 || shouldCancel()) {
      batch = [];
      return;
    }
    const nextBatch = batch;
    batch = [];
    await prefetchFrustumTexturesInBackground(nextBatch, { shouldCancel });
  };

  for (const image of reconstruction.images.values()) {
    if (shouldCancel()) {
      return;
    }

    const cachedImageFile = typeof dataset.getImageSync === 'function'
      ? dataset.getImageSync(image.name)
      : undefined;
    const displayImageFile = cachedImageFile ?? (
      typeof dataset.getImage === 'function'
        ? await dataset.getImage(image.name)
        : null
    );
    const imageFile = displayImageFile ?? await dataset.getMetricImage(image.name);
    if (shouldCancel()) {
      return;
    }
    if (!imageFile) {
      continue;
    }

    batch.push({ file: imageFile, name: image.name });
    if (batch.length >= BACKGROUND_IMAGE_PLANE_TEXTURE_COLLECT_BATCH_SIZE) {
      await flushBatch();
    }
  }

  await flushBatch();
}

export function SplatPsnrEvaluator() {
  const {
    data: {
      reconstruction,
      dataset,
      datasetIdentity,
      splatFile,
      splatPsnrFrameReady,
      splatPsnrComputeRequest,
      splatMetricCapability,
      transform,
    },
    actions: {
      setWebGpuMetricState,
      setSplatPsnrFrameReady,
      setSplatPsnrPending,
      setSplatPsnrComputingImage,
      setSplatPsnrMetric,
      setSplatPsnrMetrics,
      setSplatPsnrImageError,
      requestSplatPsnrCompute,
      finishSplatPsnrCompute,
    },
  } = useSplatPsnrEvaluatorStoreFacade();
  const lastHandledRequestRef = useRef(0);
  const activeTaskRef = useRef<SplatPsnrTaskControl | null>(null);
  const cachedRenderSessionRef = useRef<SplatPsnrRenderSessionCache | null>(null);
  const autoPsnrDataIdentityRef = useRef<SplatPsnrDataIdentity | null>(null);
  const imagePlaneTexturePrefetchIdentityRef = useRef<SplatPsnrDataIdentity | null>(null);
  const imagePlaneTexturePrefetchRunRef = useRef(0);
  const gpuPsnrAvailable = splatMetricCapability.gpuPsnr;
  const currentActions = useMemo<SplatPsnrTaskActions>(() => ({
    setSplatPsnrPending,
    setSplatPsnrComputingImage,
    setSplatPsnrMetric,
    setSplatPsnrMetrics,
    setSplatPsnrImageError,
    finishSplatPsnrCompute,
  }), [
    finishSplatPsnrCompute,
    setSplatPsnrComputingImage,
    setSplatPsnrImageError,
    setSplatPsnrMetric,
    setSplatPsnrMetrics,
    setSplatPsnrPending,
  ]);

  const releaseCachedRenderSession = useCallback((renderSession?: SplatPsnrRenderSession | null) => {
    const cached = cachedRenderSessionRef.current;
    if (cached && (!renderSession || cached.renderSession === renderSession)) {
      cached.renderSession.dispose();
      cachedRenderSessionRef.current = null;
      return;
    }

    renderSession?.dispose();
  }, []);

  const getCachedRenderSession = useCallback(async (
    dataIdentity: SplatPsnrDataIdentity,
    nextSplatFile: File
  ) => {
    const cached = cachedRenderSessionRef.current;
    if (cached && !getSplatPsnrDataIdentityMismatchReason(cached.dataIdentity, dataIdentity)) {
      return cached.renderSession;
    }

    releaseCachedRenderSession();
    const renderSession = await createSplatPsnrRenderSession({ splatFile: nextSplatFile });
    cachedRenderSessionRef.current = {
      dataIdentity,
      renderSession,
    };
    return renderSession;
  }, [releaseCachedRenderSession]);

  const latestSnapshotRef = useLatestRef<SplatPsnrEvaluatorSnapshot | null>({
    reconstruction,
    dataset,
    datasetIdentity,
    splatFile,
    splatPsnrFrameReady,
    splatPsnrComputeRequest,
    transform,
    actions: currentActions,
    releaseRenderSession: releaseCachedRenderSession,
  });

  const requestId = splatPsnrComputeRequest?.id ?? 0;
  const featureReady = Boolean(reconstruction && splatFile && splatPsnrFrameReady && gpuPsnrAvailable);

  useEffect(() => {
    const unsubscribe = subscribeSplatPsnrWebGpuDeviceLoss((info) => {
      const reason = getWebGpuDeviceLostMessage(info);
      setWebGpuMetricState('failed', reason);
      const task = activeTaskRef.current;
      const snapshot = latestSnapshotRef.current;
      if (task && snapshot) {
        cancelSplatPsnrTask(task, snapshot.actions, true, snapshot.releaseRenderSession);
        activeTaskRef.current = null;
      }
      releaseCachedRenderSession();
    });

    return unsubscribe;
  }, [latestSnapshotRef, releaseCachedRenderSession, setWebGpuMetricState]);

  useEffect(() => {
    let cancelled = false;

    if (!reconstruction || !splatFile || splatMetricCapability.status !== 'unavailable') {
      return () => {
        cancelled = true;
      };
    }

    void ensureSplatPsnrWebGpuDevice()
      .then(() => {
        if (!cancelled) {
          setWebGpuMetricState('ready');
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const reason = error instanceof Error ? error.message : String(error);
          setWebGpuMetricState('failed', reason);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    reconstruction,
    setWebGpuMetricState,
    splatFile,
    splatMetricCapability.status,
  ]);

  useEffect(() => {
    let cancelled = false;

    if (!reconstruction || !splatFile || !gpuPsnrAvailable) {
      setSplatPsnrFrameReady(false);
      return () => {
        cancelled = true;
      };
    }

    setSplatPsnrFrameReady(false);
    queueMicrotask(() => {
      if (!cancelled) {
        setSplatPsnrFrameReady(true);
      }
    });

    return () => {
      cancelled = true;
      setSplatPsnrFrameReady(false);
    };
  }, [gpuPsnrAvailable, reconstruction, setSplatPsnrFrameReady, splatFile]);

  useEffect(() => {
    return () => {
      imagePlaneTexturePrefetchRunRef.current += 1;
      const task = activeTaskRef.current;
      if (task) {
        task.cancelled = true;
        if (task.renderSession) {
          releaseCachedRenderSession(task.renderSession);
          task.renderSession = null;
        }
      }
      releaseCachedRenderSession();
      activeTaskRef.current = null;
    };
  }, [releaseCachedRenderSession]);

  useEffect(() => {
    const task = activeTaskRef.current;
    if (!task) return;

    const snapshot = latestSnapshotRef.current;
    if (!snapshot?.reconstruction || !snapshot.splatFile || !gpuPsnrAvailable) {
      cancelSplatPsnrTask(
        task,
        snapshot?.actions ?? currentActions,
        true,
        snapshot?.releaseRenderSession ?? releaseCachedRenderSession
      );
      activeTaskRef.current = null;
      return;
    }

    const nextIdentity = getSplatPsnrDataIdentity({
      reconstruction: snapshot.reconstruction,
      datasetIdentity: snapshot.datasetIdentity,
      splatFile: snapshot.splatFile,
    });
    const mismatchReason = getSplatPsnrDataIdentityMismatchReason(task.dataIdentity, nextIdentity);
    if (mismatchReason) {
      cancelSplatPsnrTask(task, snapshot.actions, true, snapshot.releaseRenderSession);
      activeTaskRef.current = null;
    }
  }, [
    currentActions,
    datasetIdentity,
    gpuPsnrAvailable,
    latestSnapshotRef,
    releaseCachedRenderSession,
    reconstruction,
    splatFile,
  ]);

  useEffect(() => {
    const cached = cachedRenderSessionRef.current;
    if (!cached) return;

    if (!reconstruction || !splatFile || !gpuPsnrAvailable) {
      releaseCachedRenderSession();
      return;
    }

    const nextIdentity = getSplatPsnrDataIdentity({
      reconstruction,
      datasetIdentity,
      splatFile,
    });
    if (getSplatPsnrDataIdentityMismatchReason(cached.dataIdentity, nextIdentity)) {
      releaseCachedRenderSession();
    }
  }, [
    datasetIdentity,
    gpuPsnrAvailable,
    reconstruction,
    releaseCachedRenderSession,
    splatFile,
  ]);

  useEffect(() => {
    if (!reconstruction || !splatFile || reconstruction.images.size === 0) {
      return;
    }

    const dataIdentity = getSplatPsnrDataIdentity({
      reconstruction,
      datasetIdentity,
      splatFile,
    });
    if (hasSameSplatPsnrDataIdentity(imagePlaneTexturePrefetchIdentityRef.current, dataIdentity)) {
      return;
    }

    imagePlaneTexturePrefetchIdentityRef.current = dataIdentity;
    const runId = imagePlaneTexturePrefetchRunRef.current + 1;
    imagePlaneTexturePrefetchRunRef.current = runId;

    void prefetchSplatPsnrImagePlaneTextures({
      reconstruction,
      dataset,
      shouldCancel: () => imagePlaneTexturePrefetchRunRef.current !== runId,
    }).catch((error: unknown) => {
      if (imagePlaneTexturePrefetchRunRef.current !== runId) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      appLogger.warn(`[PSNR] Background image-plane texture prefetch failed: ${message}`);
    });

    return () => {
      if (imagePlaneTexturePrefetchRunRef.current === runId) {
        imagePlaneTexturePrefetchRunRef.current += 1;
      }
    };
  }, [
    dataset,
    datasetIdentity,
    reconstruction,
    splatFile,
  ]);

  useEffect(() => {
    if (
      !featureReady
      || !reconstruction
      || !splatFile
      || reconstruction.images.size === 0
      || splatPsnrComputeRequest
    ) {
      return;
    }

    const dataIdentity = getSplatPsnrDataIdentity({
      reconstruction,
      datasetIdentity,
      splatFile,
    });
    if (hasSameSplatPsnrDataIdentity(autoPsnrDataIdentityRef.current, dataIdentity)) {
      return;
    }

    const timeoutId = setTimeout(() => {
      const snapshot = latestSnapshotRef.current;
      if (
        !snapshot?.reconstruction
        || !snapshot.splatFile
        || !snapshot.splatPsnrFrameReady
        || snapshot.splatPsnrComputeRequest
        || activeTaskRef.current
      ) {
        return;
      }

      const latestIdentity = getSplatPsnrDataIdentity({
        reconstruction: snapshot.reconstruction,
        datasetIdentity: snapshot.datasetIdentity,
        splatFile: snapshot.splatFile,
      });
      if (!hasSameSplatPsnrDataIdentity(dataIdentity, latestIdentity)) {
        return;
      }

      autoPsnrDataIdentityRef.current = latestIdentity;
      requestSplatPsnrCompute('all');
    }, BACKGROUND_PSNR_START_DELAY_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [
    datasetIdentity,
    featureReady,
    latestSnapshotRef,
    reconstruction,
    requestSplatPsnrCompute,
    splatFile,
    splatPsnrComputeRequest,
  ]);

  useEffect(() => {
    const snapshot = latestSnapshotRef.current;
    const request = snapshot?.splatPsnrComputeRequest;
    const nextRequestId = request?.id ?? 0;

    if (nextRequestId <= 0) {
      if (activeTaskRef.current) {
        cancelSplatPsnrTask(
          activeTaskRef.current,
          snapshot?.actions ?? currentActions,
          true,
          snapshot?.releaseRenderSession ?? releaseCachedRenderSession
        );
        activeTaskRef.current = null;
      }
      lastHandledRequestRef.current = 0;
      return;
    }

    if (!snapshot?.reconstruction || !snapshot.splatFile || !snapshot.splatPsnrFrameReady || !request) {
      return;
    }

    if (nextRequestId === lastHandledRequestRef.current) {
      return;
    }

    if (activeTaskRef.current) {
      cancelSplatPsnrTask(activeTaskRef.current, snapshot.actions, false, snapshot.releaseRenderSession);
    }

    const dataIdentity = getSplatPsnrDataIdentity({
      reconstruction: snapshot.reconstruction,
      datasetIdentity: snapshot.datasetIdentity,
      splatFile: snapshot.splatFile,
    });
    const task: SplatPsnrTaskControl = {
      requestId: nextRequestId,
      dataIdentity,
      cancelled: false,
      renderSession: null,
    };
    const taskSnapshot: SplatPsnrTaskSnapshot = {
      reconstruction: snapshot.reconstruction,
      dataset: snapshot.dataset,
      splatFile: snapshot.splatFile,
      request,
      transform: snapshot.transform,
      actions: snapshot.actions,
      getRenderSession: getCachedRenderSession,
      releaseRenderSession: releaseCachedRenderSession,
    };

    activeTaskRef.current = task;
    lastHandledRequestRef.current = nextRequestId;

    void runSplatPsnrTask(task, taskSnapshot, (finishedTask) => {
      if (activeTaskRef.current !== finishedTask) {
        return;
      }
      activeTaskRef.current = null;
      taskSnapshot.actions.finishSplatPsnrCompute();
    });
  }, [
    currentActions,
    featureReady,
    getCachedRenderSession,
    latestSnapshotRef,
    releaseCachedRenderSession,
    requestId,
  ]);

  return null;
}
