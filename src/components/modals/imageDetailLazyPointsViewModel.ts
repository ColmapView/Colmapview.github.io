import type { ImageId, Point2D, Reconstruction } from '../../types/colmap';

export interface LazyPointCacheUpdate {
  points: Map<ImageId, Point2D[]>;
  loadOrder: ImageId[];
}

export interface LazyImagePointLoadOptions {
  reconstruction: Reconstruction | null;
  imageDetailId: ImageId | null;
  matchedImageId: ImageId | null;
  showPoints2D: boolean;
  showPoints3D: boolean;
  showMatchesInModal: boolean;
  lazyPoints2D: Map<ImageId, Point2D[]>;
}

export interface ApplyLazyPointCacheUpdateOptions {
  currentPoints: Map<ImageId, Point2D[]>;
  currentLoadOrder: ImageId[];
  loadedPoints: Map<ImageId, Point2D[]>;
  maxCacheSize: number;
}

export function getLazyImagePointLoadIds({
  reconstruction,
  imageDetailId,
  matchedImageId,
  showPoints2D,
  showPoints3D,
  showMatchesInModal,
  lazyPoints2D,
}: LazyImagePointLoadOptions): ImageId[] {
  if (!reconstruction || imageDetailId === null || (!showPoints2D && !showPoints3D && !showMatchesInModal)) {
    return [];
  }

  const idsToLoad: ImageId[] = [];
  const currentImage = reconstruction.images.get(imageDetailId);
  if (
    currentImage &&
    !lazyPoints2D.has(imageDetailId) &&
    currentImage.points2D.length === 0 &&
    (currentImage.numPoints2D ?? 0) > 0
  ) {
    idsToLoad.push(imageDetailId);
  }

  if (showMatchesInModal && matchedImageId !== null && !lazyPoints2D.has(matchedImageId)) {
    const matchedImage = reconstruction.images.get(matchedImageId);
    if (matchedImage && matchedImage.points2D.length === 0 && (matchedImage.numPoints2D ?? 0) > 0) {
      idsToLoad.push(matchedImageId);
    }
  }

  return idsToLoad;
}

export function applyLazyPointCacheUpdate({
  currentPoints,
  currentLoadOrder,
  loadedPoints,
  maxCacheSize,
}: ApplyLazyPointCacheUpdateOptions): LazyPointCacheUpdate {
  const nextPoints = new Map(currentPoints);
  const nextOrder = [...currentLoadOrder];

  for (const [id, points] of loadedPoints) {
    if (points.length === 0) continue;

    nextPoints.set(id, points);
    const existingIndex = nextOrder.indexOf(id);
    if (existingIndex !== -1) nextOrder.splice(existingIndex, 1);
    nextOrder.push(id);
  }

  while (nextOrder.length > maxCacheSize) {
    const oldestId = nextOrder.shift()!;
    nextPoints.delete(oldestId);
  }

  return { points: nextPoints, loadOrder: nextOrder };
}
