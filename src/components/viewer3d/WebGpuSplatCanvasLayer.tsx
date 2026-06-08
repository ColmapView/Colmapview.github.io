import { useCallback, useEffect, useMemo, useRef, type JSX } from 'react';
import type * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { appLogger } from '../../utils/logger';
import type { NotificationState } from '../../store';
import type { GaussianCloud, LoadedGaussianCloud } from '../../splat/gaussianCloud';
import {
  createWebGpuSplatFrameSnapshot,
  registerWebGpuSplatCanvasHost,
  resizeWebGpuSplatCanvas,
  syncWebGpuSplatFrameSnapshot,
  type WebGpuSplatFrameSnapshot,
} from './WebGpuSplatCanvasRuntime';
import type { VisibleWebGpuSplatRendererAdapter } from '../../splat/webgpu/visibleSplatRendererAdapter';
import { isWebGpuGaussianCloudFile } from './WebGpuSplatCanvasLayerPolicy';
import {
  WEBGPU_SPLAT_ADAPTER_UNAVAILABLE_REASON,
  getBrowserWebGpuProvider,
  getWebGpuAdapterUnavailableDetailReason,
  isWebGpuAdapterUnavailableReason,
  requestPreferredWebGpuSplatAdapter,
  type WebGpuSplatDeviceOptions,
} from '../../splat/webgpu/webGpuSplatDevice';
import {
  createVisibleWebGpuSplatSceneId,
} from '../../splat/webgpu/visibleSplatRuntimeRegistry';
import {
  getWebGpuSplatRequiredLimitsForCloud,
  WEBGPU_PORTABLE_DEFAULT_LIMITS,
  type WebGpuSplatRequiredLimits,
} from '../../splat/webgpu/webGpuSplatLimits';
import {
  createCachedWebGpuSh0FallbackCloud,
} from '../../splat/webgpu/webGpuCloudFallback';
import {
  nowMs,
  sameWebGpuSplatCameraPose,
  waitForWebGpuSplatViewIdle,
} from './webGpuSplatViewIdle';

const PROGRESSIVE_SPLAT_MIN_GAUSSIANS = 1_000_000;
const PROGRESSIVE_PREVIEW_FIRST_FRAME_TIMEOUT_MS = 1500;
// After the fast SH0 preview, hold off on the heavy full higher-order SH upload
// until the camera has been still for this long, so loading/interaction stays
// snappy and the view "sharpens" once it settles.
const FULL_SH_UPGRADE_IDLE_MS = 500;
const WEBGPU_ADAPTER_UNAVAILABLE_INITIAL_RETRY_DELAY_MS = 3000;
const WEBGPU_ADAPTER_UNAVAILABLE_MAX_RETRY_DELAY_MS = 30000;
const WEBGPU_ADAPTER_UNAVAILABLE_MAX_RETRIES = 3;

interface WebGpuSplatAdapterPreflight {
  adapter: NonNullable<WebGpuSplatDeviceOptions['adapter']>;
  limits: WebGpuSplatRequiredLimits;
}

interface SplatLoadingNotification {
  file: File;
  id: string;
}

