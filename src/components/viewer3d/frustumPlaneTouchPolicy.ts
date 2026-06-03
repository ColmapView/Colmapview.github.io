export interface FrustumPlaneTouchPoint {
  x: number;
  y: number;
}

export interface FrustumPlaneTouchStart extends FrustumPlaneTouchPoint {
  fired: boolean;
}

export type FrustumPlaneTouchUpAction = 'none' | 'toggleSelectedTransparency' | 'openContextMenu';

export const FRUSTUM_TOUCH_TAP_MAX_DISTANCE_SQUARED = 225;

export function getSquaredTouchTravel(
  start: FrustumPlaneTouchPoint,
  end: FrustumPlaneTouchPoint
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return dx * dx + dy * dy;
}

export function getFrustumPlaneTouchUpAction({
  touchStart,
  touchEnd,
  isSelected,
  maxDistanceSquared = FRUSTUM_TOUCH_TAP_MAX_DISTANCE_SQUARED,
}: {
  touchStart: FrustumPlaneTouchStart | null;
  touchEnd: FrustumPlaneTouchPoint;
  isSelected: boolean;
  maxDistanceSquared?: number;
}): FrustumPlaneTouchUpAction {
  if (!touchStart || touchStart.fired) return 'none';
  if (getSquaredTouchTravel(touchStart, touchEnd) > maxDistanceSquared) return 'none';

  return isSelected ? 'toggleSelectedTransparency' : 'openContextMenu';
}
