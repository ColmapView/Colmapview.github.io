import { describe, expect, it } from 'vitest';
import {
  getLogoPlacement,
  getScreenshotDimensions,
  getScreenshotImageConfig,
  isCustomScreenshotSize,
} from './screenshotCaptureViewModel';

describe('screenshot capture view-model helpers', () => {
  it('derives logo placement from canvas and logo dimensions', () => {
    expect(getLogoPlacement(500, 400, 200, 0.12, 0.04)).toEqual({
      x: 20,
      y: 420,
      width: 120,
      height: 60,
    });
  });

  it('derives screenshot image export settings', () => {
    expect(getScreenshotImageConfig('jpeg')).toEqual({
      mimeType: 'image/jpeg',
      ext: 'jpg',
      quality: 0.92,
    });
    expect(getScreenshotImageConfig('png')).toEqual({
      mimeType: 'image/png',
      ext: 'png',
      quality: undefined,
    });
  });

  it('parses configured screenshot dimensions', () => {
    expect(isCustomScreenshotSize('current')).toBe(false);
    expect(isCustomScreenshotSize('1920x1080')).toBe(true);
    expect(getScreenshotDimensions('current', 800, 600)).toEqual({ width: 800, height: 600 });
    expect(getScreenshotDimensions('2048x2048', 800, 600)).toEqual({ width: 2048, height: 2048 });
  });
});
