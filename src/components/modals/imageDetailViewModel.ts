import {
  UNMATCHED_POINT3D_ID,
  type Image,
  type ImageId,
  type Point2D,
  type Reconstruction,
} from '../../types/colmap';

export {
  clampPositionToViewport,
  fitSideBySideDimensions,
  fitSingleImageDimensions,
  fitVerticalStackedDimensions,
  getInitialImageModalBounds,
  getSideBySideMatchLayout,
  getSingleImageLayout,
  getVerticalStackedMatchLayout,
  resizeModalBounds,
} from './imageDetailLayoutViewModel';

export type {
  ImageModalSizingOptions,
  ImagePlacement,
  MatchViewDimensions,
  MatchViewLayout,
  ModalBounds,
  Position2D,
  ResizeModalBoundsOptions,
  SingleImageDimensions,
  SingleImageLayout,
  Size2D,
} from './imageDetailLayoutViewModel';

export {
  getCycledMatchedImageId,
  getImageTouchGesture,
  getImageTouchNavigationAction,
  getImageWheelNavigationPlan,
  shouldPreventTouchScroll,
} from './imageDetailNavigationViewModel';

export type {
  ImageDetailNavigationAction,
  ImageNavigationDirection,
  ImageTouchGesture,
  MatchedImageCycleOption,
  TouchGestureOptions,
  TouchGestureStart,
  TouchNavigationActionOptions,
  WheelNavigationPlan,
  WheelNavigationPlanOptions,
} from './imageDetailNavigationViewModel';

export {
  getImageNamesToFetch,
  getMaskNameToFetch,
} from './imageDetailFileViewModel';

export type {
  ImageFetchPlanOptions,
  MaskFetchPlanOptions,
} from './imageDetailFileViewModel';

export {
  applyLazyPointCacheUpdate,
  getLazyImagePointLoadIds,
} from './imageDetailLazyPointsViewModel';

export type {
  ApplyLazyPointCacheUpdateOptions,
  LazyImagePointLoadOptions,
  LazyPointCacheUpdate,
} from './imageDetailLazyPointsViewModel';

export {
  getActiveMaskViewState,
  getMaskSplitViewState,
  getNextMaskViewState,
  getResetMaskViewState,
} from './imageDetailMaskViewModel';

export type {
  MaskMode,
  MaskViewState,
} from './imageDetailMaskViewModel';

export {
  applyOpacityInputValue,
  getOpacityInputValue,
  getWheelAdjustedOpacity,
} from './imageDetailOpacityViewModel';

export type {
  OpacityInputApplyResult,
} from './imageDetailOpacityViewModel';

export {
  areAllMarkedForDeletion,
  getCameraImageIds,
  getFrameImageIds,
} from './imageDetailDeletionViewModel';

export interface ConnectedImageOption {
  imageId: ImageId;
  matchCount: number;
  name: string;
}

export interface ImageNavigationState {
  imageIds: ImageId[];
  currentIndex: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevImageId: ImageId | null;
  nextImageId: ImageId | null;
}

export interface PointCounts {
  numPoints2D: number;
  numPoints3D: number;
}

export interface MatchLine {
  point1: [number, number];
  point2: [number, number];
}

export function buildImageNavigation(
  reconstruction: Reconstruction | null,
  imageDetailId: ImageId | null
): ImageNavigationState {
  const imageIds = reconstruction
    ? Array.from(reconstruction.images.keys()).sort((a, b) => a - b)
    : [];
  const currentIndex = imageDetailId !== null ? imageIds.indexOf(imageDetailId) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < imageIds.length - 1;

  return {
    imageIds,
    currentIndex,
    hasPrev,
    hasNext,
    prevImageId: hasPrev ? imageIds[currentIndex - 1] : null,
    nextImageId: hasNext ? imageIds[currentIndex + 1] : null,
  };
}

export function getPointCounts(
  reconstruction: Reconstruction | null,
  image: Image | null,
  imageDetailId: ImageId | null
): PointCounts {
  if (!image || !reconstruction) return { numPoints2D: 0, numPoints3D: 0 };

  const total = image.numPoints2D ?? image.points2D.length;
  const stats = imageDetailId !== null ? reconstruction.imageStats.get(imageDetailId) : null;

  return {
    numPoints2D: total,
    numPoints3D: stats?.numPoints3D ?? 0,
  };
}

export function buildConnectedImages(
  reconstruction: Reconstruction | null,
  imageDetailId: ImageId | null,
  pendingDeletions: Set<ImageId>
): ConnectedImageOption[] {
  if (!reconstruction || imageDetailId === null) return [];

  const connections = reconstruction.connectedImagesIndex.get(imageDetailId);
  if (!connections) return [];

  return Array.from(connections.entries())
    .filter(([id]) => !pendingDeletions.has(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({
      imageId: id,
      matchCount: count,
      name: reconstruction.images.get(id)?.name ?? `Image ${id}`,
    }));
}

export function getCurrentMatchCount(
  connectedImages: ConnectedImageOption[],
  matchedImageId: ImageId | null
): number {
  if (matchedImageId === null) return 0;
  return connectedImages.find((image) => image.imageId === matchedImageId)?.matchCount ?? 0;
}

export function getEffectivePoints2D(
  image: Image | null,
  lazyPoints2D: Map<ImageId, Point2D[]>
): Point2D[] {
  if (!image) return [];
  return image.points2D.length > 0 ? image.points2D : lazyPoints2D.get(image.imageId) ?? [];
}

export function buildMatchLines(
  enabled: boolean,
  currentPoints: Point2D[],
  matchedPoints: Point2D[]
): MatchLine[] {
  if (!enabled) return [];

  const matchedLookup = new Map<bigint, Point2D>();
  for (const point of matchedPoints) {
    if (point.point3DId !== UNMATCHED_POINT3D_ID) {
      matchedLookup.set(point.point3DId, point);
    }
  }

  const lines: MatchLine[] = [];
  for (const point of currentPoints) {
    if (point.point3DId === UNMATCHED_POINT3D_ID) continue;

    const matchedPoint = matchedLookup.get(point.point3DId);
    if (!matchedPoint) continue;

    lines.push({
      point1: point.xy,
      point2: matchedPoint.xy,
    });
  }

  return lines;
}
