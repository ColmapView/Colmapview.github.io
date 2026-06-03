import { useUIStore } from '../../store/stores/uiStore';

export interface ControlButtonStoreFacade {
  touchMode: boolean;
  contextMenuOpen: boolean;
}

export function useControlButtonStoreFacade(): ControlButtonStoreFacade {
  const touchMode = useUIStore((s) => s.touchMode);
  const contextMenuOpen = useUIStore((s) => s.contextMenuPosition !== null || s.showContextMenuEditor);

  return {
    touchMode,
    contextMenuOpen,
  };
}
