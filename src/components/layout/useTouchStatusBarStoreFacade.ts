import { useReconstructionStore } from '../../store/reconstructionStore';
import { useUIStore } from '../../store/stores/uiStore';
import { useTrainingStore } from '../../store/stores/trainingStore';
import { formatTrainingStatus } from '../training/trainingUiPolicy';

export interface TouchStatusBarStoreFacade {
  fps: ReturnType<typeof useUIStore.getState>['fps'];
  touchUI: ReturnType<typeof useUIStore.getState>['touchUI'];
  autoHideButtons: ReturnType<typeof useUIStore.getState>['autoHideElements']['buttons'];
  isIdle: ReturnType<typeof useUIStore.getState>['isIdle'];
  showAutoHideEditor: ReturnType<typeof useUIStore.getState>['showAutoHideEditor'];
  urlLoading: ReturnType<typeof useReconstructionStore.getState>['urlLoading'];
  reconstruction: ReturnType<typeof useReconstructionStore.getState>['reconstruction'];
  /**
   * Opens the shared keyboard-shortcuts / About panel (HotkeyHelpModal). The
   * flag it sets is transient — deliberately absent from the uiStore persist
   * whitelist — so a reload never reopens the panel.
   */
  setShowHotkeyHelp: ReturnType<typeof useUIStore.getState>['setShowHotkeyHelp'];
  trainingStatus: string | null;
  setTrainingDockOpen: ReturnType<typeof useTrainingStore.getState>['setDockOpen'];
}

export function useTouchStatusBarStoreFacade(): TouchStatusBarStoreFacade {
  const fps = useUIStore((s) => s.fps);
  const touchUI = useUIStore((s) => s.touchUI);
  const autoHideButtons = useUIStore((s) => s.autoHideElements.buttons);
  const isIdle = useUIStore((s) => s.isIdle);
  const showAutoHideEditor = useUIStore((s) => s.showAutoHideEditor);
  const setShowHotkeyHelp = useUIStore((s) => s.setShowHotkeyHelp);
  const urlLoading = useReconstructionStore((s) => s.urlLoading);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const trainingStatus = useTrainingStore((s) => formatTrainingStatus(s.currentJob, s.phase));
  const setTrainingDockOpen = useTrainingStore((s) => s.setDockOpen);

  return {
    fps,
    touchUI,
    autoHideButtons,
    isIdle,
    showAutoHideEditor,
    urlLoading,
    reconstruction,
    setShowHotkeyHelp,
    trainingStatus,
    setTrainingDockOpen,
  };
}
