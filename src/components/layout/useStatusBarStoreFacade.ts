import { useReconstructionStore } from '../../store/reconstructionStore';
import { useUIStore } from '../../store/stores/uiStore';

export interface StatusBarStoreFacade {
  urlLoading: ReturnType<typeof useReconstructionStore.getState>['urlLoading'];
  reconstruction: ReturnType<typeof useReconstructionStore.getState>['reconstruction'];
  wasmReconstruction: ReturnType<typeof useReconstructionStore.getState>['wasmReconstruction'];
  fps: ReturnType<typeof useUIStore.getState>['fps'];
}

export function useStatusBarStoreFacade(): StatusBarStoreFacade {
  const urlLoading = useReconstructionStore((s) => s.urlLoading);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);
  const fps = useUIStore((s) => s.fps);

  return {
    urlLoading,
    reconstruction,
    wasmReconstruction,
    fps,
  };
}
