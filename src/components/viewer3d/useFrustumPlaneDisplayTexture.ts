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
}

export function useFrustumPlaneDisplayTexture({
  imageFile,
  imageName,
  isSelected,
  showImagePlane,
  viewAngleOk,
}: FrustumPlaneDisplayTextureOptions) {
  const lowResTexture = useFrustumTexture(imageFile, imageName, showImagePlane);
  const highResTexture = useSelectedImageTexture(imageFile, imageName, isSelected && showImagePlane);
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
