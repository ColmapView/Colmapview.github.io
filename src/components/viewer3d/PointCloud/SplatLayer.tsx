import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { useThree } from '@react-three/fiber';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { appLogger } from '../../../utils/logger';
import { useSplatLayerStoreFacade } from './SplatLayerStoreFacade';

interface LoadedSplatMesh {
  file: File;
  mesh: SplatMesh;
}

function SparkRendererBridge() {
  const { gl, scene, invalidate } = useThree();

  useEffect(() => {
    const spark = new SparkRenderer({
      renderer: gl,
      onDirty: invalidate,
    });

    scene.add(spark);
    invalidate();

    return () => {
      scene.remove(spark);
      spark.dispose();
      invalidate();
    };
  }, [gl, scene, invalidate]);

  return null;
}

export function SplatLayer(): JSX.Element | null {
  const {
    data: {
      showSplats,
      splatFile,
    },
  } = useSplatLayerStoreFacade();
  const { invalidate } = useThree();
  const [loadedSplat, setLoadedSplat] = useState<LoadedSplatMesh | null>(null);
  const loadedSplatRef = useRef<LoadedSplatMesh | null>(null);

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
      loadedSplatRef.current?.mesh.dispose();
      loadedSplatRef.current = null;
    };
  }, []);

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

    const sourceFile = splatFile;
    let cancelled = false;
    let mesh: SplatMesh | null = null;
    let committed = false;

    if (loadedSplatRef.current && loadedSplatRef.current.file !== sourceFile) {
      queueMicrotask(() => {
        if (!cancelled && loadedSplatRef.current?.file !== sourceFile) {
          replaceLoadedSplat(null);
        }
      });
    }

    async function loadSplat(): Promise<void> {
      const fileBytes = await sourceFile.arrayBuffer();

      if (cancelled) {
        return;
      }

      mesh = new SplatMesh({
        fileBytes: new Uint8Array(fileBytes),
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
      invalidate();
    }

    void loadSplat().catch((error: unknown) => {
      mesh?.dispose();
      mesh = null;
      if (!cancelled) {
        appLogger.warn(
          `[Splats] Failed to load ${sourceFile.name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    return () => {
      cancelled = true;
      if (!committed) {
        mesh?.dispose();
      }
    };
  }, [splatFile, invalidate, replaceLoadedSplat]);

  if (!splatFile) {
    return null;
  }

  const showLoadedSplat = showSplats && loadedSplat?.file === splatFile;

  return (
    <>
      <SparkRendererBridge />
      {showLoadedSplat && <primitive object={loadedSplat.mesh} renderOrder={2} />}
    </>
  );
}