export function WebGpuSplatCanvasLayer({
  mounted,
  visible,
  splatFile,
  addNotification,
  removeNotification,
  onRuntimeReady,
  onMetricRuntimeReady,
  onRuntimeFailed,
  onAdapterUnavailable,
}: {
  mounted?: boolean;
  visible: boolean;
  splatFile?: File;
  addNotification?: NotificationState['addNotification'];
  removeNotification?: NotificationState['removeNotification'];
  onRuntimeReady?: () => void;
  onMetricRuntimeReady?: () => void;
  onRuntimeFailed?: (reason: string) => void;
  onAdapterUnavailable?: (reason: string) => void;
}): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<VisibleWebGpuSplatRendererAdapter | null>(null);
  const latestFrameRef = useRef<WebGpuSplatFrameSnapshot | null>(null);
  const lastFrameChangeAtRef = useRef(0);
  const readyReportedRef = useRef(false);
  const loadingNotificationRef = useRef<SplatLoadingNotification | null>(null);
  const shouldMount = mounted ?? visible;

  const clearSplatLoadingNotification = useCallback((file?: File) => {
    const current = loadingNotificationRef.current;
    if (!current || (file && current.file !== file)) {
      return false;
    }

    removeNotification?.(current.id);
    loadingNotificationRef.current = null;
    return true;
  }, [removeNotification]);

  const startSplatLoadingNotification = useCallback((file: File) => {
    if (!addNotification || !removeNotification) {
      return;
    }

    const current = loadingNotificationRef.current;
    if (current?.file === file) {
      return;
    }

    if (current) {
      removeNotification(current.id);
    }

    const id = addNotification('info', `Loading splat: ${file.name}`, 0);
    loadingNotificationRef.current = { file, id };
  }, [addNotification, removeNotification]);

  const finishSplatLoadingNotification = useCallback((file: File) => {
    if (!clearSplatLoadingNotification(file)) {
      return;
    }

    addNotification?.('info', `Loaded splat: ${file.name}`, 3000);
  }, [addNotification, clearSplatLoadingNotification]);

  const failSplatLoadingNotification = useCallback((file: File) => {
    if (!clearSplatLoadingNotification(file)) {
      return;
    }

    addNotification?.('warning', `Failed to load splat: ${file.name}`);
  }, [addNotification, clearSplatLoadingNotification]);

  const reportReady = useCallback((file: File) => {
    if (readyReportedRef.current) {
      return;
    }

    readyReportedRef.current = true;
    finishSplatLoadingNotification(file);
    onRuntimeReady?.();
  }, [finishSplatLoadingNotification, onRuntimeReady]);

  useEffect(() => {
    return () => {
      clearSplatLoadingNotification();
    };
  }, [clearSplatLoadingNotification]);

  useEffect(() => {
    if (!shouldMount || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    return registerWebGpuSplatCanvasHost({
      canvas,
      setFrameSnapshot(snapshot: WebGpuSplatFrameSnapshot) {
        resizeWebGpuSplatCanvas(canvas, snapshot.viewport);
        if (!latestFrameRef.current || !sameWebGpuSplatCameraPose(latestFrameRef.current, snapshot)) {
          lastFrameChangeAtRef.current = nowMs();
        }
        latestFrameRef.current = snapshot;
        rendererRef.current?.setFrameSnapshot(snapshot);
      },
    });
  }, [shouldMount]);

  useEffect(() => {
    if (!shouldMount || !canvasRef.current || !splatFile || !isWebGpuGaussianCloudFile(splatFile)) {
      return;
    }

    const canvas = canvasRef.current;
    const sourceFile = splatFile;
    rendererRef.current = null;
    readyReportedRef.current = false;
    let cancelled = false;
    let renderer: VisibleWebGpuSplatRendererAdapter | null = null;
    let failureReported = false;
    let adapterUnavailableRetryId: ReturnType<typeof setTimeout> | null = null;
    let adapterUnavailableLogged = false;
    let adapterUnavailableReported = false;
    let adapterUnavailablePausedLogged = false;
    let adapterUnavailableRetryAttempts = 0;
    let adapterUnavailableRetryDelayMs = WEBGPU_ADAPTER_UNAVAILABLE_INITIAL_RETRY_DELAY_MS;
    let adapterPreflightPromise: Promise<WebGpuSplatAdapterPreflight> | null = null;
    let loadedPromise: Promise<LoadedGaussianCloud> | null = null;
    let loadedLogged = false;

    function reportFailure(reason: string): void {
      if (cancelled || failureReported) {
        return;
      }

      failureReported = true;
      appLogger.warn(`[WebGPU Splats] Failed to initialize runtime for ${sourceFile.name}: ${reason}`);
      onRuntimeFailed?.(reason);
    }

    function getLoadedCloud(): Promise<LoadedGaussianCloud> {
      if (!loadedPromise) {
        loadedPromise = loadSplatCloud(sourceFile);
      }
      return loadedPromise;
    }
    function preflightAdapterAvailable(): Promise<WebGpuSplatAdapterPreflight> {
      if (!adapterPreflightPromise) {
        adapterPreflightPromise = requestWebGpuSplatAdapterLimits();
      }
      return adapterPreflightPromise;
    }

    function scheduleAdapterUnavailableRetry(): boolean {
      if (cancelled || adapterUnavailableRetryId) {
        return true;
      }

      if (adapterUnavailableRetryAttempts >= WEBGPU_ADAPTER_UNAVAILABLE_MAX_RETRIES) {
        return false;
      }

      adapterUnavailableRetryAttempts += 1;
      adapterUnavailableRetryId = setTimeout(() => {
        adapterUnavailableRetryId = null;
        void initializeAndLoad();
      }, adapterUnavailableRetryDelayMs);
      adapterUnavailableRetryDelayMs = Math.min(
        adapterUnavailableRetryDelayMs * 2,
        WEBGPU_ADAPTER_UNAVAILABLE_MAX_RETRY_DELAY_MS
      );
      return true;
    }

    async function initializeAndLoad(): Promise<void> {
      try {
        const adapterPreflight = await preflightAdapterAvailable();
        if (cancelled) return;

        startSplatLoadingNotification(sourceFile);

        const loaded = await getLoadedCloud();
        if (cancelled) return;

        if (!loadedLogged) {
          loadedLogged = true;
          appLogger.info(
            `[WebGPU Splats] Loaded ${sourceFile.name}: ${loaded.cloud.count.toLocaleString()} gaussians, SH degree ${loaded.cloud.shDegree}, SH ${formatByteSize(loaded.cloud.shN?.byteLength ?? 0)}`
          );
        }

        const nextRenderer = await createLoadedVisibleRenderer({
          canvas,
          loadedFile: loaded.file,
          cloud: loaded.cloud,
          adapter: adapterPreflight.adapter,
          adapterLimits: adapterPreflight.limits,
          onRendererCreated: (createdRenderer) => {
            renderer = createdRenderer;
            rendererRef.current = createdRenderer;
            if (latestFrameRef.current) {
              createdRenderer.setFrameSnapshot(latestFrameRef.current);
            }
          },
          shouldCancel: () => cancelled,
          waitForViewIdle: () => waitForWebGpuSplatViewIdle(
            () => lastFrameChangeAtRef.current,
            FULL_SH_UPGRADE_IDLE_MS,
            () => cancelled
          ),
          reportReady: () => {
            if (!cancelled) {
              reportReady(sourceFile);
            }
          },
          reportMetricReady: () => {
            if (!cancelled) {
              onMetricRuntimeReady?.();
            }
          },
          onError: reportFailure,
          onShFallback: (reason) => {
            appLogger.warn(
              `[WebGPU Splats] Using SH0-only rendering for ${loaded.file.name}: ${reason}`
            );
          },
        });
        if (cancelled) {
          nextRenderer.dispose();
          return;
        }

        renderer = nextRenderer;
        rendererRef.current = renderer;
        if (latestFrameRef.current) {
          renderer.setFrameSnapshot(latestFrameRef.current);
        }
      } catch (error) {
        if (cancelled) return;

        const reason = error instanceof Error ? error.message : String(error);
        if (isWebGpuAdapterUnavailableReason(reason)) {
          adapterPreflightPromise = null;
          const unavailableReason = getWebGpuAdapterUnavailableDetailReason(getBrowserWebGpuProvider());
          if (!adapterUnavailableLogged) {
            adapterUnavailableLogged = true;
            appLogger.warn(`[WebGPU Splats] ${unavailableReason} for ${sourceFile.name}; retrying in the background`);
          }
          if (!adapterUnavailableReported) {
            adapterUnavailableReported = true;
            onAdapterUnavailable?.(unavailableReason);
          }
          clearSplatLoadingNotification(sourceFile);
          const retryScheduled = scheduleAdapterUnavailableRetry();
          if (!retryScheduled && !adapterUnavailablePausedLogged) {
            adapterUnavailablePausedLogged = true;
            appLogger.warn(
              `[WebGPU Splats] ${unavailableReason} for ${sourceFile.name}; WebGPU loading is paused until the browser GPU process recovers`
            );
            reportFailure(getWebGpuAdapterRecoveryFailureReason(unavailableReason));
          }
          return;
        }

        reportFailure(reason);
        failSplatLoadingNotification(sourceFile);
      }
    }

    void initializeAndLoad();

    return () => {
      cancelled = true;
      if (adapterUnavailableRetryId) {
        clearTimeout(adapterUnavailableRetryId);
      }
      clearSplatLoadingNotification(sourceFile);
      renderer?.dispose();
      if (rendererRef.current === renderer) {
        rendererRef.current = null;
      }
    };
  }, [
    clearSplatLoadingNotification,
    failSplatLoadingNotification,
    onAdapterUnavailable,
    onMetricRuntimeReady,
    onRuntimeFailed,
    reportReady,
    shouldMount,
    splatFile,
    startSplatLoadingNotification,
  ]);

  if (!shouldMount) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="webgpu-splat-canvas"
      className={`pointer-events-none absolute inset-0 z-0 h-full w-full ${visible ? 'opacity-100' : 'opacity-0'}`}
    />
  );
}

