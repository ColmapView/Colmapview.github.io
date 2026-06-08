import type { GaussianSceneResourceManager } from './gaussianSceneResourceManager';

export interface VisibleWebGpuSplatSharedRuntime {
  sceneId: string;
  device: GPUDevice;
  sceneResourceManager: Pick<GaussianSceneResourceManager, 'acquire'>;
}

const visibleRuntimes = new Map<string, VisibleWebGpuSplatSharedRuntime>();

export function createVisibleWebGpuSplatSceneId(file: Pick<File, 'name' | 'size' | 'lastModified'>): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function registerVisibleWebGpuSplatSharedRuntime(
  runtime: VisibleWebGpuSplatSharedRuntime
): () => void {
  visibleRuntimes.set(runtime.sceneId, runtime);
  return () => {
    if (visibleRuntimes.get(runtime.sceneId) === runtime) {
      visibleRuntimes.delete(runtime.sceneId);
    }
  };
}

export function getVisibleWebGpuSplatSharedRuntime(
  sceneId: string
): VisibleWebGpuSplatSharedRuntime | null {
  return visibleRuntimes.get(sceneId) ?? null;
}

export function clearVisibleWebGpuSplatSharedRuntimesForTests(): void {
  visibleRuntimes.clear();
}
