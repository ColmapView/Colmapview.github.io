import { useEffect, useMemo, useRef, type JSX } from 'react';
import type * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { appLogger } from '../../utils/logger';
import {
  createWebGpuSplatFrameSnapshot,
  registerWebGpuSplatCanvasHost,
  resizeWebGpuSplatCanvas,
  syncWebGpuSplatFrameSnapshot,
  type WebGpuSplatFrameSnapshot,
} from './WebGpuSplatCanvasRuntime';
import type { VisibleWebGpuSplatRendererAdapter } from '../../splat/webgpu/visibleSplatRendererAdapter';
import { isWebGpuGaussianCloudFile } from './WebGpuSplatCanvasLayerPolicy';

export function WebGpuSplatCanvasLayer({
  mounted,
  visible,
  splatFile,
  onRuntimeReady,
  onRuntimeFailed,
}: {
  mounted?: boolean;
  visible: boolean;
  splatFile?: File;
  onRuntimeReady?: () => void;
  onRuntimeFailed?: (reason: string) => void;
}): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<VisibleWebGpuSplatRendererAdapter | null>(null);
  const latestFrameRef = useRef<WebGpuSplatFrameSnapshot | null>(null);
  const readyReportedRef = useRef(false);
  const shouldMount = mounted ?? visible;

  const reportReady = useMemo(() => {
    return () => {
      if (readyReportedRef.current) {
        return;
      }

      readyReportedRef.current = true;
      onRuntimeReady?.();
    };
  }, [onRuntimeReady]);

  useEffect(() => {
    if (!shouldMount || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    return registerWebGpuSplatCanvasHost({
      canvas,
      setFrameSnapshot(snapshot: WebGpuSplatFrameSnapshot) {
        resizeWebGpuSplatCanvas(canvas, snapshot.viewport);
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

    function reportFailure(reason: string): void {
      if (cancelled || failureReported) {
        return;
      }

      failureReported = true;
      appLogger.warn(`[WebGPU Splats] Failed to initialize runtime for ${sourceFile.name}: ${reason}`);
      onRuntimeFailed?.(reason);
    }

    async function initializeAndLoad(): Promise<void> {
      try {
        const { loadGaussianCloudFromFile } = await import('../../splat/gaussianCloudLoader');
        const loaded = await loadGaussianCloudFromFile(sourceFile);
        if (cancelled) return;

        appLogger.info(
          `[WebGPU Splats] Loaded ${sourceFile.name}: ${loaded.cloud.count.toLocaleString()} gaussians, SH degree ${loaded.cloud.shDegree}, SH ${formatByteSize(loaded.cloud.shN?.byteLength ?? 0)}`
        );

        const { createLoadedVisibleWebGpuSplatRendererAdapter } = await import(
          '../../splat/webgpu/visibleSplatRendererAdapter'
        );
        const nextRenderer = await createLoadedVisibleWebGpuSplatRendererAdapter(canvas, loaded.cloud, {
          sceneId: createVisibleSplatSceneId(loaded.file),
          labelPrefix: `webgpu splat ${loaded.file.name}`,
        }, {
          onFirstFrame: () => {
            if (!cancelled) {
              reportReady();
            }
          },
          onError: reportFailure,
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
        reportFailure(reason);
      }
    }

    void initializeAndLoad();

    return () => {
      cancelled = true;
      renderer?.dispose();
      if (rendererRef.current === renderer) {
        rendererRef.current = null;
      }
    };
  }, [onRuntimeFailed, reportReady, shouldMount, splatFile]);

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

function createVisibleSplatSceneId(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
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
