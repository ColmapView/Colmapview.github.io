import { useReconstructionStore } from '../../store/reconstructionStore';
import { useUIStore } from '../../store/stores/uiStore';

export interface TouchStatusBarStoreFacade {
  fps: ReturnType<typeof useUIStore.getState>['fps'];
  touchUI: ReturnType<typeof useUIStore.getState>['touchUI'];
  autoHideButtons: ReturnType<typeof useUIStore.getState>['autoHideElements']['buttons'];
  isIdle: ReturnType<typeof useUIStore.getState>['isIdle'];
  showAutoHideEditor: ReturnType<typeof useUIStore.getState>['showAutoHideEditor'];
  urlLoading: ReturnType<typeof useReconstructionStore.getState>['urlLoading'];
  reconstruction: ReturnType<typeof useReconstructionStore.getState>['reconstruction'];
}

export function useTouchStatusBarStoreFacade(): TouchStatusBarStoreFacade {
  const fps = useUIStore((s) => s.fps);
  const touchUI = useUIStore((s) => s.touchUI);
  const autoHideButtons = useUIStore((s) => s.autoHideElements.buttons);
  const isIdle = useUIStore((s) => s.isIdle);
  const showAutoHideEditor = useUIStore((s) => s.showAutoHideEditor);
  const urlLoading = useReconstructionStore((s) => s.urlLoading);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);

  return {
    fps,
    touchUI,
    autoHideButtons,
    isIdle,
    showAutoHideEditor,
    urlLoading,
    reconstruction,
  };
}
