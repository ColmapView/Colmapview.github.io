import { useCallback } from 'react';
import type { ContextMenuAction } from '../../../store';
import { executeGlobalContextMenuAction } from './globalContextMenuActionExecutor';
import { shouldCloseContextMenuAfterAction } from './globalContextMenuViewModel';
import { useGlobalContextMenuActionDeps } from './useGlobalContextMenuActionDeps';

interface GlobalContextMenuActionExecutorOptions {
  closeContextMenu: () => void;
  openEditPopup: () => void;
}

export function useGlobalContextMenuActionExecutor({
  closeContextMenu,
  openEditPopup,
}: GlobalContextMenuActionExecutorOptions): (actionId: ContextMenuAction) => Promise<void> {
  const actionDeps = useGlobalContextMenuActionDeps({ openEditPopup });

  return useCallback(async (actionId: ContextMenuAction) => {
    await executeGlobalContextMenuAction(actionId, actionDeps);

    if (shouldCloseContextMenuAfterAction(actionId)) {
      closeContextMenu();
    }
  }, [actionDeps, closeContextMenu]);
}
