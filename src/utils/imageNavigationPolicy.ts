import type { NavigationHistoryEntry } from '../store/types';
import type { ImageId, Reconstruction } from '../types/colmap';

export function buildMatchedImageIds(
  reconstruction: Reconstruction | null,
  selectedImageId: ImageId | null,
  showMatches: boolean
): Set<ImageId> {
  if (!reconstruction || selectedImageId === null || !showMatches) {
    return new Set();
  }

  const connections = reconstruction.connectedImagesIndex.get(selectedImageId);
  return new Set(connections?.keys() ?? []);
}

export function getLastNavigationToImageId(navigationHistory: NavigationHistoryEntry[]): ImageId | null {
  return navigationHistory.at(-1)?.toImageId ?? null;
}
