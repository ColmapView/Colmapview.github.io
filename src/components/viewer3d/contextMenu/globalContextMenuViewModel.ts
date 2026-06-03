import type { CSSProperties } from 'react';
import type { ContextMenuAction } from '../../../store';
import { Z_INDEX } from '../../../theme/zIndex';

export {
  getNextBackgroundColor,
  getNextCycleValue,
  getNextFlySpeed,
  getNextImagePlanesMenuState,
  getNextMatchesMenuState,
  getNextMinTrackLength,
  getNextPickingMode,
  getNextPointColorMenuState,
  getNextPointSize,
  getNextSelectionColorMenuState,
  shouldCloseContextMenuAfterAction,
  TOGGLE_CONTEXT_MENU_ACTIONS,
  type BackgroundCycleOptions,
  type ImagePlanesMenuState,
  type MatchesMenuState,
  type PointColorMenuState,
  type SelectionColorMenuState,
} from './globalContextMenuActionPolicy';

export type ContextMenuSectionId = 'view' | 'display' | 'cameras' | 'transform' | 'export' | 'menu';

export interface ContextMenuActionDescriptor {
  id: ContextMenuAction;
  section: ContextMenuSectionId;
}

export interface ContextMenuActionGroup<TAction extends ContextMenuActionDescriptor> {
  section: ContextMenuSectionId;
  actions: TAction[];
}

export interface ContextMenuConfigGroup<TAction extends ContextMenuActionDescriptor>
  extends ContextMenuActionGroup<TAction> {
  label: string;
}

export interface MenuPosition {
  x: number;
  y: number;
}

export interface AdjustContextMenuPositionOptions {
  position: MenuPosition;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  galleryCollapsed: boolean;
  padding?: number;
  galleryWidthRatio?: number;
  minGalleryWidth?: number;
}

export interface CenterPopupPositionOptions {
  viewportWidth: number;
  viewportHeight: number;
  popupWidth: number;
  popupHeight: number;
  minMargin?: number;
}

export interface InitialContextMenuEditorPositionOptions {
  showEditPopup: boolean;
  viewportWidth: number;
  viewportHeight: number;
  estimatedPopupWidth?: number;
  estimatedPopupHeight?: number;
}

export interface ContextMenuPositionResetKeyOptions {
  position: MenuPosition | null;
  actionIds: readonly ContextMenuAction[];
  galleryCollapsed: boolean;
}

export interface ContextMenuListStyleOptions {
  position: MenuPosition | null;
  isPositionAdjusted: boolean;
  zIndex?: number;
}

export const CONTEXT_MENU_SECTION_ORDER: readonly ContextMenuSectionId[] = [
  'view',
  'display',
  'cameras',
  'transform',
  'export',
];

export const CONTEXT_MENU_SECTION_LABELS: Record<ContextMenuSectionId, string> = {
  view: 'View & Navigation',
  display: 'Display & Points',
  cameras: 'Cameras',
  transform: 'Transform',
  export: 'Export',
  menu: 'Menu',
};

export const CONTEXT_MENU_LIST_MIN_WIDTH = '160px';
export const CONTEXT_MENU_EDITOR_COLUMN_MIN_WIDTH = 180;
export const CONTEXT_MENU_EDITOR_CONTENT_MAX_HEIGHT = 'calc(100vh - 120px)';

export function getActionById<TAction extends ContextMenuActionDescriptor>(
  actions: readonly TAction[],
  id: ContextMenuAction
): TAction | undefined {
  return actions.find(action => action.id === id);
}

export function getConfigurableActions<TAction extends ContextMenuActionDescriptor>(
  actions: readonly TAction[]
): TAction[] {
  return actions.filter(action => action.id !== 'editMenu');
}

export function groupContextMenuActions<TAction extends ContextMenuActionDescriptor>(
  actions: readonly TAction[],
  actionIds: readonly ContextMenuAction[],
  sectionOrder: readonly ContextMenuSectionId[] = CONTEXT_MENU_SECTION_ORDER
): ContextMenuActionGroup<TAction>[] {
  const actionIndexMap = new Map(actions.map((action, index) => [action.id, index]));
  const actionsToShow = actionIds
    .map(id => getActionById(actions, id))
    .filter((action): action is TAction => action !== undefined);

  return sectionOrder
    .map(section => {
      const sectionActions = actionsToShow
        .filter(action => action.section === section)
        .sort((a, b) => (actionIndexMap.get(a.id) ?? 999) - (actionIndexMap.get(b.id) ?? 999));

      return { section, actions: sectionActions };
    })
    .filter(group => group.actions.length > 0);
}

