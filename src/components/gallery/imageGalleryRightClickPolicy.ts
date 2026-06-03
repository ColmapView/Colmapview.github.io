import type { CameraViewState, NavigationHistoryEntry } from '../../store/types';

export type ImageGalleryRightClickAction =
  | {
    type: 'openMatchedImageDetail';
    selectedImageId: number;
    matchedImageId: number;
  }
  | {
    type: 'restoreNavigation';
  }
  | {
    type: 'navigateToImage';
    imageId: number;
    navigationEntry: NavigationHistoryEntry | null;
  };

export interface ImageGalleryRightClickActionOptions {
  imageId: number;
  selectedImageId: number | null;
  isMatchedImage: boolean;
  currentViewState: CameraViewState | null;
  lastNavigationEntry: NavigationHistoryEntry | undefined;
}

export function getImageGalleryRightClickAction({
  imageId,
  selectedImageId,
  isMatchedImage,
  currentViewState,
  lastNavigationEntry,
}: ImageGalleryRightClickActionOptions): ImageGalleryRightClickAction {
  if (selectedImageId !== null && isMatchedImage) {
    return {
      type: 'openMatchedImageDetail',
      selectedImageId,
      matchedImageId: imageId,
    };
  }

  if (currentViewState !== null && lastNavigationEntry?.toImageId === imageId) {
    return {
      type: 'restoreNavigation',
    };
  }

  return {
    type: 'navigateToImage',
    imageId,
    navigationEntry: currentViewState === null
      ? null
      : {
        fromState: currentViewState,
        fromImageId: selectedImageId,
        toImageId: imageId,
      },
  };
}
