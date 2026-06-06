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

export interface PointGeometryLayerProps {
  renderOrder: number;
  vertexColors: boolean;
  depthTest: boolean;
  depthWrite: boolean;
}

export const POINT_GEOMETRY_RENDER_ORDER = 1;
export const SPARK_SPLAT_RENDER_ORDER = 2;
export const SPLAT_POINT_OVERLAY_RENDER_ORDER = 3;

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

export function getPointGeometryLayerProps(colorMode: ColorMode): PointGeometryLayerProps {
  if (isSplatPointOverlayColorMode(colorMode)) {
    return {
      renderOrder: SPLAT_POINT_OVERLAY_RENDER_ORDER,
      vertexColors: false,
      depthTest: false,
      depthWrite: false,
    };
  }

  return {
    renderOrder: POINT_GEOMETRY_RENDER_ORDER,
    vertexColors: true,
    depthTest: true,
    depthWrite: true,
  };
}
