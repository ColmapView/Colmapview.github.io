import type { Camera, ImageId } from '../../types/colmap';
import type { CameraScaleFactor } from '../../store/types';
import { getCameraIntrinsics } from '../../utils/cameraIntrinsics';
import { isSphericalCameraModel } from '../../utils/cameraModelRegistry';
import { SPHERICAL_FLYTO_DISTANCE_FACTOR } from './sphericalFlyTo';

export {
  buildMatchedImageIds,
  getLastNavigationToImageId,
} from '../../utils/imageNavigationPolicy';

export {
  buildCameraFrustumItems,
  buildCameraIdToIndex,
  buildFrustumLineGeometryData,
  buildImageFrameIndexMap,
  getFrustumBaseColor,
  getFrustumMetricColorScale,
  getFrustumPlaneSize,
  type CameraFrustumItem,
  type FrustumColorMode,
  type FrustumGeometryItem,
  type FrustumImageSource,
  type FrustumLineGeometryData,
  type FrustumPsnrMetricSource,
  type FrustumPlaneSize,
} from './cameraFrustumGeometry';

export {
  getFrustumLineStyle,
  getImagePlaneStyle,
  getMatchesBlinkFactor,
  setRainbowColor,
  type FrustumLineColorSource,
  type FrustumLineStyle,
  type FrustumLineStyleOptions,
  type FrustumMatchesDisplayMode,
  type ImagePlaneStyle,
  type ImagePlaneStyleOptions,
} from './cameraFrustumStylePolicy';

export {
  getArrowContextMenuAction,
  getGotoContextMenuAction,
  type ArrowContextMenuAction,
  type ArrowContextMenuActionOptions,
  type GotoContextMenuAction,
  type GotoContextMenuActionOptions,
} from './cameraFrustumContextMenuPolicy';

export interface AutoFovAdjustmentOptions {
  camera: Camera;
  cameraScale: number;
  viewportWidth: number;
  viewportHeight: number;
  currentFov: number;
  targetFillRatio?: number;
  minVisibleRatio?: number;
  maxVisibleRatio?: number;
  minFov?: number;
  maxFov?: number;
}

export interface SelectedFrustumImageFetchOptions {
  isSelected: boolean;
  showImagePlane: boolean;
  hasImageFile: boolean;
}

const CAMERA_SCALE_FACTOR_VALUES: Record<CameraScaleFactor, number> = {
  '0.1': 0.1,
  '1': 1,
  '10': 10,
};

/** Format image ID label: #{camId}:{imageId} when multiple cameras, #{imageId} otherwise. */
export function formatImageId(imageId: ImageId, cameraId: number, multiCamera: boolean): string {
  return multiCamera ? `#${cameraId}:${imageId}` : `#${imageId}`;
}

export function getCameraScaleValue(
  cameraScaleBase: number,
  cameraScaleFactor: CameraScaleFactor
): number {
  return cameraScaleBase * CAMERA_SCALE_FACTOR_VALUES[cameraScaleFactor];
}

