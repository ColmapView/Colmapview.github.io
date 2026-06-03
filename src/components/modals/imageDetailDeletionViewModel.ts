import type { ImageId, Reconstruction } from '../../types/colmap';

export function getCameraImageIds(
  reconstruction: Reconstruction | null,
  imageDetailId: ImageId | null
): ImageId[] {
  if (!reconstruction || imageDetailId === null) return [];

  const currentImage = reconstruction.images.get(imageDetailId);
  if (!currentImage) return [];

  const ids: ImageId[] = [];
  for (const [id, image] of reconstruction.images) {
    if (image.cameraId === currentImage.cameraId) ids.push(id);
  }
  return ids;
}

export function getFrameImageIds(
  reconstruction: Reconstruction | null,
  imageDetailId: ImageId | null
): ImageId[] {
  if (!reconstruction?.rigData || imageDetailId === null) return [];

  for (const [, frame] of reconstruction.rigData.frames) {
    if (frame.dataIds.some((data) => data.dataId === imageDetailId)) {
      return frame.dataIds
        .filter((data) => reconstruction.images.has(data.dataId))
        .map((data) => data.dataId);
    }
  }

  return [];
}

export function areAllMarkedForDeletion(ids: ImageId[], pendingDeletions: Set<ImageId>): boolean {
  return ids.length > 0 && ids.every((id) => pendingDeletions.has(id));
}
