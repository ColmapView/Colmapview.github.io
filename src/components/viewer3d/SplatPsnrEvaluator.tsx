import {
  cancelSplatPsnrTask,
  getSplatPsnrDataIdentity,
  getSplatPsnrDataIdentityMismatchReason,
  hasSameSplatPsnrDataIdentity,
  runSplatPsnrTask,
  type SplatPsnrDataIdentity,
  type SplatPsnrRenderSession,
  type SplatPsnrTaskActions,
  type SplatPsnrTaskControl,
  type SplatPsnrTaskSnapshot,
} from '../../splat/metrics/splatPsnrTask';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Image, Reconstruction } from '../../types/colmap';
import type { Sim3dEuler } from '../../types/sim3d';
import type { DatasetManager } from '../../dataset';
import type { SplatPsnrComputeRequest } from '../../store';
import type { LoadedGaussianCloud } from '../../splat/gaussianCloud';
import { prefetchFrustumTexturesInBackground } from '../../hooks/useFrustumTexture';
import { useLatestRef } from '../../hooks/useLatestRef';
import { appLogger } from '../../utils/logger';
import {
  ensureSplatPsnrWebGpuDevice,
  subscribeSplatPsnrWebGpuDeviceLoss,
} from './splatPsnrRuntime';
import {
  useSplatPsnrEvaluatorStoreFacade,
  type SplatPsnrDatasetIdentity,
} from './SplatPsnrEvaluatorStoreFacade';
import { getWebGpuSplatRequiredLimitsForCloud } from '../../splat/webgpu/webGpuSplatLimits';
import {
  createWebGpuSh0FallbackCloud,
  getWebGpuCloudFallbackErrorMessage,
  shouldRetryWebGpuCloudWithSh0,
} from '../../splat/webgpu/webGpuCloudFallback';
import {
  createVisibleWebGpuSplatSceneId,
  getVisibleWebGpuSplatSharedRuntime,
} from '../../splat/webgpu/visibleSplatRuntimeRegistry';
import { getImagePlaneTextureSourceFile } from './imagePlaneTexturePrefetch';
import {
  getSplatPsnrExclusionNotice,
  getSplatPsnrImageSelection,
} from './splatPsnrImageIds';

interface SplatPsnrEvaluatorSnapshot {
  reconstruction: Reconstruction | null;
  dataset: DatasetManager;
  datasetIdentity: SplatPsnrDatasetIdentity;
  splatFile?: File;
  splatPsnrFrameReady: boolean;
  splatPsnrComputeRequest: SplatPsnrComputeRequest | null;
  transform: Sim3dEuler;
  splatTransform: Sim3dEuler;
  actions: SplatPsnrTaskActions;
  addNotification: (type: 'info' | 'warning', message: string, duration?: number) => string;
  releaseRenderSession: (renderSession: SplatPsnrRenderSession) => void;
}

interface SplatPsnrRenderSessionCache {
  dataIdentity: SplatPsnrDataIdentity;
  renderSession: SplatPsnrRenderSession;
}
const BACKGROUND_PSNR_START_DELAY_MS = 1500;
const BACKGROUND_IMAGE_PLANE_TEXTURE_COLLECT_BATCH_SIZE = 32;
const WEBGPU_METRIC_ADAPTER_RETRY_DELAY_MS = 5000;

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

  try {
    return await createSplatPsnrRenderSessionForLoadedCloud({
      splatFile,
      loadedCloud,
      createWebGpuSplatPsnrSession,
    });
  } catch (error) {
    if (!shouldRetryWebGpuCloudWithSh0(error, loadedCloud.cloud)) {
      throw error;
    }

    const reason = getWebGpuCloudFallbackErrorMessage(error);
    const fallbackLoadedCloud = {
      ...loadedCloud,
      cloud: createWebGpuSh0FallbackCloud(loadedCloud.cloud),
    };
    appLogger.warn(
      `[PSNR] Retrying ${splatFile.name} with SH0-only data after full-SH WebGPU initialization failed: ${reason}`
    );
    return createSplatPsnrRenderSessionForLoadedCloud({
      splatFile,
      loadedCloud: fallbackLoadedCloud,
      createWebGpuSplatPsnrSession,
    });
  }
}

