import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { ContextMenuAction } from '../../../store';
import { useModalZIndex } from '../../../hooks/useModalZIndex';
import { useResetKeyedState } from '../../../hooks/useResetKeyedState';
import { shouldCloseForOutsideMouseDown } from '../../../hooks/clickOutsidePolicy';
import {
  getActionById,
  getAdjustedContextMenuPosition,
  getCenteredPopupPosition,
  getContextMenuEditorPositionResetKey,
  getContextMenuPositionResetKey,
  getInitialContextMenuEditorPosition,
  groupConfigurableActions,
  groupContextMenuActions,
  type MenuPosition,
} from './globalContextMenuViewModel';
import { ContextMenuEditor } from './ContextMenuEditor';
import { ContextMenuList } from './ContextMenuList';
import {
  CONFIGURABLE_CONTEXT_MENU_ACTIONS,
  CONTEXT_MENU_ACTIONS,
} from './contextMenuActions';
import { useGlobalContextMenuActionExecutor } from './useGlobalContextMenuActionExecutor';
import {
  getGlobalContextMenuKeyDismissAction,
  getGlobalContextMenuPointerDismissAction,
  type GlobalContextMenuDismissAction,
} from './globalContextMenuDismissPolicy';
import { useGlobalContextMenuStoreFacade } from './useGlobalContextMenuStoreFacade';

function getViewportSize(): { width: number; height: number } {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function GlobalContextMenu() {
  const menuRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Edit popup drag state
  const [isEditDragging, setIsEditDragging] = useState(false);
  const editDragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const {
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
  } = useGlobalContextMenuStoreFacade();

  // Z-index for edit popup
  const { zIndex: editZIndex, bringToFront: bringEditToFront } = useModalZIndex(showEditPopup);

  const viewportSize = getViewportSize();
  const initialEditPosition = getInitialContextMenuEditorPosition({
    showEditPopup,
    viewportWidth: viewportSize.width,
    viewportHeight: viewportSize.height,
  });
  const [editPosition, setEditPosition] = useResetKeyedState(
    getContextMenuEditorPositionResetKey(showEditPopup),
    initialEditPosition
  );
  const [adjustedPosition, setAdjustedPosition] = useResetKeyedState<MenuPosition | null>(
    getContextMenuPositionResetKey({
      position: contextMenuPosition,
      actionIds: contextMenuActions,
      galleryCollapsed,
    }),
    null
  );

  const executeAction = useGlobalContextMenuActionExecutor({
    closeContextMenu,
    openEditPopup,
  });

  // Toggle action in config
  const toggleActionConfig = useCallback((actionId: ContextMenuAction) => {
    if (contextMenuActions.includes(actionId)) {
      removeContextMenuAction(actionId);
    } else {
      addContextMenuAction(actionId);
    }
  }, [contextMenuActions, addContextMenuAction, removeContextMenuAction]);

  // Close edit popup
  const closeEditPopup = useCallback(() => {
    closeContextMenuEditor();
    closeContextMenu();
  }, [closeContextMenu, closeContextMenuEditor]);

  // Center edit popup when opened
  useEffect(() => {
    if (!showEditPopup) return;

    const { width: viewportWidth, height: viewportHeight } = getViewportSize();
    const frameId = requestAnimationFrame(() => {
      if (!popupRef.current) return;

      const rect = popupRef.current.getBoundingClientRect();
      setEditPosition(getCenteredPopupPosition({
        viewportWidth,
        viewportHeight,
        popupWidth: rect.width,
        popupHeight: rect.height,
      }));
    });

    return () => cancelAnimationFrame(frameId);
  }, [showEditPopup, setEditPosition]);

  // Edit popup drag handlers
  const handleEditDragStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    setIsEditDragging(true);
    editDragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: editPosition.x,
      posY: editPosition.y,
    };
  }, [editPosition]);

  useEffect(() => {
    if (!isEditDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      setEditPosition({
        x: editDragStart.current.posX + e.clientX - editDragStart.current.x,
        y: editDragStart.current.posY + e.clientY - editDragStart.current.y,
      });
    };
    const handleMouseUp = () => setIsEditDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isEditDragging, setEditPosition]);

  // Close on click outside
  useEffect(() => {
    if (!contextMenuPosition && !showEditPopup) return;

    const runDismissAction = (action: GlobalContextMenuDismissAction) => {
      if (action === 'closeEditor') {
        closeEditPopup();
      } else if (action === 'closeMenu') {
        closeContextMenu();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      runDismissAction(getGlobalContextMenuPointerDismissAction({
        showEditPopup,
        clickedOutsideMenu: shouldCloseForOutsideMouseDown(menuRef.current, e.target),
        clickedOutsideEditor: shouldCloseForOutsideMouseDown(popupRef.current, e.target),
      }));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      runDismissAction(getGlobalContextMenuKeyDismissAction({
        showEditPopup,
        key: e.key,
      }));
    };

    // Delay adding listener to avoid immediate close from the triggering click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenuPosition, showEditPopup, closeContextMenu, closeEditPopup]);

  // Calculate adjusted position to keep menu in viewport
  useLayoutEffect(() => {
    if (!contextMenuPosition || !menuRef.current) {
      return;
    }

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    // Use measured dimensions or fallback to reasonable estimates
    const menuWidth = rect.width > 0 ? rect.width : 200;
    const menuHeight = rect.height > 0 ? rect.height : 400;

    setAdjustedPosition(getAdjustedContextMenuPosition({
      position: contextMenuPosition,
      menuWidth,
      menuHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      galleryCollapsed,
    }));
  }, [contextMenuPosition, contextMenuActions, galleryCollapsed, setAdjustedPosition]); // Re-run when actions or gallery state changes

  if (!contextMenuPosition && !showEditPopup) return null;

  const groupedActions = groupContextMenuActions(CONTEXT_MENU_ACTIONS, contextMenuActions);

  // Get the Edit Menu action
  const editMenuAction = getActionById(CONTEXT_MENU_ACTIONS, 'editMenu')!;

  // Group configurable actions by section for edit popup
  const groupedConfigActions = groupConfigurableActions(CONFIGURABLE_CONTEXT_MENU_ACTIONS);

  // Edit popup
  if (showEditPopup) {
    return (
      <ContextMenuEditor
        popupRef={popupRef}
        zIndex={editZIndex}
        position={editPosition}
        groupedActions={groupedConfigActions}
        enabledActionIds={contextMenuActions}
        onToggleAction={toggleActionConfig}
        onClose={closeEditPopup}
        onDragStart={handleEditDragStart}
        onMouseDown={bringEditToFront}
      />
    );
  }

  // Use adjusted position if available, otherwise use original (for initial measurement)
  const displayPosition = adjustedPosition ?? contextMenuPosition;

  return (
    <ContextMenuList
      menuRef={menuRef}
      position={displayPosition}
      isPositionAdjusted={adjustedPosition !== null}
      groupedActions={groupedActions}
      editMenuAction={editMenuAction}
      onAction={executeAction}
    />
  );
}

// Export for configuration UI
export { CONTEXT_MENU_ACTIONS } from './contextMenuActions';
export type { ActionDef } from './contextMenuActions';