export function groupConfigurableActions<TAction extends ContextMenuActionDescriptor>(
  actions: readonly TAction[],
  sectionOrder: readonly ContextMenuSectionId[] = CONTEXT_MENU_SECTION_ORDER
): ContextMenuConfigGroup<TAction>[] {
  const configurableActions = getConfigurableActions(actions);

  return sectionOrder
    .map(section => ({
      section,
      label: CONTEXT_MENU_SECTION_LABELS[section],
      actions: configurableActions.filter(action => action.section === section),
    }))
    .filter(group => group.actions.length > 0);
}

export function splitActionsIntoColumns<TAction>(actions: readonly TAction[], columnCount: number): TAction[][] {
  const safeColumnCount = Math.max(1, Math.floor(columnCount));
  const itemsPerColumn = Math.ceil(actions.length / safeColumnCount);

  return Array.from({ length: safeColumnCount }, (_, index) =>
    actions.slice(index * itemsPerColumn, (index + 1) * itemsPerColumn)
  );
}

export function getCenteredPopupPosition({
  viewportWidth,
  viewportHeight,
  popupWidth,
  popupHeight,
  minMargin = 20,
}: CenterPopupPositionOptions): MenuPosition {
  return {
    x: Math.max(minMargin, (viewportWidth - popupWidth) / 2),
    y: Math.max(minMargin, (viewportHeight - popupHeight) / 2),
  };
}

export function getInitialContextMenuEditorPosition({
  showEditPopup,
  viewportWidth,
  viewportHeight,
  estimatedPopupWidth = 600,
  estimatedPopupHeight = 500,
}: InitialContextMenuEditorPositionOptions): MenuPosition {
  if (!showEditPopup) {
    return { x: 0, y: 0 };
  }

  return getCenteredPopupPosition({
    viewportWidth,
    viewportHeight,
    popupWidth: estimatedPopupWidth,
    popupHeight: estimatedPopupHeight,
  });
}

export function getContextMenuEditorPositionResetKey(showEditPopup: boolean): string {
  return showEditPopup ? 'editor:open' : 'editor:closed';
}

export function getContextMenuPositionResetKey({
  position,
  actionIds,
  galleryCollapsed,
}: ContextMenuPositionResetKeyOptions): string {
  if (!position) {
    return 'menu:closed';
  }

  const galleryState = galleryCollapsed ? 'collapsed' : 'expanded';
  return `menu:${position.x}:${position.y}:${galleryState}:${actionIds.join(',')}`;
}

export function getAdjustedContextMenuPosition({
  position,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  galleryCollapsed,
  padding = 8,
  galleryWidthRatio = 0.3,
  minGalleryWidth = 300,
}: AdjustContextMenuPositionOptions): MenuPosition {
  const galleryWidth = galleryCollapsed ? 0 : Math.max(viewportWidth * galleryWidthRatio, minGalleryWidth);
  const availableWidth = viewportWidth - galleryWidth;

  let x = position.x;
  let y = position.y;

  if (y + menuHeight > viewportHeight - padding) {
    y = Math.max(padding, position.y - menuHeight);
  }

  if (x + menuWidth > availableWidth - padding) {
    x = Math.max(padding, position.x - menuWidth);
  }

  return { x, y };
}

export function getContextMenuListStyle({
  position,
  isPositionAdjusted,
  zIndex = Z_INDEX.contextMenu,
}: ContextMenuListStyleOptions): CSSProperties {
  return {
    position: 'fixed',
    left: position?.x ?? 0,
    top: position?.y ?? 0,
    zIndex,
    minWidth: CONTEXT_MENU_LIST_MIN_WIDTH,
    visibility: isPositionAdjusted ? 'visible' : 'hidden',
  };
}

export function getContextMenuEditorActionStyle(): CSSProperties {
  return { breakInside: 'avoid' };
}

export function getContextMenuEditorSectionGridStyle(
  columnCount: number,
  columnMinWidth = CONTEXT_MENU_EDITOR_COLUMN_MIN_WIDTH
): CSSProperties {
  const safeColumnCount = Math.max(1, Math.floor(columnCount));
  return { gridTemplateColumns: `repeat(${safeColumnCount}, minmax(${columnMinWidth}px, 1fr))` };
}

export function getContextMenuEditorOverlayStyle(zIndex: number): CSSProperties {
  return { zIndex };
}

export function getContextMenuEditorPopupStyle(position: MenuPosition): CSSProperties {
  return { left: position.x, top: position.y };
}

export function getContextMenuEditorContentStyle(): CSSProperties {
  return { maxHeight: CONTEXT_MENU_EDITOR_CONTENT_MAX_HEIGHT };
}