async function createSplatPsnrRenderSessionForLoadedCloud({
  splatFile,
  loadedCloud,
  createWebGpuSplatPsnrSession,
}: {
  splatFile: File;
  loadedCloud: LoadedGaussianCloud;
  createWebGpuSplatPsnrSession: typeof import('../../splat/webgpu/psnrSplatSession')['createWebGpuSplatPsnrSession'];
}): Promise<SplatPsnrRenderSession> {
  const sharedRuntime = getVisibleWebGpuSplatSharedRuntime(createVisibleWebGpuSplatSceneId(splatFile));
  if (sharedRuntime) {
    return createWebGpuSplatPsnrSession({
      device: sharedRuntime.device,
      splatFile,
      loadedCloud,
      sharedScene: {
        sceneId: sharedRuntime.sceneId,
        resourceManager: sharedRuntime.sceneResourceManager,
      },
    });
  }

  const device = await ensureSplatPsnrWebGpuDevice(getWebGpuSplatRequiredLimitsForCloud(loadedCloud.cloud));
  return createWebGpuSplatPsnrSession({ device, splatFile, loadedCloud });
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

    const imageFile = await getImagePlaneTextureSourceFile(dataset, image.name);
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
      splatBackendResolution,
      splatMetricCapability,
      transform,
      splatTransform,
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
      addNotification,
    },
  } = useSplatPsnrEvaluatorStoreFacade();
  const lastHandledRequestRef = useRef(0);
  const activeTaskRef = useRef<SplatPsnrTaskControl | null>(null);
  const cachedRenderSessionRef = useRef<SplatPsnrRenderSessionCache | null>(null);
  const autoPsnrDataIdentityRef = useRef<SplatPsnrDataIdentity | null>(null);
  const imagePlaneTexturePrefetchIdentityRef = useRef<SplatPsnrDataIdentity | null>(null);
  const imagePlaneTexturePrefetchRunRef = useRef(0);
  const visibleWebGpuSplatReady = splatBackendResolution.status === 'resolved'
    && splatBackendResolution.backend === 'webgpu';
  const gpuPsnrAvailable = visibleWebGpuSplatReady && splatMetricCapability.gpuPsnr;
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
    splatTransform,
    actions: currentActions,
    addNotification,
    releaseRenderSession: releaseCachedRenderSession,
  });

  const requestId = splatPsnrComputeRequest?.id ?? 0;
  const featureReady = Boolean(
    reconstruction
    && splatFile
    && splatPsnrFrameReady
    && gpuPsnrAvailable
  );

  useEffect(() => {
    const unsubscribe = subscribeSplatPsnrWebGpuDeviceLoss((info) => {
      const reason = getWebGpuDeviceLostMessage(info);
      setWebGpuMetricState('failed', reason);
      const task = activeTaskRef.current;
      const snapshot = latestSnapshotRef.current;
      if (task && snapshot) {
        cancelSplatPsnrTask(task, snapshot.actions, true, snapshot.releaseRenderSession, {
          addNotification: snapshot.addNotification,
          reason,
        });
        activeTaskRef.current = null;
      }
      releaseCachedRenderSession();
    });

    return unsubscribe;
  }, [latestSnapshotRef, releaseCachedRenderSession, setWebGpuMetricState]);

  useEffect(() => {
    let cancelled = false;
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let adapterRetryLogged = false;

    if (
      !reconstruction
      || !splatFile
      || !visibleWebGpuSplatReady
      || splatMetricCapability.status !== 'unavailable'
    ) {
      return () => {
        cancelled = true;
        if (retryTimeoutId) {
          clearTimeout(retryTimeoutId);
        }
      };
    }

    const probeMetricDevice = () => {
      if (getVisibleWebGpuSplatSharedRuntime(createVisibleWebGpuSplatSceneId(splatFile))) {
        if (!cancelled) {
          setWebGpuMetricState('ready');
        }
        return;
      }

      if (!adapterRetryLogged) {
        adapterRetryLogged = true;
        appLogger.info('[PSNR] Waiting for visible WebGPU splat resources before enabling metrics');
      }
      retryTimeoutId = setTimeout(probeMetricDevice, WEBGPU_METRIC_ADAPTER_RETRY_DELAY_MS);
    };

    probeMetricDevice();

    return () => {
      cancelled = true;
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
      }
    };
  }, [
    reconstruction,
    setWebGpuMetricState,
    splatFile,
    visibleWebGpuSplatReady,
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
  }, [
    gpuPsnrAvailable,
    reconstruction,
    setSplatPsnrFrameReady,
    splatFile,
  ]);

  useEffect(() => {
    return () => {
      imagePlaneTexturePrefetchRunRef.current += 1;
      const task = activeTaskRef.current;
      if (task) {
        task.cancelled = true;
        task.mediaController.abort();
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
    if (
      !snapshot?.reconstruction
      || !snapshot.splatFile
      || !gpuPsnrAvailable
    ) {
      const reason = !snapshot?.reconstruction
        ? 'reconstruction unloaded'
        : !snapshot.splatFile
          ? 'splat file unloaded'
          : 'GPU metrics became unavailable';
      cancelSplatPsnrTask(
        task,
        snapshot?.actions ?? currentActions,
        true,
        snapshot?.releaseRenderSession ?? releaseCachedRenderSession,
        snapshot ? { addNotification: snapshot.addNotification, reason } : undefined
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
      cancelSplatPsnrTask(task, snapshot.actions, true, snapshot.releaseRenderSession, {
        addNotification: snapshot.addNotification,
        reason: mismatchReason,
      });
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
    if (!reconstruction || !splatFile || !gpuPsnrAvailable || reconstruction.images.size === 0) {
      imagePlaneTexturePrefetchIdentityRef.current = null;
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
    gpuPsnrAvailable,
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
          snapshot?.releaseRenderSession ?? releaseCachedRenderSession,
          snapshot
            ? { addNotification: snapshot.addNotification, reason: 'compute request was cleared' }
            : undefined
        );
        activeTaskRef.current = null;
      }
      lastHandledRequestRef.current = 0;
      return;
    }

    if (
      !featureReady
      || !snapshot?.reconstruction
      || !snapshot.splatFile
      || !snapshot.splatPsnrFrameReady
      || !request
    ) {
      return;
    }

    if (nextRequestId === lastHandledRequestRef.current) {
      return;
    }

    if (activeTaskRef.current) {
      cancelSplatPsnrTask(activeTaskRef.current, snapshot.actions, false, snapshot.releaseRenderSession);
    }

    // Surface unsupported-camera exclusions once per user-triggered compute (this effect
    // runs at most once per request id). A compute-all over a mixed dataset
    // emits an info notice and still proceeds over metric-capable images; an
    // unsupported selection emits a warning and starts no pointless compute.
    const selection = getSplatPsnrImageSelection(request, snapshot.reconstruction);
    const exclusionNotice = getSplatPsnrExclusionNotice(selection);
    if (exclusionNotice) {
      snapshot.addNotification(exclusionNotice.type, exclusionNotice.message);
    }
    if (selection.selectedIsUnsupported) {
      activeTaskRef.current = null;
      lastHandledRequestRef.current = nextRequestId;
      snapshot.actions.finishSplatPsnrCompute();
      return;
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
      mediaController: new AbortController(),
      renderSession: null,
      metricImagesIncompatible: false,
    };
    const taskSnapshot: SplatPsnrTaskSnapshot = {
      imageIds: selection.imageIds,
      onImageReady: (image, imageFile, shouldCancel) => {
        warmSplatPsnrImagePlaneTexture({ image, imageFile, shouldCancel });
      },
      reconstruction: snapshot.reconstruction,
      dataset: snapshot.dataset,
      splatFile: snapshot.splatFile,
      request,
      transform: snapshot.transform,
      splatTransform: snapshot.splatTransform,
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
