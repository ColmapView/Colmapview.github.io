export const FRUSTUM_PLANE_CULL_INTERVAL_MS = 80;

/** Dirty planes either update now or explicitly request a frame at this deadline. */
export function getFrustumPlaneCullDelay(now: number, lastCheck: number | null): number {
  return lastCheck === null ? 0 : Math.max(0, FRUSTUM_PLANE_CULL_INTERVAL_MS - (now - lastCheck));
}

export function getFrustumPlaneViewAngleOk({
  isSelected,
  distanceToCamera,
  closeDistance,
  dotProduct,
  cullAngleThreshold,
}: {
  isSelected: boolean;
  distanceToCamera: number;
  closeDistance: number;
  dotProduct: number;
  cullAngleThreshold: number;
}): boolean {
  if (isSelected) return true;
  if (distanceToCamera < closeDistance) return true;

  return dotProduct >= cullAngleThreshold;
}

export function shouldUpdateFrustumPlaneViewAngle({
  current,
  next,
}: {
  current: boolean;
  next: boolean;
}): boolean {
  return current !== next;
}
