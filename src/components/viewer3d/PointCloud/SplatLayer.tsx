import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
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
  type SplatLoadingPhase,
} from '../../../utils/splatLoadingProgressPolicy';

type SplatMeshInstance = InstanceType<SparkModule['SplatMesh']>;

interface LoadedSplatMesh {
  file: File;
  mesh: SplatMeshInstance;
}

interface SplatLoadingNotification {
  file: File;
  id: string;
}

function SparkRendererBridge({ SparkRenderer }: { SparkRenderer: SparkModule['SparkRenderer'] }) {
  const { gl, scene, invalidate } = useThree();

  useEffect(() => {
    let spark: InstanceType<SparkModule['SparkRenderer']> | null = null;
    let cancelled = false;
    const frameId = requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }

      spark = new SparkRenderer({
        renderer: gl,
        onDirty: invalidate,
      });

      scene.add(spark);
      invalidate();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (spark) {
        scene.remove(spark);
        spark.dispose();
        invalidate();
      }
    };
  }, [SparkRenderer, gl, scene, invalidate]);

  return null;
}

export function SplatLayer({ modelMatrix = null }: { modelMatrix?: Matrix4 | null }): JSX.Element | null {
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
  const loadedSplatRef = useRef<LoadedSplatMesh | null>(null);
  const loadingNotificationRef = useRef<SplatLoadingNotification | null>(null);
  const progressStartRef = useRef<{ file: File; percent: number } | null>(null);
  const shouldUseSparkBackend = splatBackendResolution.status === 'resolved'
    && splatBackendResolution.backend === 'spark';
  const activeLoadedSplat = loadedSplat?.file === splatFile ? loadedSplat : null;
  const hasLoadedSplat = activeLoadedSplat !== null;
  const showLoadedSplat = showSplats && hasLoadedSplat;

  const clearSplatLoadingNotification = useCallback((file?: File) => {
    const current = loadingNotificationRef.current;
    if (!current || (file && current.file !== file)) {
      return;
    }

    removeNotification(current.id);
    loadingNotificationRef.current = null;
    setUrlLoading(false);
  }, [removeNotification, setUrlLoading]);

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

  const setSplatPhaseProgress = useCallback((file: File, phase: SplatLoadingPhase) => {
    setUrlProgress(getSplatPhaseProgress(file, phase, {
      startPercent: getProgressStartPercent(file),
    }));
  }, [getProgressStartPercent, setUrlProgress]);

  const finishSplatLoading = useCallback((file: File) => {
    clearSplatLoadingNotification(file);
    setUrlProgress(getSplatLoadedProgress(file));
    setUrlLoading(false);
    addNotification('info', `Loaded splat: ${file.name}`, 3000);
  }, [addNotification, clearSplatLoadingNotification, setUrlLoading, setUrlProgress]);

  const failSplatLoading = useCallback((file: File) => {
    clearSplatLoadingNotification(file);
    setUrlLoading(false);
    addNotification('warning', `Failed to load splat: ${file.name}`);
  }, [addNotification, clearSplatLoadingNotification, setUrlLoading]);

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
          failSplatLoading(splatFile);
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
      {showLoadedSplat && <SparkRendererBridge SparkRenderer={sparkModule.SparkRenderer} />}
      {activeLoadedSplat && (
        <primitive
          object={activeLoadedSplat.mesh}
          renderOrder={SPARK_SPLAT_RENDER_ORDER}
          visible={showLoadedSplat}
        />
      )}
    </>
  );
}
