import {
  isSplatPointOverlayColorMode,
  type ColorMode,
  type SelectionColorMode,
} from '../../../store';

interface PointGeometryVisibilityOptions {
  showPointCloud: boolean;
  colorMode: ColorMode;
  splatFile?: File;
}

export function shouldRenderPointGeometry({
  showPointCloud,
  colorMode,
  splatFile,
}: PointGeometryVisibilityOptions): boolean {
  if (!showPointCloud) {
    return false;
  }

  if (isSplatPointOverlayColorMode(colorMode)) {
    return true;
  }

  if (colorMode !== 'splats') {
    return true;
  }

  return !splatFile;
}

export function getPointGeometryDataColorMode(colorMode: ColorMode): ColorMode {
  return colorMode === 'splats' || isSplatPointOverlayColorMode(colorMode)
    ? 'rgb'
    : colorMode;
}

export function getSplatPointOverlayAnimationMode(
  colorMode: ColorMode
): SelectionColorMode | null {
  if (colorMode === 'splatPoints') {
    return 'blink';
  }

  if (colorMode === 'splatRainbowPoints') {
    return 'rainbow';
  }

  return null;
}
