import { useEffect, useRef, useState, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { Group } from 'three';
import { trainingPreviewController } from '../../training/previewController';
import { createTrainingWebGpuDrawProbe, trainingDrawProbe } from '../../training/trainingDrawProbe';
import { getSplatMeshSourceOptions, preloadSparkModule, type SparkModule } from '../../utils/sparkSplatRuntime';
import { SparkRendererBridge } from './PointCloud/SplatLayer';
import { registerWebGpuSplatCanvasHost, resizeWebGpuSplatCanvas } from './WebGpuSplatCanvasRuntime';
import type { VisibleWebGpuSplatRendererAdapter } from '../../splat/webgpu/visibleSplatRendererAdapter';
import { getBrowserWebGpuProvider, requestPreferredWebGpuSplatAdapter } from '../../splat/webgpu/webGpuSplatDevice';
import { getWebGpuSplatDebugCounters } from '../../splat/webgpu/webGpuSplatDebugCounters';
import { validateGaussianPlyFile } from '../../parsers/plyPointCloud';
import { shouldStartSparkSplatRuntimePreload } from '../../utils/splatBackendPolicy';
import { setTrainingPreviewError, useTrainingSparkBackendFacade } from '../../training/useTrainingPreviewStoreFacade';

/** Mounted inside the existing COLMAP transform group: camera/overlays stay put. */
export function TrainingSparkPreview({ visible }: { visible: boolean }) {
  const { invalidate, gl, camera } = useThree();
  const [group] = useState(() => new Group());
  const [spark, setSpark] = useState<SparkModule | null>(null);
  const {
    requestedBackend,
    availability,
    setSparkBackendAvailable,
    setSparkPreloadFailed,
  } = useTrainingSparkBackendFacade();
  const ready = useCallback(() => invalidate(), [invalidate]);
  useEffect(() => {
    if (!shouldStartSparkSplatRuntimePreload(requestedBackend, availability)) return;
    let cancelled = false;
    void preloadSparkModule()
      .then((module) => {
        setSparkBackendAvailable(true);
        if (!cancelled) setSpark(module);
      })
      .catch((error: unknown) => {
        setSparkPreloadFailed();
        if (!cancelled) {
          setTrainingPreviewError(error instanceof Error ? error.message : 'Spark could not load.');
        }
      });
    return () => { cancelled = true; };
  }, [availability, requestedBackend, setSparkBackendAvailable, setSparkPreloadFailed]);
  useEffect(() => {
    if (!spark) return;
    return trainingPreviewController.bindRenderer({
      inspect: () => ({ backend: 'spark', meshes: group.children.length, textures: gl.info.memory.textures,
        camera: camera.matrixWorld.toArray(), modelMatrix: group.matrixWorld.toArray() }),
      async decode(file, isCurrent) {
        if (file.name.toLowerCase().endsWith('.ply')) await validateGaussianPlyFile(file);
        const options = await getSplatMeshSourceOptions(file);
        if (!isCurrent()) return { commit() {}, dispose() {} };
        const mesh = new spark.SplatMesh({ ...options, fileName: file.name, raycastable: false });
        mesh.name = 'training-splat';
        let disposed = false;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          group.remove(mesh);
          mesh.dispose();
          invalidate();
        };
        try { await mesh.initialized; } catch (error) { dispose(); throw error; }
        return { commit() {
          trainingDrawProbe?.register(mesh, file, mesh.numSplats);
          group.add(mesh);
          invalidate();
        }, dispose };
      },
    });
  }, [camera, gl, group, invalidate, spark]);
  return <>
    {spark && <SparkRendererBridge SparkRenderer={spark.SparkRenderer} onReadyChange={ready} />}
    <primitive object={group} visible={visible} />
  </>;
}

/** One WebGPU device/canvas, with only its current and prepared replacement cloud. */
export function TrainingWebGpuPreview({ visible, onReady, onFailed }: {
  visible: boolean;
  onReady(): void;
  onFailed(reason: string): void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current!;
    let cancelled = false;
    let renderer: VisibleWebGpuSplatRendererAdapter | null = null;
    let unbind: (() => void) | undefined;
    let frame: Parameters<VisibleWebGpuSplatRendererAdapter['setFrameSnapshot']>[0] | null = null;
    const unregister = registerWebGpuSplatCanvasHost({
      canvas,
      setFrameSnapshot(snapshot) {
        resizeWebGpuSplatCanvas(canvas, snapshot.viewport);
        frame = snapshot;
        renderer?.setFrameSnapshot(snapshot);
      },
    });
    void (async () => {
      const { createVisibleWebGpuSplatRendererAdapter } = await import('../../splat/webgpu/visibleSplatRendererAdapter');
      const gpu = getBrowserWebGpuProvider();
      if (!gpu) throw new Error('WebGPU is not supported by this browser.');
      const adapter = await requestPreferredWebGpuSplatAdapter(gpu);
      if (!adapter) throw new Error('WebGPU adapter is unavailable.');
      if (cancelled) return;
      // Request supported buffer limits once. This does not allocate their size;
      // it lets the full final cloud use hardware capacity beyond portable defaults.
      const created = await createVisibleWebGpuSplatRendererAdapter(canvas, {
        onError: onFailed, adapter, requiredLimits: {
          maxBufferSize: adapter.limits.maxBufferSize,
          maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        },
      });
      if (cancelled) { created.dispose(); return; }
      renderer = created;
      if (frame) created.setFrameSnapshot(frame);
      unbind = trainingPreviewController.bindRenderer({
        inspect: () => ({ backend: 'webgpu', ...getWebGpuSplatDebugCounters(),
          camera: frame ? Array.from(frame.camera.worldMatrix) : null }),
        async decode(file, isCurrent) {
          if (file.name.toLowerCase().endsWith('.ply')) await validateGaussianPlyFile(file);
          const { loadGaussianCloudFromFile } = await import('../../splat/gaussianCloudLoader');
          const loaded = await loadGaussianCloudFromFile(file);
          if (!isCurrent()) return { commit() {}, dispose() {} };
          if (!created.prepareCloud) throw new Error('Renderer does not support live replacements.');
          return created.prepareCloud(loaded.cloud, {
            sceneId: `training:${crypto.randomUUID()}`,
            // The session callback follows a real canvas queue submission.
            // WebGPU does not expose Spark's active/culling count; leave it unknown.
            onFirstFrame: createTrainingWebGpuDrawProbe(file, loaded.cloud.count),
          });
        },
      });
      onReady();
    })().catch((error: unknown) => {
      if (!cancelled) {
        const message = error instanceof Error ? error.message : 'WebGPU preview unavailable.';
        setTrainingPreviewError(message);
        onFailed(message);
      }
    });
    return () => { cancelled = true; unbind?.(); unregister(); renderer?.dispose(); };
  }, [onFailed, onReady]);
  return <canvas ref={canvasRef} data-testid="training-webgpu-canvas" aria-hidden="true"
    className={`pointer-events-none absolute inset-0 z-0 h-full w-full ${visible ? 'opacity-100' : 'opacity-0'}`} />;
}
