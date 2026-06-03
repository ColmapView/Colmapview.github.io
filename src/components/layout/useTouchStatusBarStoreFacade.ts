import { useReconstructionStore } from '../../store/reconstructionStore';
import { useUIStore } from '../../store/stores/uiStore';

export interface TouchStatusBarStoreFacade {
  fps: ReturnType<typeof useUIStore.getState>['fps'];
  touchUI: ReturnType<typeof useUIStore.getState>['touchUI'];
  urlLoading: ReturnType<typeof useReconstructionStore.getState>['urlLoading'];
  reconstruction: ReturnType<typeof useReconstructionStore.getState>['reconstruction'];
}

export function useTouchStatusBarStoreFacade(): TouchStatusBarStoreFacade {
  const fps = useUIStore((s) => s.fps);
  const touchUI = useUIStore((s) => s.touchUI);
  const urlLoading = useReconstructionStore((s) => s.urlLoading);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);

  return {
    fps,
    touchUI,
    urlLoading,
    reconstruction,
  };
}
