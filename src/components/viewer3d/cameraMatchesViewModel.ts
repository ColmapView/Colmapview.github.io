import type { CameraDisplayMode } from '../../store/types';
import type { ImageId, Reconstruction } from '../../types/colmap';
import { getImageWorldPosition } from '../../utils/colmapTransforms';

export interface CameraMatchLinePositionsOptions {
  reconstruction: Pick<Reconstruction, 'images' | 'connectedImagesIndex'> | null;
  selectedImageId: ImageId | null;
  showMatches: boolean;
  cameraDisplayMode: CameraDisplayMode;
}

export function buildCameraMatchLinePositions({
  reconstruction,
  selectedImageId,
  showMatches,
  cameraDisplayMode,
}: CameraMatchLinePositionsOptions): Float32Array | null {
  if (!reconstruction || selectedImageId === null || !showMatches || cameraDisplayMode === 'imageplane') {
    return null;
  }

  const selectedImage = reconstruction.images.get(selectedImageId);
  if (!selectedImage) return null;

  const connections = reconstruction.connectedImagesIndex.get(selectedImageId);
  if (!connections || connections.size === 0) return null;

  const selectedPosition = getImageWorldPosition(selectedImage);
  const positions: number[] = [];

  for (const matchedId of connections.keys()) {
    const matchedImage = reconstruction.images.get(matchedId);
    if (!matchedImage) continue;

    const matchedPosition = getImageWorldPosition(matchedImage);
    positions.push(
      selectedPosition.x,
      selectedPosition.y,
      selectedPosition.z,
      matchedPosition.x,
      matchedPosition.y,
      matchedPosition.z
    );
  }

  return new Float32Array(positions);
}
