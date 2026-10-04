import type { ReactNode } from 'react';

export type ControlButtonTouchAction = 'none' | 'execute-click' | 'open-panel';

export const CONTROL_PANEL_STATUS_BAR_CLEARANCE = 48;
export const CONTROL_PANEL_VIEWPORT_MARGIN = 8;

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

export interface ControlPanelPosition {
  left: number;
  top: number;
  opensRight: boolean;
  maxWidth: number;
  maxHeight: number;
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

export function getControlPanelPosition(
  anchor: Pick<DOMRect, 'left' | 'right' | 'top'>,
  panel: { width: number; height: number },
  viewport: { width: number; height: number; offsetLeft?: number; offsetTop?: number }
): ControlPanelPosition {
  const margin = CONTROL_PANEL_VIEWPORT_MARGIN;
  const maxWidth = Math.max(0, viewport.width - margin * 2);
  const maxHeight = Math.max(0, viewport.height - CONTROL_PANEL_STATUS_BAR_CLEARANCE - margin * 2);
  const width = Math.min(panel.width, maxWidth);
  const height = Math.min(panel.height, maxHeight);
  const viewportLeft = viewport.offsetLeft ?? 0;
  const viewportTop = viewport.offsetTop ?? 0;
  const minLeft = viewportLeft + margin;
  const right = viewportLeft + viewport.width - margin;
  const preferredLeft = anchor.left - width;
  const opensRight = preferredLeft < minLeft && anchor.right + width <= right;
  const left = opensRight ? anchor.right : preferredLeft;
  const minTop = viewportTop + margin;
  const maxTop = viewportTop + viewport.height - CONTROL_PANEL_STATUS_BAR_CLEARANCE - margin - height;

  return {
    left: Math.max(minLeft, Math.min(left, right - width)),
    top: Math.max(minTop, Math.min(anchor.top, maxTop)),
    opensRight,
    maxWidth,
    maxHeight,
  };
}
