import * as THREE from 'three';
import type { MatchesDisplayMode, SelectionColorMode } from '../../store/types';
import { RAINBOW } from '../../theme';

export type FrustumLineColorSource = 'deleted' | 'hover' | 'selection' | 'selectionRainbow' | 'matches' | 'base';
export type FrustumMatchesDisplayMode = MatchesDisplayMode | 'off';

export interface FrustumLineStyle {
  colorSource: FrustumLineColorSource;
  opacity: number;
}

export interface FrustumLineRenderState {
  selectedImageId: number | null;
  hoveredImageId: number | null;
  matchedImageIds: ReadonlySet<number>;
  matchedImageCount: number;
  pendingDeletions?: ReadonlySet<number>;
  pendingDeletionCount: number;
  unselectedCameraOpacity: number;
  matchesOpacity: number;
  matchesDisplayMode: FrustumMatchesDisplayMode;
  matchesColor: string;
  showImagePlanes: boolean;
  frustumStandbyOpacity: number;
  selectionColorMode: SelectionColorMode;
  selectionColor: string;
  selectionAnimationSpeed: number;
  baseColorData: Float32Array;
}

export interface FrustumArrowStyle {
  colorSource: FrustumLineColorSource;
  colorIntensity: number;
  scale: number;
}

export interface FrustumLineStyleOptions {
  isSelected: boolean;
  isHovered: boolean;
  isMatched: boolean;
  isPendingDeletion: boolean;
  hasSelectedImage: boolean;
  showImagePlanes: boolean;
  frustumStandbyOpacity: number;
  matchesOpacity: number;
  unselectedCameraOpacity: number;
  selectionColorMode: SelectionColorMode;
  matchesDisplayMode: FrustumMatchesDisplayMode;
  selectionBlinkFactor: number;
  matchesBlinkFactor: number;
}

export interface FrustumArrowStyleOptions {
  isSelected: boolean;
  isHovered: boolean;
  isMatched: boolean;
  isPendingDeletion: boolean;
  matchesOpacity: number;
  selectionColorMode: SelectionColorMode;
  matchesDisplayMode: FrustumMatchesDisplayMode;
  selectionBlinkFactor: number;
  matchesBlinkFactor: number;
}

export interface ImagePlaneStyle {
  color: string;
  opacity: number;
}

export interface ImagePlaneStyleOptions {
  isMatched: boolean;
  isPendingDeletion: boolean;
  hasSelectedImage: boolean;
  selectionPlaneOpacity: number;
  matchesOpacity: number;
  unselectedCameraOpacity: number;
  baseColor: string;
  matchesColor: string;
  deletedColor: string;
}

export function setRainbowColor(color: THREE.Color, hue: number): void {
  const c = RAINBOW.chroma;
  const x = c * (1 - Math.abs((hue * 6) % 2 - 1));
  const m = RAINBOW.lightness - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  const { hueSegments } = RAINBOW;

  if (hue < hueSegments.redToYellow) {
    r = c;
    g = x;
  } else if (hue < hueSegments.yellowToGreen) {
    r = x;
    g = c;
  } else if (hue < hueSegments.greenToCyan) {
    g = c;
    b = x;
  } else if (hue < hueSegments.cyanToBlue) {
    g = x;
    b = c;
  } else if (hue < hueSegments.blueToMagenta) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  color.setRGB(r + m, g + m, b + m);
}

export function getMatchesBlinkFactor(phase: number): number {
  if (phase < 0.3) return phase / 0.3;
  if (phase < 0.6) return 1;
  if (phase < 1.0) return 1 - (phase - 0.6) / 0.4;
  return 0;
}

export function getMatchesDisplayOpacity(
  matchesOpacity: number,
  matchesDisplayMode: FrustumMatchesDisplayMode,
  phase: number
): number {
  return matchesDisplayMode === 'blink'
    ? matchesOpacity * (0.1 + 0.9 * getMatchesBlinkFactor(phase))
    : matchesOpacity;
}

