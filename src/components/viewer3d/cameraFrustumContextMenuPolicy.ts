import type { NavigationHistoryEntry } from '../../store/types';
import type { ImageId } from '../../types/colmap';

export type ArrowContextMenuAction =
  | 'none'
  | 'goBack'
  | 'deselect'
  | 'openMatchedDetail'
  | 'flyToImage';

export interface ArrowContextMenuActionOptions {
  frustumExists: boolean;
  imageId: ImageId;
  selectedImageId: ImageId | null;
  matchedImageIds: Set<ImageId>;
  lastEntry?: NavigationHistoryEntry | null;
  canReadCurrentViewState: boolean;
}

export type GotoContextMenuAction =
  | 'flyWithoutHistory'
  | 'goBack'
  | 'pushAndFly';

export interface GotoContextMenuActionOptions {
  targetImageId: ImageId;
  lastEntry?: NavigationHistoryEntry | null;
  canReadCurrentViewState: boolean;
}

export function getArrowContextMenuAction({
  frustumExists,
  imageId,
  selectedImageId,
  matchedImageIds,
  lastEntry,
  canReadCurrentViewState,
}: ArrowContextMenuActionOptions): ArrowContextMenuAction {
  if (!frustumExists) {
    return 'none';
  }

  if (imageId === selectedImageId) {
    return lastEntry?.toImageId === imageId ? 'goBack' : 'deselect';
  }

  if (selectedImageId !== null && matchedImageIds.has(imageId)) {
    return 'openMatchedDetail';
  }

  if (canReadCurrentViewState && lastEntry?.toImageId === imageId) {
    return 'goBack';
  }

  return 'flyToImage';
}

export function getGotoContextMenuAction({
  targetImageId,
  lastEntry,
  canReadCurrentViewState,
}: GotoContextMenuActionOptions): GotoContextMenuAction {
  if (!canReadCurrentViewState) {
    return 'flyWithoutHistory';
  }

  return lastEntry?.toImageId === targetImageId ? 'goBack' : 'pushAndFly';
}
