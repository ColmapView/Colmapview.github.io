import type { ScreenshotFormat, ScreenshotSize } from '../../store/types';
import type { RecordingDimensions } from './screenshotRecordingPolicy';

export interface LogoPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenshotImageConfig {
  mimeType: string;
  ext: string;
  quality?: number;
}

export function getLogoPlacement(
  canvasHeight: number,
  logoWidth: number,
  logoHeight: number,
  logoHeightPercent: number,
  paddingPercent: number
): LogoPlacement {
  const height = canvasHeight * logoHeightPercent;
  const width = (logoWidth / logoHeight) * height;
  const padding = canvasHeight * paddingPercent;

  return {
    x: padding,
    y: canvasHeight - height - padding,
    width,
    height,
  };
}

export function getScreenshotImageConfig(format: ScreenshotFormat): ScreenshotImageConfig {
  return {
    mimeType: `image/${format}`,
    ext: format === 'jpeg' ? 'jpg' : format,
    quality: format === 'jpeg' ? 0.92 : undefined,
  };
}

export function isCustomScreenshotSize(size: ScreenshotSize): boolean {
  return size !== 'current';
}

export function getScreenshotDimensions(
  screenshotSize: ScreenshotSize,
  currentWidth: number,
  currentHeight: number
): RecordingDimensions {
  if (!isCustomScreenshotSize(screenshotSize)) {
    return { width: currentWidth, height: currentHeight };
  }

  const [width, height] = screenshotSize.split('x').map(Number);
  return { width, height };
}