export function getFrustumLineStyle({
  isSelected,
  isHovered,
  isMatched,
  isPendingDeletion,
  hasSelectedImage,
  showImagePlanes,
  frustumStandbyOpacity,
  matchesOpacity,
  unselectedCameraOpacity,
  selectionColorMode,
  matchesDisplayMode,
  selectionBlinkFactor,
  matchesBlinkFactor,
}: FrustumLineStyleOptions): FrustumLineStyle {
  let colorSource: FrustumLineColorSource = 'base';
  if (isPendingDeletion) {
    colorSource = 'deleted';
  } else if (isHovered) {
    colorSource = 'hover';
  } else if (isSelected) {
    colorSource = selectionColorMode === 'rainbow' ? 'selectionRainbow' : 'selection';
  } else if (isMatched) {
    colorSource = 'matches';
  }

  let opacity: number;
  if (isPendingDeletion) {
    opacity = 0.3;
  } else if (!hasSelectedImage) {
    opacity = frustumStandbyOpacity;
  } else if (isSelected || isHovered) {
    opacity = 1.0;
  } else if (isMatched) {
    opacity = matchesOpacity;
  } else {
    opacity = unselectedCameraOpacity;
  }

  if (isSelected && selectionColorMode === 'blink') {
    opacity *= 0.1 + 0.9 * selectionBlinkFactor;
  }

  if (isMatched && matchesDisplayMode === 'blink') {
    opacity *= 0.1 + 0.9 * matchesBlinkFactor;
  }

  if (isSelected || (showImagePlanes && !hasSelectedImage)) {
    opacity = 0;
  }

  return { colorSource, opacity };
}

export function hasFrustumLineRenderStateChanged(
  previous: FrustumLineRenderState | null,
  current: FrustumLineRenderState
): boolean {
  return !previous ||
    previous.selectedImageId !== current.selectedImageId ||
    previous.hoveredImageId !== current.hoveredImageId ||
    previous.matchedImageIds !== current.matchedImageIds ||
    previous.matchedImageCount !== current.matchedImageCount ||
    previous.pendingDeletions !== current.pendingDeletions ||
    previous.pendingDeletionCount !== current.pendingDeletionCount ||
    previous.unselectedCameraOpacity !== current.unselectedCameraOpacity ||
    previous.matchesOpacity !== current.matchesOpacity ||
    previous.matchesDisplayMode !== current.matchesDisplayMode ||
    previous.matchesColor !== current.matchesColor ||
    previous.showImagePlanes !== current.showImagePlanes ||
    previous.frustumStandbyOpacity !== current.frustumStandbyOpacity ||
    previous.selectionColorMode !== current.selectionColorMode ||
    previous.selectionColor !== current.selectionColor ||
    previous.selectionAnimationSpeed !== current.selectionAnimationSpeed ||
    previous.baseColorData !== current.baseColorData;
}

export function getFrustumArrowStyle({
  isSelected,
  isHovered,
  isMatched,
  isPendingDeletion,
  matchesOpacity,
  selectionColorMode,
  matchesDisplayMode,
  selectionBlinkFactor,
  matchesBlinkFactor,
}: FrustumArrowStyleOptions): FrustumArrowStyle {
  if (isPendingDeletion) {
    return { colorSource: 'deleted', colorIntensity: 1, scale: isSelected ? 0 : 1 };
  }

  if (isHovered) {
    return { colorSource: 'hover', colorIntensity: 1, scale: isSelected ? 0 : 1 };
  }

  if (isSelected) {
    return {
      colorSource: selectionColorMode === 'rainbow' ? 'selectionRainbow' : 'selection',
      colorIntensity: selectionColorMode === 'blink' ? 0.5 + 0.5 * selectionBlinkFactor : 1,
      scale: 0,
    };
  }

  if (isMatched) {
    return {
      colorSource: 'matches',
      colorIntensity: matchesDisplayMode === 'blink'
        ? matchesOpacity * (0.1 + 0.9 * matchesBlinkFactor)
        : matchesOpacity,
      scale: 1,
    };
  }

  return { colorSource: 'base', colorIntensity: 1, scale: 1 };
}

export function getImagePlaneStyle({
  isMatched,
  isPendingDeletion,
  hasSelectedImage,
  selectionPlaneOpacity,
  matchesOpacity,
  unselectedCameraOpacity,
  baseColor,
  matchesColor,
  deletedColor,
}: ImagePlaneStyleOptions): ImagePlaneStyle {
  const color = isPendingDeletion
    ? deletedColor
    : isMatched
      ? matchesColor
      : baseColor;

  let opacity: number;
  if (isPendingDeletion) {
    opacity = 0.3;
  } else if (!hasSelectedImage) {
    opacity = selectionPlaneOpacity;
  } else if (isMatched) {
    opacity = selectionPlaneOpacity * matchesOpacity;
  } else {
    opacity = selectionPlaneOpacity * unselectedCameraOpacity;
  }

  return { color, opacity };
}
