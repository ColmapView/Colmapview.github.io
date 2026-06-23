import type { ColorMode, SplatFileSource } from '../../../types/colmap';

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
  { value: 'splatPoints', label: 'Splats + Points' },
  { value: 'splatRainbowPoints', label: 'Splats + Rainbow' },
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
    lines: ['3D Gaussian rendering from', 'the selected splat file.'],
  },
  splatPoints: {
    title: 'Splats + Points:',
    lines: ['Blinking COLMAP points over', 'the splat rendering.'],
  },
  splatRainbowPoints: {
    title: 'Splats + Rainbow:',
    lines: ['Rainbow COLMAP points over', 'the splat rendering.'],
  },
};

export function getSupportedPointColorMode(value: string): ColorMode | null {
  if (
    value === 'rgb'
    || value === 'error'
    || value === 'trackLength'
    || value === 'splats'
    || value === 'splatPoints'
    || value === 'splatRainbowPoints'
  ) {
    return value;
  }
  return null;
}

export function shouldShowSplatPointOverlayColorControl(colorMode: ColorMode | string): boolean {
  return getSupportedPointColorMode(colorMode) === 'splatPoints';
}

export function shouldShowSplatPointOverlaySpeedControl(colorMode: ColorMode | string): boolean {
  const supportedMode = getSupportedPointColorMode(colorMode);
  return supportedMode === 'splatPoints' || supportedMode === 'splatRainbowPoints';
}

export function getSplatFileSelectOptions(files: readonly File[]): SelectOption<string>[] {
  return files.map((file, index) => ({
    value: String(index),
    label: files.length > 1 ? `${index + 1}. ${file.name}` : file.name,
  }));
}

export function getActiveSplatFileSelectValue(
  files: readonly File[],
  activeFile: File | undefined
): string {
  const activeIndex = activeFile ? files.indexOf(activeFile) : -1;
  return String(activeIndex >= 0 ? activeIndex : 0);
}

function getSplatSourceLabel(source: SplatFileSource, index: number, total: number): string {
  const name = source.path.split('/').pop() || source.path;
  return total > 1 ? `${index + 1}. ${name}` : name;
}

/**
 * Build splat selector options keyed by source id, covering every tile
 * (including lazy ones not yet downloaded). Selecting a lazy tile triggers an
 * on-demand fetch.
 */
export function getSplatSourceSelectOptions(
  sources: readonly SplatFileSource[]
): SelectOption<string>[] {
  return sources.map((source, index) => ({
    value: source.id,
    label: getSplatSourceLabel(source, index, sources.length),
  }));
}

export function getActiveSplatSourceSelectValue(
  sources: readonly SplatFileSource[],
  activeSourceId: string | null
): string {
  if (activeSourceId && sources.some((source) => source.id === activeSourceId)) {
    return activeSourceId;
  }
  // No active splat -> empty value selects the "COLMAP only" option.
  return '';
}

const COLMAP_ONLY_SPLAT_OPTION: SelectOption<string> = { value: '', label: 'None - COLMAP only' };

/**
 * Splat selector options with a leading "COLMAP only" entry so the user can
 * display the COLMAP scene without a splat (or unload the current one).
 */
export function getSplatSourceSelectOptionsWithNone(
  sources: readonly SplatFileSource[]
): SelectOption<string>[] {
  return [COLMAP_ONLY_SPLAT_OPTION, ...getSplatSourceSelectOptions(sources)];
}

export function getSplatFileFromSelectValue(
  files: readonly File[],
  value: string
): File | null {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0 || index >= files.length) {
    return null;
  }

  return files[index];
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
