import { useReconstructionStore } from '../../store/reconstructionStore';
import { useUIStore } from '../../store/stores/uiStore';

export interface TouchStatusBarStoreFacade {
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
}

export function useTouchStatusBarStoreFacade(): TouchStatusBarStoreFacade {
  const touchUI = useUIStore((s) => s.touchUI);
  const autoHideButtons = useUIStore((s) => s.autoHideElements.buttons);
  const isIdle = useUIStore((s) => s.isIdle);
  const showAutoHideEditor = useUIStore((s) => s.showAutoHideEditor);
  const setShowHotkeyHelp = useUIStore((s) => s.setShowHotkeyHelp);
  const urlLoading = useReconstructionStore((s) => s.urlLoading);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);

  return {
    touchUI,
    autoHideButtons,
    isIdle,
    showAutoHideEditor,
    urlLoading,
    reconstruction,
    setShowHotkeyHelp,
  };
}
