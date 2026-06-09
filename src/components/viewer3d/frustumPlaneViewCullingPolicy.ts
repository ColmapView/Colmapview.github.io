export const FRUSTUM_PLANE_CULL_CHECK_INTERVAL = 5;

export function getInitialFrustumPlaneCullFrame({
  seed,
  interval,
}: {
  seed: number;
  interval: number;
}): number {
  if (!Number.isFinite(seed) || interval <= 1) return 0;
  return Math.abs(Math.trunc(seed)) % interval;
}

export function getNextFrustumPlaneCullFrame({
  frameCount,
  interval,
}: {
  frameCount: number;
  interval: number;
}): number {
  return (frameCount + 1) % interval;
}

export function shouldMeasureFrustumPlaneViewAngle(frameCount: number): boolean {
  return frameCount === 0;
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
