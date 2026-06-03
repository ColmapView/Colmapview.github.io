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

export function getFrustumPlaneDisplayTexture<T>({
  currentTexture,
  lastTexture,
}: {
  currentTexture: T | null;
  lastTexture: T | null;
}): T | null {
  return currentTexture ?? lastTexture;
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

export function getFrustumPlaneMaterialTexture<T>({
  shouldShowTexture,
  displayTexture,
}: {
  shouldShowTexture: boolean;
  displayTexture: T | null;
}): T | null {
  return shouldShowTexture ? displayTexture : null;
}
