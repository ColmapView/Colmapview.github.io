import type { ColorRepresentation } from 'three';
import { OPACITY, VIZ_COLORS, getMaterialTransparency } from '../../theme';

export interface FrustumPlaneBasicMaterialOptions {
  isSelected: boolean;
  isTransparent: boolean;
  shouldShowTexture: boolean;
  textureHiddenByViewAngle: boolean;
  selectionPlaneOpacity: number;
  displayColor: ColorRepresentation;
}

export interface FrustumPlaneBasicMaterialProps {
  color: ColorRepresentation;
  depthTest: boolean;
  depthWrite: boolean;
  opacity: number;
  transparent: boolean;
}

export interface FrustumPlaneMaterialMapTarget<T> {
  map: T | null;
  needsUpdate: boolean;
}

export function getFrustumPlaneBasicMaterialProps({
  isSelected,
  isTransparent,
  shouldShowTexture,
  textureHiddenByViewAngle,
  selectionPlaneOpacity,
  displayColor,
}: FrustumPlaneBasicMaterialOptions): FrustumPlaneBasicMaterialProps {
  if (!shouldShowTexture) {
    if (textureHiddenByViewAngle) {
      const opacity = isTransparent
        ? OPACITY.frustum.hoveredNoTexture
        : selectionPlaneOpacity * 0.2;
      const { transparent, depthWrite } = getMaterialTransparency(opacity);

      return {
        color: displayColor,
        depthTest: !isSelected,
        depthWrite: isSelected ? false : depthWrite,
        opacity,
        transparent: isSelected ? true : transparent,
      };
    }

    return {
      color: displayColor,
      depthTest: !isSelected,
      depthWrite: false,
      opacity: 0,
      transparent: true,
    };
  }

  const opacity = isTransparent
    ? selectionPlaneOpacity * 0.5
    : selectionPlaneOpacity;
  const { transparent, depthWrite } = getMaterialTransparency(opacity);

  return {
    color: VIZ_COLORS.material.white,
    depthTest: !isSelected,
    depthWrite: isSelected ? false : depthWrite,
    opacity,
    transparent: isSelected ? true : transparent,
  };
}

export function syncFrustumPlaneMaterialMap<T>(
  material: FrustumPlaneMaterialMapTarget<T> | null,
  nextMap: T | null,
  previousIntendedMap?: T | null
): boolean {
  if (!material) return false;

  const materialMapChanged = material.map !== nextMap;
  const intendedMapChanged = previousIntendedMap !== undefined && previousIntendedMap !== nextMap;
  if (!materialMapChanged && !intendedMapChanged) return false;

  material.map = nextMap;
  material.needsUpdate = true;
  return true;
}
