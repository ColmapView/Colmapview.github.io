import type { CSSProperties, ReactNode } from 'react';

export type ControlButtonTouchAction = 'none' | 'execute-click' | 'open-panel';

export const CONTROL_PANEL_STATUS_BAR_CLEARANCE = 48;
export const CONTROL_PANEL_HEIGHT_CHANGE_THRESHOLD = 5;

export interface ControlButtonTouchActionInput {
  disabled: boolean;
  hasPanel: boolean;
  isHovered: boolean;
}

export interface ControlButtonPanelVisibilityInput {
  contextMenuOpen: boolean;
  disabled: boolean;
  hasPanel: boolean;
  isHovered: boolean;
}

export interface ControlButtonOutsideTouchInput {
  contextMenuOpen: boolean;
  hasPanel: boolean;
  isHovered: boolean;
  touchMode: boolean;
}

export interface ControlPanelRect {
  bottom: number;
  height: number;
}

export function hasControlButtonPanel(
  panelTitle: string | undefined,
  children: ReactNode | undefined
): boolean {
  return Boolean(panelTitle && children);
}

export function getControlButtonAccessibleLabel(tooltip: string, disabled: boolean): string {
  return disabled ? `${tooltip} (no data loaded)` : tooltip;
}

export function getControlButtonTouchAction({
  disabled,
  hasPanel,
  isHovered,
}: ControlButtonTouchActionInput): ControlButtonTouchAction {
  if (disabled) return 'none';
  if (!hasPanel) return 'execute-click';
  return isHovered ? 'execute-click' : 'open-panel';
}

export function shouldListenForOutsideTouch({
  contextMenuOpen,
  hasPanel,
  isHovered,
  touchMode,
}: ControlButtonOutsideTouchInput): boolean {
  return touchMode && isHovered && hasPanel && !contextMenuOpen;
}

export function shouldShowControlButtonPanel({
  contextMenuOpen,
  disabled,
  hasPanel,
  isHovered,
}: ControlButtonPanelVisibilityInput): boolean {
  return hasPanel && isHovered && !disabled && !contextMenuOpen;
}

export function hasControlPanelHeightChangedSignificantly(
  currentHeight: number,
  lastHeight: number,
  threshold = CONTROL_PANEL_HEIGHT_CHANGE_THRESHOLD
): boolean {
  return lastHeight <= 0 || Math.abs(currentHeight - lastHeight) >= threshold;
}

export function getControlPanelAdjustedTop(
  rect: Pick<ControlPanelRect, 'bottom'>,
  viewportHeight: number,
  statusBarClearance = CONTROL_PANEL_STATUS_BAR_CLEARANCE
): number | null {
  const maxBottom = viewportHeight - statusBarClearance;

  if (rect.bottom > maxBottom) {
    return -(rect.bottom - maxBottom);
  }

  return null;
}

export function getControlPanelWrapperStyle(
  adjustedTop: number | null
): CSSProperties | undefined {
  return adjustedTop !== null ? { top: adjustedTop } : undefined;
}
