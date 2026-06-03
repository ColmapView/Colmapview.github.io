import type { ColorRepresentation } from 'three';
import { OPACITY, VIZ_COLORS, getMaterialTransparency } from '../../theme';

export interface FrustumPlaneBasicMaterialOptions {
  isSelected: boolean;
  isTransparent: boolean;
  shouldShowTexture: boolean;
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

export function getFrustumPlaneBasicMaterialProps({
  isSelected,
  isTransparent,
  shouldShowTexture,
  selectionPlaneOpacity,
  displayColor,
}: FrustumPlaneBasicMaterialOptions): FrustumPlaneBasicMaterialProps {
  const opacity = isTransparent
    ? (shouldShowTexture ? selectionPlaneOpacity * 0.5 : OPACITY.frustum.hoveredNoTexture)
    : (shouldShowTexture ? selectionPlaneOpacity : selectionPlaneOpacity * 0.2);
  const { transparent, depthWrite } = getMaterialTransparency(opacity);

  return {
    color: shouldShowTexture ? VIZ_COLORS.material.white : displayColor,
    depthTest: !isSelected,
    depthWrite: isSelected ? false : depthWrite,
    opacity,
    transparent: isSelected ? true : transparent,
  };
}