async function loadSplatCloud(file: File) {
  const { loadGaussianCloudFromFile } = await import('../../splat/gaussianCloudLoader');
  return loadGaussianCloudFromFile(file);
}

async function requestWebGpuSplatAdapterLimits(): Promise<WebGpuSplatAdapterPreflight> {
  const gpu = getBrowserWebGpuProvider();
  if (!gpu) {
    throw new Error('WebGPU is not supported by this browser');
  }

  const adapter = await requestPreferredWebGpuSplatAdapter(gpu);
  if (!adapter) {
    throw new Error(WEBGPU_SPLAT_ADAPTER_UNAVAILABLE_REASON);
  }

  return {
    adapter,
    limits: {
      maxBufferSize: getAdapterLimit(
        adapter.limits,
        'maxBufferSize',
        WEBGPU_PORTABLE_DEFAULT_LIMITS.maxBufferSize
      ),
      maxStorageBufferBindingSize: getAdapterLimit(
        adapter.limits,
        'maxStorageBufferBindingSize',
        WEBGPU_PORTABLE_DEFAULT_LIMITS.maxStorageBufferBindingSize
      ),
    },
  };
}

function getAdapterLimit(
  limits: GPUSupportedLimits | undefined,
  name: 'maxBufferSize' | 'maxStorageBufferBindingSize',
  fallback: number
): number {
  const value = limits?.[name];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function getWebGpuAdapterRecoveryFailureReason(unavailableReason: string): string {
  return `${unavailableReason}; adapter recovery did not succeed after retry. Restart the browser GPU process or close and reopen Chrome.`;
}

async function createLoadedVisibleRenderer({
  canvas,
  loadedFile,
  cloud,
  adapter,
  adapterLimits,
  onRendererCreated,
  shouldCancel,
  waitForViewIdle,
  reportReady,
  reportMetricReady,
  onError,
  onShFallback,
}: {
  canvas: HTMLCanvasElement;
  loadedFile: File;
  cloud: GaussianCloud;
  adapter?: WebGpuSplatDeviceOptions['adapter'];
  adapterLimits: WebGpuSplatRequiredLimits;
  onRendererCreated: (renderer: VisibleWebGpuSplatRendererAdapter) => void;
  shouldCancel: () => boolean;
  waitForViewIdle: () => Promise<void>;
  reportReady: () => void;
  reportMetricReady: () => void;
  onError: (reason: string) => void;
  onShFallback: (reason: string) => void;
}): Promise<VisibleWebGpuSplatRendererAdapter> {
  if (shouldUseProgressiveSplatFirstFrame(cloud)) {
    return createProgressiveVisibleRenderer({
      canvas,
      loadedFile,
      cloud,
      adapter,
      adapterLimits,
      onRendererCreated,
      shouldCancel,
      waitForViewIdle,
      reportReady,
      reportMetricReady,
      onError,
      onShFallback,
    });
  }

  const { createLoadedVisibleWebGpuSplatRendererAdapter } = await import(
    '../../splat/webgpu/visibleSplatRendererAdapter'
  );
  return createLoadedVisibleWebGpuSplatRendererAdapter(canvas, cloud, {
    sceneId: createVisibleWebGpuSplatSceneId(loadedFile),
    labelPrefix: `webgpu splat ${loadedFile.name}`,
  }, {
    adapter,
    onFirstFrame: () => {
      reportReady();
      reportMetricReady();
    },
    onError,
    onShFallback,
  });
}

async function createProgressiveVisibleRenderer({
  canvas,
  loadedFile,
  cloud,
  adapter,
  adapterLimits,
  onRendererCreated,
  shouldCancel,
  waitForViewIdle,
  reportReady,
  reportMetricReady,
  onError,
  onShFallback,
}: {
  canvas: HTMLCanvasElement;
  loadedFile: File;
  cloud: GaussianCloud;
  adapter?: WebGpuSplatDeviceOptions['adapter'];
  adapterLimits: WebGpuSplatRequiredLimits;
  onRendererCreated: (renderer: VisibleWebGpuSplatRendererAdapter) => void;
  shouldCancel: () => boolean;
  waitForViewIdle: () => Promise<void>;
  reportReady: () => void;
  reportMetricReady: () => void;
  onError: (reason: string) => void;
  onShFallback: (reason: string) => void;
}): Promise<VisibleWebGpuSplatRendererAdapter> {
  const {
    createLoadedVisibleWebGpuSplatRendererAdapter,
    createVisibleWebGpuSplatRendererAdapter,
  } = await import('../../splat/webgpu/visibleSplatRendererAdapter');
  const sceneId = createVisibleWebGpuSplatSceneId(loadedFile);
  const preview = createProgressivePreviewCloud(cloud, adapterLimits);
  const previewCloud = preview.cloud;
  const previewOnlyReason = preview.previewOnlyReason;
  const previewOnly = previewOnlyReason !== null;
  const previewSceneId = previewOnly ? sceneId : `${sceneId}:preview-sh0`;
  let stage: 'preview' | 'full' = 'preview';
  let previewFirstFrameResolved = false;
  let fullFirstFrameResolved = false;
  let resolvePreviewFirstFrame: (() => void) | null = null;
  const previewFirstFrame = new Promise<void>((resolve) => {
    resolvePreviewFirstFrame = resolve;
  });

  let renderer: VisibleWebGpuSplatRendererAdapter;
  try {
    renderer = await createVisibleWebGpuSplatRendererAdapter(canvas, {
      adapter,
      requiredLimits: getWebGpuSplatRequiredLimitsForCloud(previewOnly ? previewCloud : cloud),
      onFirstFrame: () => {
        if (stage === 'preview' && !previewFirstFrameResolved) {
          previewFirstFrameResolved = true;
          reportReady();
          if (previewOnly && preview.metricReady) {
            reportMetricReady();
          }
          resolvePreviewFirstFrame?.();
          return;
        }
        if (stage === 'full' && !fullFirstFrameResolved) {
          fullFirstFrameResolved = true;
          reportReady();
          reportMetricReady();
        }
      },
      onError,
    });
  } catch (error) {
    if (!shouldRetryProgressiveSplatAsSh0(error, cloud)) {
      throw error;
    }
    onShFallback(error instanceof Error ? error.message : String(error));
    return createLoadedVisibleWebGpuSplatRendererAdapter(canvas, previewCloud, {
      sceneId,
      labelPrefix: `webgpu splat ${loadedFile.name}`,
    }, {
      adapter,
      onFirstFrame: reportReady,
      onError,
    });
  }

  if (previewOnlyReason) {
    onShFallback(previewOnlyReason);
  }
  onRendererCreated(renderer);
  await renderer.loadCloud(previewCloud, {
    sceneId: previewSceneId,
    labelPrefix: `webgpu splat ${loadedFile.name} preview`,
  });
  await waitForProgressivePreviewFirstFrame(previewFirstFrame);
  if (shouldCancel()) {
    return renderer;
  }
  if (previewOnly) {
    return renderer;
  }

  // Keep the SH0 preview interactive and defer the heavy full higher-order SH
  // upload until the camera settles, so loading/panning stays snappy.
  await waitForViewIdle();
  if (shouldCancel()) {
    return renderer;
  }

  appLogger.info(
    `[WebGPU Splats] View settled — upgrading ${loadedFile.name} to full higher-order SH`
  );
  stage = 'full';
  await renderer.loadCloud(cloud, {
    sceneId,
    labelPrefix: `webgpu splat ${loadedFile.name}`,
  });
  return renderer;
}

function shouldUseProgressiveSplatFirstFrame(cloud: GaussianCloud): boolean {
  return cloud.shDegree > 0 && cloud.count >= PROGRESSIVE_SPLAT_MIN_GAUSSIANS;
}

function createProgressivePreviewCloud(
  cloud: GaussianCloud,
  adapterLimits: WebGpuSplatRequiredLimits
): {
  cloud: GaussianCloud;
  previewOnlyReason: string | null;
  metricReady: boolean;
} {
  return {
    cloud: createCachedWebGpuSh0FallbackCloud(cloud),
    previewOnlyReason: getLargeHigherOrderShPreviewOnlyReason(cloud, adapterLimits),
    metricReady: true,
  };
}

// Render full higher-order SH whenever the GPU adapter can actually bind the
// required storage buffers. Only fall back to an SH0 preview when the decoded
// cloud's required limits exceed what the adapter exposes — the device-creation
// path (and shouldRetryProgressiveSplatAsSh0) is the final safety net if a
// reported limit still cannot be satisfied at allocation time.
function getLargeHigherOrderShPreviewOnlyReason(
  cloud: GaussianCloud,
  adapterLimits: WebGpuSplatRequiredLimits
): string | null {
  const higherOrderShBytes = cloud.shN?.byteLength ?? 0;
  if (higherOrderShBytes <= 0) {
    return null;
  }

  const required = getWebGpuSplatRequiredLimitsForCloud(cloud);
  if (
    required.maxStorageBufferBindingSize <= adapterLimits.maxStorageBufferBindingSize
    && required.maxBufferSize <= adapterLimits.maxBufferSize
  ) {
    return null;
  }

  return `higher-order SH needs a ${formatByteSize(required.maxStorageBufferBindingSize)} WebGPU storage binding, above this GPU's limit of ${formatByteSize(adapterLimits.maxStorageBufferBindingSize)}`;
}

function shouldRetryProgressiveSplatAsSh0(error: unknown, cloud: GaussianCloud): boolean {
  if (cloud.shDegree <= 0) {
    return false;
  }
  const reason = error instanceof Error ? error.message : String(error);
  return /binding size|buffer size|exceeds.*limit|limit.*exceed|maxBufferSize|maxStorageBufferBindingSize|required.*limit|storage buffer|validation/i
    .test(reason);
}

async function waitForProgressivePreviewFirstFrame(previewFirstFrame: Promise<void>): Promise<void> {
  await Promise.race([
    previewFirstFrame,
    new Promise<void>((resolve) => {
      setTimeout(resolve, PROGRESSIVE_PREVIEW_FIRST_FRAME_TIMEOUT_MS);
    }),
  ]);
}

export function WebGpuSplatCanvasBridge({
  enabled,
  modelMatrix,
}: {
  enabled: boolean;
  modelMatrix?: THREE.Matrix4 | null;
}): null {
  const { camera, gl, size } = useThree();

  const syncFrame = useMemo(() => {
    return () => {
      if (!enabled) {
        return;
      }

      syncWebGpuSplatFrameSnapshot(createWebGpuSplatFrameSnapshot({
        camera,
        width: size.width,
        height: size.height,
        dpr: gl.getPixelRatio(),
        modelMatrix,
      }));
    };
  }, [camera, enabled, gl, modelMatrix, size.height, size.width]);

  useEffect(() => {
    syncFrame();
  }, [syncFrame]);

  useFrame(syncFrame, -1);

  return null;
}

function formatByteSize(byteLength: number): string {
  if (byteLength < 1024) {
    return `${byteLength} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = byteLength / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}