export function getAutoAdjustedFov({
  camera,
  cameraScale,
  viewportWidth,
  viewportHeight,
  currentFov,
  targetFillRatio = 0.8,
  minVisibleRatio = 0.5,
  maxVisibleRatio = 1.0,
  minFov = 5,
  maxFov = 120,
}: AutoFovAdjustmentOptions): number | null {
  // Common guards shared by both paths
  if (cameraScale <= 0 || viewportWidth <= 0 || viewportHeight <= 0 || currentFov <= 0) {
    return null;
  }

  const viewportAspect = viewportWidth / viewportHeight;
  const currentFovRad = currentFov * Math.PI / 180;

  // Spherical cameras have no real focal length; getCameraIntrinsics returns fx=fy=1 (unit
  // default), so the pinhole plane formula produces a degenerate plane of width=cameraScale*width.
  // Instead, frame the rendered sphere (radius = cameraScale) as a square target, viewed from the
  // SAME outside-stop distance the spherical fly-to lands at (planeDistance = factor * cameraScale).
  // Sharing SPHERICAL_FLYTO_DISTANCE_FACTOR keeps this fit and the fly-to in agreement (one source
  // of truth). The sphere subtends 2*asin(1/factor) ≈ 47.16° at factor 2.5.
  if (isSphericalCameraModel(camera.modelId)) {
    const sphereDiameter = 2 * cameraScale;
    const planeDistance = SPHERICAL_FLYTO_DISTANCE_FACTOR * cameraScale;
    const currentVisibleHeight = 2 * planeDistance * Math.tan(currentFovRad / 2);
    const currentVisibleWidth = currentVisibleHeight * viewportAspect;
    const heightRatio = sphereDiameter / currentVisibleHeight;
    const widthRatio = sphereDiameter / currentVisibleWidth;
    const maxRatio = Math.max(heightRatio, widthRatio);

    if (!Number.isFinite(maxRatio) || (maxRatio <= maxVisibleRatio && maxRatio >= minVisibleRatio)) {
      return null;
    }

    // The sphere is square (aspect 1:1). For a landscape viewport the height axis constrains;
    // for a portrait/square viewport the width axis constrains.
    let targetFov: number;
    if (1.0 < viewportAspect) {
      // Landscape: height constrains
      const targetVisibleHeight = sphereDiameter / targetFillRatio;
      targetFov = 2 * Math.atan(targetVisibleHeight / (2 * planeDistance)) * 180 / Math.PI;
    } else {
      // Portrait/square: width constrains
      const targetVisibleWidth = sphereDiameter / targetFillRatio;
      const targetVisibleHeight = targetVisibleWidth / viewportAspect;
      targetFov = 2 * Math.atan(targetVisibleHeight / (2 * planeDistance)) * 180 / Math.PI;
    }

    if (!Number.isFinite(targetFov)) return null;
    return Math.max(minFov, Math.min(maxFov, targetFov));
  }

  // Pinhole / fisheye cameras: frame the image plane projected at depth=cameraScale
  const { fx, fy } = getCameraIntrinsics(camera);
  if (
    camera.width <= 0 ||
    camera.height <= 0 ||
    fx <= 0 ||
    fy <= 0 ||
    !Number.isFinite(fx) ||
    !Number.isFinite(fy)
  ) {
    return null;
  }

  const planeWidth = cameraScale * camera.width / fx;
  const planeHeight = cameraScale * camera.height / fy;
  const planeDistance = cameraScale;
  const currentVisibleHeight = 2 * planeDistance * Math.tan(currentFovRad / 2);
  const currentVisibleWidth = currentVisibleHeight * viewportAspect;
  const heightRatio = planeHeight / currentVisibleHeight;
  const widthRatio = planeWidth / currentVisibleWidth;
  const maxRatio = Math.max(heightRatio, widthRatio);

  if (
    !Number.isFinite(maxRatio) ||
    (maxRatio <= maxVisibleRatio && maxRatio >= minVisibleRatio)
  ) {
    return null;
  }

  const planeAspect = planeWidth / planeHeight;
  let targetFov: number;
  if (planeAspect < viewportAspect) {
    const targetVisibleHeight = planeHeight / targetFillRatio;
    targetFov = 2 * Math.atan(targetVisibleHeight / (2 * planeDistance)) * 180 / Math.PI;
  } else {
    const targetVisibleWidth = planeWidth / targetFillRatio;
    const targetVisibleHeight = targetVisibleWidth / viewportAspect;
    targetFov = 2 * Math.atan(targetVisibleHeight / (2 * planeDistance)) * 180 / Math.PI;
  }

  if (!Number.isFinite(targetFov)) return null;
  return Math.max(minFov, Math.min(maxFov, targetFov));
}

export function getWheelAdjustedFov(
  currentFov: number,
  deltaY: number,
  step = 2,
  minFov = 10,
  maxFov = 179
): number {
  const delta = deltaY > 0 ? step : -step;
  return Math.max(minFov, Math.min(maxFov, currentFov + delta));
}

export function shouldFetchSelectedFrustumImageFile({
  isSelected,
  showImagePlane,
  hasImageFile,
}: SelectedFrustumImageFetchOptions): boolean {
  return isSelected && showImagePlane && !hasImageFile;
}
