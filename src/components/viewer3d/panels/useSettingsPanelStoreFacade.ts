import {
  useUIStore,
  type UIState,
} from '../../../store';

interface SettingsPanelUiFacade {
  idleHideTimeout: number;
  setIdleHideTimeout: UIState['setIdleHideTimeout'];
  setShowAutoHideEditor: UIState['setShowAutoHideEditor'];
  openContextMenuEditor: UIState['openContextMenuEditor'];
  setShowHotkeyHelp: UIState['setShowHotkeyHelp'];
}

export interface SettingsPanelStoreFacade {
  ui: SettingsPanelUiFacade;
}

export function useSettingsPanelStoreFacade(): SettingsPanelStoreFacade {
  const idleHideTimeout = useUIStore((s) => s.idleHideTimeout);
  const setIdleHideTimeout = useUIStore((s) => s.setIdleHideTimeout);
  const setShowAutoHideEditor = useUIStore((s) => s.setShowAutoHideEditor);
  const openContextMenuEditor = useUIStore((s) => s.openContextMenuEditor);
  const setShowHotkeyHelp = useUIStore((s) => s.setShowHotkeyHelp);

  return {
    ui: {
      idleHideTimeout,
      setIdleHideTimeout,
      setShowAutoHideEditor,
      openContextMenuEditor,
      setShowHotkeyHelp,
    },
  };
}
