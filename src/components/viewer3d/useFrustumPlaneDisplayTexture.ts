import { useFrustumTexture, useSelectedImageTexture } from '../../hooks/useFrustumTexture';
import {
  getFrustumPlaneSourceTexture,
  isRenderableFrustumPlaneTexture,
  shouldShowFrustumPlaneTexture,
} from './frustumPlaneTexturePolicy';

interface FrustumPlaneDisplayTextureOptions {
  imageFile?: File;
  imageName: string;
  isSelected: boolean;
  showImagePlane: boolean;
  viewAngleOk: boolean;
  selectedTextureDelayMs?: number;
}

export function useFrustumPlaneDisplayTexture({
  imageFile,
  imageName,
  isSelected,
  showImagePlane,
  viewAngleOk,
  selectedTextureDelayMs = 0,
}: FrustumPlaneDisplayTextureOptions) {
  const lowResTexture = useFrustumTexture(imageFile, imageName, showImagePlane);
  const highResTexture = useSelectedImageTexture(
    imageFile,
    imageName,
    isSelected && showImagePlane,
    selectedTextureDelayMs
  );
  const sourceTexture = getFrustumPlaneSourceTexture({
    isSelected,
    highResTexture,
    lowResTexture,
  });
  const hasDisplayTexture = isRenderableFrustumPlaneTexture(sourceTexture);

  const shouldShowTexture = shouldShowFrustumPlaneTexture({
    showImagePlane,
    hasDisplayTexture,
    viewAngleOk,
  });

  return {
    displayTexture: sourceTexture,
    shouldShowTexture,
    textureHiddenByViewAngle: showImagePlane && hasDisplayTexture && !viewAngleOk,
  };
}
