import { useCallback, useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react';
import { useThree } from '@react-three/fiber';
import type { Matrix4 } from 'three';
import { appLogger } from '../../../utils/logger';
import {
  getSplatMeshSourceOptions,
  preloadSparkModule,
  type SparkModule,
} from '../../../utils/sparkSplatRuntime';
import { shouldPreloadSparkSplatRuntime } from '../../../utils/splatBackendPolicy';
import { SPARK_SPLAT_RENDER_ORDER } from './pointCloudRenderPolicy';
import { useSplatLayerStoreFacade } from './SplatLayerStoreFacade';
import {
  getSplatLoadedProgress,
  getSplatLoadingProgress,
  getSplatPhaseProgress,
  getSplatProgressStartPercent,
  isSplatLoadingProgressForFile,
  isSplatLoadingProgressForRenderer,
  type SplatLoadingPhase,
} from '../../../utils/splatLoadingProgressPolicy';

type SplatMeshInstance = InstanceType<SparkModule['SplatMesh']>;
type SparkRendererInstance = InstanceType<SparkModule['SparkRenderer']>;

interface SparkRendererSortInternals {
  driveSort?: (...args: unknown[]) => unknown;
  sorting?: boolean;
  sortDirty?: boolean;
  sortTimeoutId?: number;
}

interface LoadedSplatMesh {
  file: File;
  mesh: SplatMeshInstance;
}

interface SplatLoadingNotification {
  file: File;
  id: string;
}

const SPARK_RENDERER_DISPOSE_IDLE_POLL_MS = 50;
const SPARK_RENDERER_DISPOSE_MAX_WAIT_MS = 30_000;

function getTimestampMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function isExpectedSparkTeardownError(error: unknown): boolean {
  return error instanceof Error && (
    error.message === 'Worker terminate'
    || error.message === 'No target'
    || error.message === 'Must initialize with target'
  );
}

function disposeSparkRendererSafely(spark: SparkRendererInstance): void {
  try {
    const result = (spark.dispose as () => unknown).call(spark);
    if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
      void Promise.resolve(result).catch((error: unknown) => {
        if (!isExpectedSparkTeardownError(error)) {
          appLogger.warn(`[Splats] Failed to dispose Spark renderer: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    }
  } catch (error) {
    if (!isExpectedSparkTeardownError(error)) {
      appLogger.warn(`[Splats] Failed to dispose Spark renderer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function clearSparkRendererPendingSort(spark: SparkRendererInstance): void {
  const sortState = spark as unknown as SparkRendererSortInternals;
  if (typeof sortState.sortTimeoutId === 'number' && sortState.sortTimeoutId !== -1) {
    clearTimeout(sortState.sortTimeoutId);
    sortState.sortTimeoutId = -1;
  }
  if (typeof sortState.sortDirty === 'boolean') {
    sortState.sortDirty = false;
  }
}

function isSparkRendererSortActive(spark: SparkRendererInstance): boolean {
  const sortState = spark as unknown as SparkRendererSortInternals;
  return sortState.sorting === true
    || (typeof sortState.sortTimeoutId === 'number' && sortState.sortTimeoutId !== -1);
}

function scheduleSparkRendererDisposeWhenIdle(spark: SparkRendererInstance): void {
  const startedAt = getTimestampMs();

  const disposeWhenIdle = () => {
    if (
      !isSparkRendererSortActive(spark)
      || getTimestampMs() - startedAt >= SPARK_RENDERER_DISPOSE_MAX_WAIT_MS
    ) {
      clearSparkRendererPendingSort(spark);
      disposeSparkRendererSafely(spark);
      return;
    }

    window.setTimeout(disposeWhenIdle, SPARK_RENDERER_DISPOSE_IDLE_POLL_MS);
  };

  disposeWhenIdle();
}

function guardSparkRendererTeardownErrors(
  spark: SparkRendererInstance,
  isTearingDown: () => boolean
): void {
  const sortState = spark as unknown as SparkRendererSortInternals;
  const originalDriveSort = sortState.driveSort;
  if (typeof originalDriveSort !== 'function') {
    return;
  }

  sortState.driveSort = function guardedDriveSort(this: SparkRendererInstance, ...args: unknown[]) {
    try {
      const result = originalDriveSort.apply(this, args);
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        return Promise.resolve(result).catch((error: unknown) => {
          if (isTearingDown() && isExpectedSparkTeardownError(error)) {
            return undefined;
          }
          throw error;
        });
      }
      return result;
    } catch (error) {
      if (isTearingDown() && isExpectedSparkTeardownError(error)) {
        return undefined;
      }
      throw error;
    }
  };
}

function SparkRendererBridge({
  SparkRenderer,
  onReadyChange,
}: {
  SparkRenderer: SparkModule['SparkRenderer'];
  onReadyChange: (ready: boolean) => void;
}) {
  const { gl, scene, invalidate } = useThree();

  useLayoutEffect(() => {
    onReadyChange(false);
    const spark = new SparkRenderer({
      renderer: gl,
      onDirty: invalidate,
    });
    let tearingDown = false;
    guardSparkRendererTeardownErrors(spark, () => tearingDown);

    scene.add(spark);
    onReadyChange(true);
    invalidate();

    return () => {
      tearingDown = true;
      scene.remove(spark);
      scheduleSparkRendererDisposeWhenIdle(spark);
      onReadyChange(false);
      invalidate();
    };
  }, [SparkRenderer, gl, scene, invalidate, onReadyChange]);

  return null;
}

export function SplatLayer({
  modelMatrix = null,
  visible = true,
}: {
  modelMatrix?: Matrix4 | null;
  visible?: boolean;
}): JSX.Element | null {
  const {
    data: {
      showSplats,
      splatFile,
      requestedBackend,
      splatBackendAvailability,
      splatBackendResolution,
    },
    actions: {
      addNotification,
      removeNotification,
      setSparkBackendAvailable,
      getUrlProgress,
      setUrlLoading,
      setUrlProgress,
    },
  } = useSplatLayerStoreFacade();
  const { invalidate } = useThree();
  const [sparkModule, setSparkModule] = useState<SparkModule | null>(null);
  const [loadedSplat, setLoadedSplat] = useState<LoadedSplatMesh | null>(null);
  const [sparkRendererReady, setSparkRendererReady] = useState(false);
  const loadedSplatRef = useRef<LoadedSplatMesh | null>(null);
  const loadingNotificationRef = useRef<SplatLoadingNotification | null>(null);
  const progressStartRef = useRef<{ file: File; percent: number } | null>(null);
  const shouldUseSparkBackend = splatBackendResolution.status === 'resolved'
    && splatBackendResolution.backend === 'spark';
  const shouldReportSparkPreloadFailure = requestedBackend === 'spark'
    || (
      requestedBackend === 'auto'
      && (
        splatBackendAvailability.webGpu === 'unsupported'
        || splatBackendAvailability.webGpu === 'failed'
      )
    );
  const activeLoadedSplat = loadedSplat?.file === splatFile ? loadedSplat : null;
  const hasLoadedSplat = activeLoadedSplat !== null;
  const showLoadedSplat = visible && showSplats && hasLoadedSplat;
  const showRenderableSplat = showLoadedSplat && sparkRendererReady;
  const handleSparkRendererReadyChange = useCallback((ready: boolean) => {
    setSparkRendererReady(ready);
  }, []);

  const clearSplatLoadingNotification = useCallback((file?: File) => {
    const current = loadingNotificationRef.current;
    if (!current || (file && current.file !== file)) {
      return;
    }

    removeNotification(current.id);
    loadingNotificationRef.current = null;
    if (isSplatLoadingProgressForRenderer(getUrlProgress(), current.file, 'spark')) {
      setUrlLoading(false);
    }
  }, [getUrlProgress, removeNotification, setUrlLoading]);

  const startSplatLoadingNotification = useCallback((file: File) => {
    const current = loadingNotificationRef.current;
    if (current?.file === file) {
      return;
    }

    if (current) {
      removeNotification(current.id);
    }

    setUrlLoading(true);
    progressStartRef.current = {
      file,
      percent: getSplatProgressStartPercent(getUrlProgress()),
    };
    setUrlProgress(getSplatLoadingProgress(file, {
      startPercent: progressStartRef.current.percent,
      renderer: 'spark',
    }));
    const id = addNotification('info', `Loading splat: ${file.name}`, 0);
    loadingNotificationRef.current = { file, id };
  }, [addNotification, getUrlProgress, removeNotification, setUrlLoading, setUrlProgress]);

  const getProgressStartPercent = useCallback((file: File) => {
    const current = progressStartRef.current;
    if (current?.file === file) {
      return current.percent;
    }

    const percent = getSplatProgressStartPercent(getUrlProgress());
    progressStartRef.current = { file, percent };
    return percent;
  }, [getUrlProgress]);

  const isSplatProgressOwnedByAnotherRenderer = useCallback((file: File) => {
    const progress = getUrlProgress();
    return Boolean(
      progress?.currentFile === file.name
        && progress.splatRenderer
        && progress.splatRenderer !== 'spark'
    );
  }, [getUrlProgress]);

  const setSplatPhaseProgress = useCallback((file: File, phase: SplatLoadingPhase) => {
    if (isSplatProgressOwnedByAnotherRenderer(file)) {
      return;
    }

    setUrlProgress(getSplatPhaseProgress(file, phase, {
      startPercent: getProgressStartPercent(file),
      renderer: 'spark',
    }));
  }, [getProgressStartPercent, isSplatProgressOwnedByAnotherRenderer, setUrlProgress]);

  const ownsSparkSplatLoading = useCallback((file: File) => {
    if (isSplatProgressOwnedByAnotherRenderer(file)) {
      return false;
    }

    return loadingNotificationRef.current?.file === file
      || isSplatLoadingProgressForFile(getUrlProgress(), file);
  }, [getUrlProgress, isSplatProgressOwnedByAnotherRenderer]);

  const finishSplatLoading = useCallback((file: File) => {
    if (!ownsSparkSplatLoading(file)) {
      return;
    }

    clearSplatLoadingNotification(file);
    setUrlProgress(getSplatLoadedProgress(file, { renderer: 'spark' }));
    setUrlLoading(false);
    addNotification('info', `Loaded splat: ${file.name}`, 3000);
  }, [addNotification, clearSplatLoadingNotification, ownsSparkSplatLoading, setUrlLoading, setUrlProgress]);

  const failSplatLoading = useCallback((file: File) => {
    if (!ownsSparkSplatLoading(file)) {
      return;
    }

    clearSplatLoadingNotification(file);
    setUrlLoading(false);
    addNotification('warning', `Failed to load splat: ${file.name}`);
  }, [addNotification, clearSplatLoadingNotification, ownsSparkSplatLoading, setUrlLoading]);

  const replaceLoadedSplat = useCallback((nextLoadedSplat: LoadedSplatMesh | null) => {
    const previousLoadedSplat = loadedSplatRef.current;
    if (previousLoadedSplat?.mesh !== nextLoadedSplat?.mesh) {
      previousLoadedSplat?.mesh.dispose();
    }
    loadedSplatRef.current = nextLoadedSplat;
    setLoadedSplat(nextLoadedSplat);
  }, []);

  useEffect(() => {
    return () => {
      clearSplatLoadingNotification();
      loadedSplatRef.current?.mesh.dispose();
      loadedSplatRef.current = null;
    };
  }, [clearSplatLoadingNotification]);

  useEffect(() => {
    if (!splatFile || !shouldUseSparkBackend) {
      clearSplatLoadingNotification();
      return;
    }

    if (loadedSplatRef.current?.file !== splatFile) {
      startSplatLoadingNotification(splatFile);
    }

    return () => {
      clearSplatLoadingNotification(splatFile);
    };
  }, [
    clearSplatLoadingNotification,
    shouldUseSparkBackend,
    splatFile,
    startSplatLoadingNotification,
  ]);

  useEffect(() => {
    if (
      !splatFile ||
      !shouldPreloadSparkSplatRuntime(requestedBackend, splatBackendAvailability)
    ) {
      return;
    }

    let cancelled = false;
    void preloadSparkModule()
      .then((module) => {
        setSparkBackendAvailable(true);
        if (!cancelled) {
          setSparkModule(module);
        }
      })
      .catch((error: unknown) => {
        setSparkBackendAvailable(false);
        if (!cancelled) {
          if (shouldReportSparkPreloadFailure) {
            failSplatLoading(splatFile);
          }
          appLogger.warn(
            `[Splats] Failed to preload Spark runtime: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    clearSplatLoadingNotification,
    failSplatLoading,
    requestedBackend,
    setSparkBackendAvailable,
    shouldReportSparkPreloadFailure,
    splatBackendAvailability,
    splatFile,
  ]);

  useEffect(() => {
    if (!splatFile) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          replaceLoadedSplat(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }
    if (!sparkModule) {
      return;
    }
    if (!shouldUseSparkBackend) {
      return;
    }

    const sourceFile = splatFile;
    const { SplatMesh } = sparkModule;
    let cancelled = false;
    let mesh: SplatMeshInstance | null = null;
    let committed = false;

    startSplatLoadingNotification(sourceFile);
    setSplatPhaseProgress(sourceFile, 'readingFile');

    if (loadedSplatRef.current && loadedSplatRef.current.file !== sourceFile) {
      queueMicrotask(() => {
        if (!cancelled && loadedSplatRef.current?.file !== sourceFile) {
          replaceLoadedSplat(null);
        }
      });
    }

    async function loadSplat(): Promise<void> {
      const sourceOptions = await getSplatMeshSourceOptions(sourceFile);

      if (cancelled) {
        return;
      }

      setSplatPhaseProgress(sourceFile, 'initializingSpark');
      mesh = new SplatMesh({
        ...sourceOptions,
        fileName: sourceFile.name,
        raycastable: false,
      });

      await mesh.initialized;

      if (cancelled) {
        mesh.dispose();
        return;
      }

      committed = true;
      replaceLoadedSplat({ file: sourceFile, mesh });
      setSplatPhaseProgress(sourceFile, 'renderingFirstFrame');
      finishSplatLoading(sourceFile);
      invalidate();
    }

    void loadSplat().catch((error: unknown) => {
      mesh?.dispose();
      mesh = null;
      if (!cancelled) {
        failSplatLoading(sourceFile);
        appLogger.warn(
          `[Splats] Failed to load ${sourceFile.name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    return () => {
      cancelled = true;
      clearSplatLoadingNotification(sourceFile);
      if (!committed) {
        mesh?.dispose();
      }
    };
  }, [
    clearSplatLoadingNotification,
    failSplatLoading,
    finishSplatLoading,
    splatFile,
    sparkModule,
    shouldUseSparkBackend,
    invalidate,
    replaceLoadedSplat,
    setSplatPhaseProgress,
    startSplatLoadingNotification,
  ]);

  useEffect(() => {
    const currentLoadedSplat = loadedSplatRef.current;
    if (!currentLoadedSplat || currentLoadedSplat.file !== splatFile) {
      return;
    }

    const { mesh } = currentLoadedSplat;
    if (modelMatrix) {
      mesh.matrix.copy(modelMatrix);
      mesh.matrixAutoUpdate = false;
    } else {
      mesh.matrix.identity();
      mesh.matrixAutoUpdate = true;
    }
    mesh.updateMatrixWorld(true);
    invalidate();
  }, [invalidate, loadedSplat, modelMatrix, splatFile]);

  if (!splatFile || !sparkModule || !shouldUseSparkBackend) {
    return null;
  }

  return (
    <>
      {showLoadedSplat && (
        <SparkRendererBridge
          SparkRenderer={sparkModule.SparkRenderer}
          onReadyChange={handleSparkRendererReadyChange}
        />
      )}
      {activeLoadedSplat && (
        <primitive
          object={activeLoadedSplat.mesh}
          renderOrder={SPARK_SPLAT_RENDER_ORDER}
          visible={showRenderableSplat}
        />
      )}
    </>
  );
}
