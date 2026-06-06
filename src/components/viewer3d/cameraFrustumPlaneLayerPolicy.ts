import { VIZ_COLORS } from '../../theme';
import type { ImageId } from '../../types/colmap';
import {
  getFrustumBaseColor,
  type CameraFrustumItem,
  type FrustumColorMode,
  type FrustumPsnrMetricSource,
} from './cameraFrustumViewModel';
import {
  getImagePlaneStyle,
  type ImagePlaneStyle,
} from './cameraFrustumStylePolicy';

export interface ImagePlaneRenderItem {
  frustum: CameraFrustumItem;
  isMatched: boolean;
  style: ImagePlaneStyle;
  wouldGoBack: boolean;
}

export interface BuildImagePlaneRenderItemsOptions {
  frustums: CameraFrustumItem[];
  selectedImageId: ImageId | null;
  matchedImageIds: Set<ImageId>;
  pendingDeletions: Set<ImageId>;
  imageFrameIndexMap: Map<ImageId, number>;
  splatPsnrByImage?: FrustumPsnrMetricSource;
  lastNavigationToImageId: ImageId | null;
  frustumColorMode: FrustumColorMode;
  frustumSingleColor: string;
  selectionPlaneOpacity: number;
  matchesOpacity: number;
  unselectedCameraOpacity: number;
  matchesColor: string;
  deletedColor?: string;
}

export function buildImagePlaneRenderItems({
  frustums,
  selectedImageId,
  matchedImageIds,
  pendingDeletions,
  imageFrameIndexMap,
  splatPsnrByImage,
  lastNavigationToImageId,
  frustumColorMode,
  frustumSingleColor,
  selectionPlaneOpacity,
  matchesOpacity,
  unselectedCameraOpacity,
  matchesColor,
  deletedColor = VIZ_COLORS.frustum.deleted ?? '#ff4444',
}: BuildImagePlaneRenderItemsOptions): ImagePlaneRenderItem[] {
  return frustums.flatMap((frustum) => {
    const imageId = frustum.image.imageId;
    if (imageId === selectedImageId) return [];

    const isMatched = matchedImageIds.has(imageId);
    const baseColor = getFrustumBaseColor(
      frustumColorMode,
      frustum.cameraIndex,
      imageId,
      imageFrameIndexMap,
      frustumSingleColor,
      splatPsnrByImage
    );

    return [{
      frustum,
      isMatched,
      wouldGoBack: imageId === lastNavigationToImageId,
      style: getImagePlaneStyle({
        isMatched,
        isPendingDeletion: pendingDeletions.has(imageId),
        hasSelectedImage: selectedImageId !== null,
        selectionPlaneOpacity,
        matchesOpacity,
        unselectedCameraOpacity,
        baseColor,
        matchesColor,
        deletedColor,
      }),
    }];
  });
}
