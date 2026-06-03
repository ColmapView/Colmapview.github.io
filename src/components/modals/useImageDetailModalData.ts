import { useMemo } from 'react';
import { GAP } from '../../theme';
import type { ImageId, Point2D, Reconstruction } from '../../types/colmap';
import {
  buildConnectedImages,
  buildImageNavigation,
  buildMatchLines,
  getCurrentMatchCount,
  getEffectivePoints2D,
  getPointCounts,
} from './imageDetailViewModel';
import {
  getSideBySideMatchLayout,
  getSingleImageLayout,
  getVerticalStackedMatchLayout,
} from './imageDetailLayoutViewModel';
import { useImageDetailModalLayout } from './useImageDetailModalLayout';

interface UseImageDetailModalDataOptions {
  reconstruction: Reconstruction | null;
  imageDetailId: ImageId | null;
  matchedImageId: ImageId | null;
  showMatchesInModal: boolean;
  pendingDeletions: Set<ImageId>;
  lazyPoints2D: Map<ImageId, Point2D[]>;
}

export function useImageDetailModalData({
  reconstruction,
  imageDetailId,
  matchedImageId,
  showMatchesInModal,
  pendingDeletions,
  lazyPoints2D,
}: UseImageDetailModalDataOptions) {
  const image = imageDetailId !== null ? reconstruction?.images.get(imageDetailId) ?? null : null;
  const camera = image ? reconstruction?.cameras.get(image.cameraId) : null;
  const matchedImage = matchedImageId !== null ? reconstruction?.images.get(matchedImageId) ?? null : null;
  const matchedCamera = matchedImage ? reconstruction?.cameras.get(matchedImage.cameraId) : null;

  const navigation = useMemo(
    () => buildImageNavigation(reconstruction, imageDetailId),
    [reconstruction, imageDetailId]
  );

  const layout = useImageDetailModalLayout({ camera, imageDetailId });

  const { numPoints2D, numPoints3D } = useMemo(
    () => getPointCounts(reconstruction, image, imageDetailId),
    [image, reconstruction, imageDetailId]
  );

  const connectedImages = useMemo(
    () => buildConnectedImages(reconstruction, imageDetailId, pendingDeletions),
    [reconstruction, imageDetailId, pendingDeletions]
  );

  const currentMatchCount = useMemo(
    () => getCurrentMatchCount(connectedImages, matchedImageId),
    [connectedImages, matchedImageId]
  );

  const effectivePoints2D = useMemo(
    () => getEffectivePoints2D(image, lazyPoints2D),
    [image, lazyPoints2D]
  );

  const effectiveMatchedPoints2D = useMemo(
    () => getEffectivePoints2D(matchedImage, lazyPoints2D),
    [matchedImage, lazyPoints2D]
  );

  const matchLines = useMemo(() => buildMatchLines(
    showMatchesInModal && matchedImageId !== null && !!reconstruction && !!image && !!matchedImage,
    effectivePoints2D,
    effectiveMatchedPoints2D
  ), [
    showMatchesInModal,
    matchedImageId,
    reconstruction,
    image,
    matchedImage,
    effectivePoints2D,
    effectiveMatchedPoints2D,
  ]);

  const isMatchViewMode = Boolean(showMatchesInModal && matchedImageId !== null && matchedImage && matchedCamera);
  const matchViewGap = GAP.matchView;

  const singleImageLayout = useMemo(
    () => getSingleImageLayout(camera, layout.containerSize),
    [camera, layout.containerSize]
  );

  const sideBySideLayout = useMemo(
    () => getSideBySideMatchLayout(camera, matchedCamera, layout.containerSize, matchViewGap),
    [camera, matchedCamera, layout.containerSize, matchViewGap]
  );

  const verticalStackedLayout = useMemo(
    () => getVerticalStackedMatchLayout(camera, matchedCamera, layout.containerSize, matchViewGap),
    [camera, matchedCamera, layout.containerSize, matchViewGap]
  );

  return {
    camera,
    connectedImages,
    currentMatchCount,
    effectivePoints2D,
    image,
    isMatchViewMode,
    matchLines,
    matchedCamera,
    matchedImage,
    navigation,
    numPoints2D,
    numPoints3D,
    sideBySideLayout,
    singleImageLayout,
    verticalStackedLayout,
    ...layout,
  };
}
