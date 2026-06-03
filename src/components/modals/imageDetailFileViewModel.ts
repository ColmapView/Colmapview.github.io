import type { ImageId, Reconstruction } from '../../types/colmap';

export interface ImageFetchPlanOptions {
  reconstruction: Reconstruction | null;
  imageDetailId: ImageId | null;
  matchedImageId: ImageId | null;
  hasImages: boolean;
  isImageCached: (imageName: string) => boolean;
}

export interface MaskFetchPlanOptions {
  reconstruction: Reconstruction | null;
  imageDetailId: ImageId | null;
  hasMasks: boolean;
  isMaskCached: (imageName: string) => boolean;
}

export function getImageNamesToFetch({
  reconstruction,
  imageDetailId,
  matchedImageId,
  hasImages,
  isImageCached,
}: ImageFetchPlanOptions): string[] {
  if (!hasImages || !reconstruction) return [];

  const names: string[] = [];
  for (const id of [imageDetailId, matchedImageId]) {
    if (id === null) continue;

    const image = reconstruction.images.get(id);
    if (image && !isImageCached(image.name)) {
      names.push(image.name);
    }
  }

  return Array.from(new Set(names));
}

export function getMaskNameToFetch({
  reconstruction,
  imageDetailId,
  hasMasks,
  isMaskCached,
}: MaskFetchPlanOptions): string | null {
  if (!hasMasks || !reconstruction || imageDetailId === null) return null;

  const image = reconstruction.images.get(imageDetailId);
  if (!image || isMaskCached(image.name)) return null;
  return image.name;
}
