import {
  useUIStore,
  type ContextMenuAction,
} from '../../../store';
import type { MenuPosition } from './globalContextMenuViewModel';

export interface GlobalContextMenuStoreFacadeData {
  contextMenuPosition: MenuPosition | null;
  contextMenuActions: ContextMenuAction[];
  showEditPopup: boolean;
  galleryCollapsed: boolean;
}

export interface GlobalContextMenuStoreFacadeActions {
  closeContextMenu: () => void;
  addContextMenuAction: (action: ContextMenuAction) => void;
  removeContextMenuAction: (action: ContextMenuAction) => void;
  openEditPopup: () => void;
  closeContextMenuEditor: () => void;
}

export interface GlobalContextMenuStoreFacade {
  data: GlobalContextMenuStoreFacadeData;
  actions: GlobalContextMenuStoreFacadeActions;
}

export function useGlobalContextMenuStoreFacade(): GlobalContextMenuStoreFacade {
  const contextMenuPosition = useUIStore((s) => s.contextMenuPosition);
  const contextMenuActions = useUIStore((s) => s.contextMenuActions);
  const closeContextMenu = useUIStore((s) => s.closeContextMenu);
  const addContextMenuAction = useUIStore((s) => s.addContextMenuAction);
  const removeContextMenuAction = useUIStore((s) => s.removeContextMenuAction);
  const showEditPopup = useUIStore((s) => s.showContextMenuEditor);
  const openEditPopup = useUIStore((s) => s.openContextMenuEditor);
  const closeContextMenuEditor = useUIStore((s) => s.closeContextMenuEditor);
  const galleryCollapsed = useUIStore((s) => s.galleryCollapsed);

  return {
    data: {
      contextMenuPosition,
      contextMenuActions,
      showEditPopup,
      galleryCollapsed,
    },
    actions: {
      closeContextMenu,
      addContextMenuAction,
      removeContextMenuAction,
      openEditPopup,
      closeContextMenuEditor,
    },
  };
}
