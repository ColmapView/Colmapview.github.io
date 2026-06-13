import { getCameraColor } from '../../theme';
import {
  computeSplatMetricColorScale,
  getSplatMetricScaleColor,
  getSplatPsnrColor,
  getSplatSsimColor,
  type SplatMetricColorScale,
} from '../viewer3d/splatPsnrMetric';
import type { GalleryBorderColorMode, ImageData } from './imageGalleryDataViewModel';

const BASE_GALLERY_BORDER_COLOR_OPTIONS: Array<{ value: GalleryBorderColorMode; label: string }> = [
  { value: 'none', label: 'Border: None' },
  { value: 'camera', label: 'Border: Camera' },
];

const SPLAT_METRIC_BORDER_COLOR_OPTIONS: Array<{ value: GalleryBorderColorMode; label: string }> = [
  { value: 'psnr', label: 'Border: PSNR' },
  { value: 'ssim', label: 'Border: SSIM' },
];

export const GALLERY_BORDER_COLOR_OPTIONS: Array<{ value: GalleryBorderColorMode; label: string }> = [
  ...BASE_GALLERY_BORDER_COLOR_OPTIONS,
  ...SPLAT_METRIC_BORDER_COLOR_OPTIONS,
];

export function getGalleryBorderColorOptions(
  hasSplatMetrics = true
): Array<{ value: GalleryBorderColorMode; label: string }> {
  return [
    ...BASE_GALLERY_BORDER_COLOR_OPTIONS,
    ...(hasSplatMetrics ? SPLAT_METRIC_BORDER_COLOR_OPTIONS : []),
  ];
}

export function getDefaultGalleryBorderColorMode(hasSplatFile: boolean): GalleryBorderColorMode {
  return hasSplatFile ? 'psnr' : 'none';
}

export function getGalleryBorderColorModeValue(
  value: string,
  hasSplatMetrics = true
): GalleryBorderColorMode | null {
  return getGalleryBorderColorOptions(hasSplatMetrics).find(option => option.value === value)?.value ?? null;
}

export function getGalleryMetricBorderColorScale(
  images: readonly ImageData[],
  borderColorMode: GalleryBorderColorMode
): SplatMetricColorScale | null {
  if (borderColorMode === 'psnr') {
    return computeSplatMetricColorScale(images.map(image => image.splatPsnr));
  }
  if (borderColorMode === 'ssim') {
    return computeSplatMetricColorScale(images.map(image => image.splatSsim));
  }
  return null;
}

export function getGalleryImageBorderColor(
  image: ImageData,
  borderColorMode: GalleryBorderColorMode,
  metricColorScale: SplatMetricColorScale | null
): string | undefined {
  if (borderColorMode === 'camera') {
    return getCameraColor(image.cameraColorIndex);
  }
  if (borderColorMode === 'psnr') {
    return metricColorScale
      ? getSplatMetricScaleColor(image.splatPsnr, metricColorScale)
      : getSplatPsnrColor(image.splatPsnr);
  }
  if (borderColorMode === 'ssim') {
    return metricColorScale
      ? getSplatMetricScaleColor(image.splatSsim, metricColorScale)
      : getSplatSsimColor(image.splatSsim);
  }
  return undefined;
}
