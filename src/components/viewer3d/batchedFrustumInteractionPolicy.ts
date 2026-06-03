export type BatchedFrustumInteractionItem = {
  image: {
    imageId: number;
  };
};

export interface BatchedFrustumPointerPoint {
  x: number;
  y: number;
}

export interface BatchedFrustumTouchStart extends BatchedFrustumPointerPoint {
  instanceId: number;
  fired: boolean;
}

export type BatchedFrustumTouchUpAction<T extends BatchedFrustumInteractionItem> =
  | { type: 'none' }
  | { type: 'openContextMenu'; frustum: T; instanceId: number };

export const BATCHED_FRUSTUM_TOUCH_TAP_MAX_DISTANCE_SQUARED = 225;

export function getBatchedFrustum<T extends BatchedFrustumInteractionItem>(
  frustums: T[],
  instanceId: number | undefined
): T | undefined {
  return instanceId === undefined ? undefined : frustums[instanceId];
}

export function getInteractiveBatchedFrustum<T extends BatchedFrustumInteractionItem>({
  frustums,
  instanceId,
  selectedImageId,
}: {
  frustums: T[];
  instanceId: number | undefined;
  selectedImageId: number | null;
}): T | undefined {
  const frustum = getBatchedFrustum(frustums, instanceId);
  return !frustum || frustum.image.imageId === selectedImageId ? undefined : frustum;
}

export function getSquaredBatchedFrustumPointerTravel(
  start: BatchedFrustumPointerPoint,
  end: BatchedFrustumPointerPoint
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return dx * dx + dy * dy;
}

export function getBatchedFrustumTouchUpAction<T extends BatchedFrustumInteractionItem>({
  frustums,
  touchStart,
  touchEnd,
  selectedImageId,
  maxDistanceSquared = BATCHED_FRUSTUM_TOUCH_TAP_MAX_DISTANCE_SQUARED,
}: {
  frustums: T[];
  touchStart: BatchedFrustumTouchStart | null;
  touchEnd: BatchedFrustumPointerPoint;
  selectedImageId: number | null;
  maxDistanceSquared?: number;
}): BatchedFrustumTouchUpAction<T> {
  if (!touchStart || touchStart.fired) return { type: 'none' };

  if (getSquaredBatchedFrustumPointerTravel(touchStart, touchEnd) > maxDistanceSquared) {
    return { type: 'none' };
  }

  const frustum = getInteractiveBatchedFrustum({
    frustums,
    instanceId: touchStart.instanceId,
    selectedImageId,
  });

  return frustum
    ? { type: 'openContextMenu', frustum, instanceId: touchStart.instanceId }
    : { type: 'none' };
}
