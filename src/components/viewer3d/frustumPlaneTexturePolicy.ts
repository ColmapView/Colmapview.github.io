export function getFrustumPlaneSourceTexture<T>({
  isSelected,
  highResTexture,
  lowResTexture,
}: {
  isSelected: boolean;
  highResTexture: T | null;
  lowResTexture: T | null;
}): T | null {
  return isSelected ? (highResTexture ?? lowResTexture) : lowResTexture;
}

export function shouldShowFrustumPlaneTexture({
  showImagePlane,
  hasDisplayTexture,
  viewAngleOk,
}: {
  showImagePlane: boolean;
  hasDisplayTexture: boolean;
  viewAngleOk: boolean;
}): boolean {
  return showImagePlane && hasDisplayTexture && viewAngleOk;
}

export function isRenderableFrustumPlaneTexture<T extends { image?: unknown } | null>(
  texture: T
): boolean {
  if (!texture) return false;

  const image = texture.image;
  if (!image || typeof image !== 'object') return false;

  const { width, height } = image as { width?: unknown; height?: unknown };
  return typeof width === 'number'
    && typeof height === 'number'
    && width > 0
    && height > 0;
}
