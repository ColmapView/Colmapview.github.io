export type PointPickingMode = 'off' | 'origin-1pt' | 'distance-2pt' | 'normal-3pt';

export const POINT_PICKING_REQUIRED_POINT_COUNTS: Record<PointPickingMode, number> = {
  off: 0,
  'origin-1pt': 1,
  'distance-2pt': 2,
  'normal-3pt': 3,
};

export function getRequiredPointCount(pickingMode: PointPickingMode): number {
  return POINT_PICKING_REQUIRED_POINT_COUNTS[pickingMode];
}

export function needsMoreSelectedPoints(
  selectedPointCount: number,
  pickingMode: PointPickingMode,
): boolean {
  return selectedPointCount < getRequiredPointCount(pickingMode);
}
