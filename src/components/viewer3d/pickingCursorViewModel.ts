import type { CSSProperties } from 'react';
import type { PointPickingMode } from '../../store/stores/pointPickingStore';
import { MARKER_COLORS_CSS, Z_INDEX } from '../../theme';
import { getRequiredPointCount } from '../../store/pointPickingPolicy';

export interface CursorScreenPoint {
  x: number;
  y: number;
}

export interface PickingCursorViewModel {
  isVisible: boolean;
  nextPointIndex: number;
  nextLabel: string;
  nextColor: string;
}

export const PICKING_CURSOR_OFFSET_PX = 16;
export const PICKING_CURSOR_CONTAINER_CLASS = 'fixed pointer-events-none';
export const PICKING_CURSOR_TOOLTIP_CLASS =
  'bg-black/90 text-white text-xs px-2 py-1.5 rounded whitespace-nowrap flex items-center gap-2';
export const PICKING_CURSOR_MARKER_CLASS = 'w-3 h-3 rounded-full inline-block';
export const PICKING_CURSOR_LABEL_PREFIX = 'Select';

export const POINT_LABELS = ['P1', 'P2', 'P3'] as const;

export function getPickingCursorLabel(pointIndex: number): string {
  return POINT_LABELS[pointIndex] ?? POINT_LABELS[0];
}

export function getPickingCursorColor(
  pointIndex: number,
  markerColors: readonly string[] = MARKER_COLORS_CSS,
): string {
  return markerColors[pointIndex] ?? markerColors[0];
}

export function shouldShowPickingCursor(
  pickingMode: PointPickingMode,
  selectedPointCount: number,
): boolean {
  return pickingMode !== 'off' && selectedPointCount < getRequiredPointCount(pickingMode);
}

export function getPickingCursorViewModel(
  pickingMode: PointPickingMode,
  selectedPointCount: number,
): PickingCursorViewModel {
  const nextPointIndex = selectedPointCount;

  return {
    isVisible: shouldShowPickingCursor(pickingMode, selectedPointCount),
    nextPointIndex,
    nextLabel: getPickingCursorLabel(nextPointIndex),
    nextColor: getPickingCursorColor(nextPointIndex),
  };
}

export function getPickingCursorPositionStyle(
  mousePosition: CursorScreenPoint,
  offsetPx = PICKING_CURSOR_OFFSET_PX,
): { left: number; top: number } {
  return {
    left: mousePosition.x + offsetPx,
    top: mousePosition.y + offsetPx,
  };
}

export function getPickingCursorContainerStyle(
  mousePosition: CursorScreenPoint,
  offsetPx = PICKING_CURSOR_OFFSET_PX,
  zIndex = Z_INDEX.modal,
): CSSProperties {
  return {
    ...getPickingCursorPositionStyle(mousePosition, offsetPx),
    zIndex,
  };
}

export function getPickingCursorMarkerStyle(color: string): CSSProperties {
  return { backgroundColor: color };
}
