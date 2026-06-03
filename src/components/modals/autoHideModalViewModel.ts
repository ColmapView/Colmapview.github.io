import type { CSSProperties } from 'react';
import type { AutoHideElement } from '../../store/stores/uiStore';

export type AutoHideModalIconId =
  | 'settings'
  | 'axes'
  | 'grid'
  | 'gizmo'
  | 'points'
  | 'cameras'
  | 'matches'
  | 'rigs';

export interface AutoHideModalElementDef {
  key: AutoHideElement;
  label: string;
  iconId: AutoHideModalIconId;
}

export interface AutoHideModalRow extends AutoHideModalElementDef {
  checked: boolean;
}

interface AutoHideModalPosition {
  x: number;
  y: number;
}

export const AUTO_HIDE_MODAL_TITLE = 'Auto-hide Elements';
export const AUTO_HIDE_MODAL_DESCRIPTION = 'Select which elements hide when idle.';
export const AUTO_HIDE_MODAL_DONE_LABEL = 'Done';

export const AUTO_HIDE_MODAL_WIDTH = 240;
export const AUTO_HIDE_MODAL_ESTIMATED_HEIGHT = 400;
export const AUTO_HIDE_MODAL_BODY_MAX_HEIGHT = 'calc(100vh - 120px)';

export const AUTO_HIDE_MODAL_ELEMENTS: AutoHideModalElementDef[] = [
  { key: 'buttons', label: 'Buttons', iconId: 'settings' },
  { key: 'axes', label: 'Axes', iconId: 'axes' },
  { key: 'grid', label: 'Grid', iconId: 'grid' },
  { key: 'gizmo', label: 'Gizmo', iconId: 'gizmo' },
  { key: 'points', label: 'Points', iconId: 'points' },
  { key: 'cameras', label: 'Cameras', iconId: 'cameras' },
  { key: 'matches', label: 'Matches', iconId: 'matches' },
  { key: 'rigs', label: 'Rigs', iconId: 'rigs' },
];

export function getAutoHideModalRows(
  autoHideElements: Record<AutoHideElement, boolean>
): AutoHideModalRow[] {
  return AUTO_HIDE_MODAL_ELEMENTS.map((element) => ({
    ...element,
    checked: autoHideElements[element.key],
  }));
}

export function getNextAutoHideElementValue(
  autoHideElements: Record<AutoHideElement, boolean>,
  key: AutoHideElement
): boolean {
  return !autoHideElements[key];
}

export function getAutoHideModalOverlayStyle(zIndex: number): CSSProperties {
  return { zIndex };
}

export function getAutoHideModalPanelStyle(position: AutoHideModalPosition): CSSProperties {
  return {
    left: position.x,
    top: position.y,
    width: AUTO_HIDE_MODAL_WIDTH,
  };
}

export function getAutoHideModalHeaderDragStyle(): CSSProperties {
  return { touchAction: 'none' };
}

export function getAutoHideModalBodyStyle(): CSSProperties {
  return { maxHeight: AUTO_HIDE_MODAL_BODY_MAX_HEIGHT };
}
