import type { MouseEvent, PointerEvent, RefObject } from 'react';
import type { ContextMenuAction } from '../../../store';
import { modalStyles } from '../../../theme';
import { formatKeyCombo } from '../../../config/hotkeys';
import { ToggleSwitch } from '../../ui/ToggleSwitch';
import { FloatingWindowShell } from '../../ui/FloatingWindowShell';
import {
  getContextMenuEditorActionStyle,
  getContextMenuEditorContentStyle,
  getContextMenuEditorOverlayStyle,
  getContextMenuEditorPopupStyle,
  getContextMenuEditorSectionGridStyle,
  splitActionsIntoColumns,
  type ContextMenuConfigGroup,
} from './globalContextMenuViewModel';
import type { ActionDef } from './contextMenuActions';
import {
  stopContextMenuSurfaceMouseEvent,
  stopContextMenuSurfacePointerEvent,
  suppressContextMenuSurfaceContextMenu,
} from './contextMenuDomEvents';

interface ContextMenuEditorProps {
  popupRef: RefObject<HTMLDivElement | null>;
  zIndex: number;
  position: { x: number; y: number };
  groupedActions: ContextMenuConfigGroup<ActionDef>[];
  enabledActionIds: readonly ContextMenuAction[];
  onToggleAction: (actionId: ContextMenuAction) => void;
  onClose: () => void;
  onDragStart: (event: MouseEvent) => void;
  onMouseDown: () => void;
}

export function ContextMenuEditor({
  popupRef,
  zIndex,
  position,
  groupedActions,
  enabledActionIds,
  onToggleAction,
  onClose,
  onDragStart,
  onMouseDown,
}: ContextMenuEditorProps) {
  const handlePanelPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    stopContextMenuSurfacePointerEvent(event);
  };

  const handlePanelMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    stopContextMenuSurfaceMouseEvent(event);
    onMouseDown();
  };

  const renderAction = (action: ActionDef) => (
    <label
      key={action.id}
      className="flex items-center gap-2 cursor-pointer hover-ds-hover rounded px-2 py-1"
      style={getContextMenuEditorActionStyle()}
    >
      <span className="w-4 h-4 flex-shrink-0 opacity-60">{action.icon}</span>
      <span className="text-sm text-ds-primary whitespace-nowrap">{action.label}</span>
      {action.hotkey && (
        <span className="text-xs font-mono text-gray-500 uppercase tracking-wide">
          ({formatKeyCombo(action.hotkey)})
        </span>
      )}
      <span className="ml-auto">
        <ToggleSwitch
          checked={enabledActionIds.includes(action.id)}
          onChange={() => onToggleAction(action.id)}
        />
      </span>
    </label>
  );

  const renderSection = (group: ContextMenuConfigGroup<ActionDef>, colCount = 1) => {
    const columns = splitActionsIntoColumns(group.actions, colCount);
    return (
      <div key={group.section} className="col-span-3">
        <div className="text-xs font-medium text-ds-muted uppercase tracking-wide mb-1 px-1">
          {group.label}
        </div>
        <div
          className="grid gap-x-4"
          style={getContextMenuEditorSectionGridStyle(colCount)}
        >
          {columns.map((colActions, colIndex) => (
            <div key={colIndex}>
              {colActions.map(renderAction)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const viewSection = groupedActions.find(g => g.section === 'view');
  const displaySection = groupedActions.find(g => g.section === 'display');
  const camerasSection = groupedActions.find(g => g.section === 'cameras');
  const transformSection = groupedActions.find(g => g.section === 'transform');
  const exportSection = groupedActions.find(g => g.section === 'export');

  return (
    <FloatingWindowShell
      isOpen
      title="Edit Context Menu"
      onClose={onClose}
      panelRef={popupRef}
      panelTestId="context-menu-editor"
      panelClassName={modalStyles.toolPanel + ' context-menu-edit-responsive'}
      overlayStyle={getContextMenuEditorOverlayStyle(zIndex)}
      panelStyle={getContextMenuEditorPopupStyle(position)}
      onPanelPointerDown={handlePanelPointerDown}
      onPanelMouseDown={handlePanelMouseDown}
      onPanelContextMenu={suppressContextMenuSurfaceContextMenu}
      onHeaderMouseDown={onDragStart}
      portal
      renderCloseIcon={(
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      )}
    >
        <div className="p-4 overflow-y-auto" style={getContextMenuEditorContentStyle()}>
          <div className="text-ds-secondary text-xs mb-3">
            Select which actions appear in the right-click menu.
          </div>

          <div className="grid grid-cols-3 gap-x-5 gap-y-3">
            {viewSection && renderSection(viewSection, 3)}
            {displaySection && renderSection(displaySection, 3)}
            {camerasSection && renderSection(camerasSection, 3)}
            {transformSection && renderSection(transformSection, 3)}
            {exportSection && renderSection(exportSection, 3)}
          </div>

          <div className="mt-4 pt-3">
            <button
              onClick={onClose}
              className={modalStyles.actionButtonPrimary}
            >
              Done
            </button>
          </div>
        </div>
    </FloatingWindowShell>
  );
}
