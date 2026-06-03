import type { ColorMode } from '../../../types/colmap';

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface PointCloudColorHint {
  title: string;
  lines: [string, string];
}

export const POINT_COLOR_MODE_OPTIONS: SelectOption<ColorMode>[] = [
  { value: 'rgb', label: 'RGB' },
  { value: 'error', label: 'Error' },
  { value: 'trackLength', label: 'Track Length' },
  { value: 'splats', label: 'Splats' },
];

const POINT_COLOR_HINTS: Record<ColorMode, PointCloudColorHint> = {
  rgb: {
    title: 'RGB Colors:',
    lines: ['Original point colors from', 'the reconstruction.'],
  },
  error: {
    title: 'Reprojection Error:',
    lines: ['Blue = low error (accurate)', 'Red = high error (outliers)'],
  },
  trackLength: {
    title: 'Track Length:',
    lines: ['Dark = few observations', 'Bright = many observations'],
  },
  splats: {
    title: 'Splats:',
    lines: ['3D Gaussian rendering from', 'the discovered PLY file.'],
  },
};

export function getSupportedPointColorMode(value: string): ColorMode | null {
  if (
    value === 'rgb'
    || value === 'error'
    || value === 'trackLength'
    || value === 'splats'
  ) {
    return value;
  }
  return null;
}

export function getPointCloudColorHint(colorMode: ColorMode | string): PointCloudColorHint {
  return POINT_COLOR_HINTS[getSupportedPointColorMode(colorMode) ?? 'rgb'];
}

export function getPointCloudMaxErrorLimit(
  reconstructionMaxError: number | null | undefined
): number {
  return reconstructionMaxError ?? 10;
}

export function getMaxReprojectionErrorSliderValue(
  maxReprojectionError: number | null,
  maxErrorLimit: number
): number {
  return maxReprojectionError === null ? maxErrorLimit : maxReprojectionError;
}

export function getMaxReprojectionErrorFromSliderValue(
  sliderValue: number,
  maxErrorLimit: number
): number | null {
  return sliderValue >= maxErrorLimit ? null : sliderValue;
}

export function formatMaxReprojectionError(
  maxReprojectionError: number | null,
  sliderValue: number
): string {
  return maxReprojectionError === null ? '∞' : sliderValue.toFixed(1);
}
