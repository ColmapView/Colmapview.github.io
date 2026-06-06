import type { RefObject } from 'react';
import type { ContextMenuAction } from '../../../store';
import { contextMenuStyles } from '../../../theme';
import { formatKeyCombo } from '../../../config/hotkeys';
import {
  getContextMenuListStyle,
  type ContextMenuActionGroup,
  type MenuPosition,
} from './globalContextMenuViewModel';
import type { ActionDef } from './contextMenuActions';
import {
  stopContextMenuSurfaceMouseEvent,
  stopContextMenuSurfacePointerEvent,
  suppressContextMenuSurfaceContextMenu,
} from './contextMenuDomEvents';

interface ContextMenuListProps {
  menuRef: RefObject<HTMLDivElement | null>;
  position: MenuPosition | null;
  isPositionAdjusted: boolean;
  groupedActions: ContextMenuActionGroup<ActionDef>[];
  editMenuAction: ActionDef;
  onAction: (actionId: ContextMenuAction) => void | Promise<void>;
}

export function ContextMenuList({
  menuRef,
  position,
  isPositionAdjusted,
  groupedActions,
  editMenuAction,
  onAction,
}: ContextMenuListProps) {
  return (
    <div
      ref={menuRef}
      className={contextMenuStyles.container}
      data-idle-pause="true"
      data-testid="context-menu"
      onPointerDown={stopContextMenuSurfacePointerEvent}
      onMouseDown={stopContextMenuSurfaceMouseEvent}
      onContextMenu={suppressContextMenuSurfaceContextMenu}
      style={getContextMenuListStyle({ position, isPositionAdjusted })}
    >
      {groupedActions.map((group, groupIndex) => (
        <div key={group.section}>
          {groupIndex > 0 && <div className="border-t border-ds my-1" />}
          {group.actions.map((action) => (
            <button
              key={action.id}
              className={contextMenuStyles.button}
              onClick={() => void onAction(action.id)}
            >
              <span className={contextMenuStyles.icon}>{action.icon}</span>
              <span className="flex-1">{action.label}</span>
              {action.hotkey && (
                <span className={contextMenuStyles.hotkey}>
                  ({formatKeyCombo(action.hotkey)})
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
      <div className="border-t border-ds my-1" />
      <button
        className={contextMenuStyles.button}
        onClick={() => void onAction('editMenu')}
      >
        <span className={contextMenuStyles.icon}>{editMenuAction.icon}</span>
        {editMenuAction.label}
      </button>
    </div>
  );
}
