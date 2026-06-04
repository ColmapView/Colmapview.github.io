import { useReconstructionStore } from '../../store/reconstructionStore';
import { useUIStore } from '../../store/stores/uiStore';

export interface StatusBarStoreFacade {
  urlLoading: ReturnType<typeof useReconstructionStore.getState>['urlLoading'];
  reconstruction: ReturnType<typeof useReconstructionStore.getState>['reconstruction'];
  wasmReconstruction: ReturnType<typeof useReconstructionStore.getState>['wasmReconstruction'];
  fps: ReturnType<typeof useUIStore.getState>['fps'];
  autoHideButtons: ReturnType<typeof useUIStore.getState>['autoHideElements']['buttons'];
  isIdle: ReturnType<typeof useUIStore.getState>['isIdle'];
  showAutoHideEditor: ReturnType<typeof useUIStore.getState>['showAutoHideEditor'];
}

export function useStatusBarStoreFacade(): StatusBarStoreFacade {
  const urlLoading = useReconstructionStore((s) => s.urlLoading);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);
  const fps = useUIStore((s) => s.fps);
  const autoHideButtons = useUIStore((s) => s.autoHideElements.buttons);
  const isIdle = useUIStore((s) => s.isIdle);
  const showAutoHideEditor = useUIStore((s) => s.showAutoHideEditor);

  return {
    urlLoading,
    reconstruction,
    wasmReconstruction,
    fps,
    autoHideButtons,
    isIdle,
    showAutoHideEditor,
  };
}
