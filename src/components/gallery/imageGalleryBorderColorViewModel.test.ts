import { describe, expect, it } from 'vitest';
import { getCameraColor } from '../../theme';
import { SPLAT_PSNR_GREEN, SPLAT_PSNR_UNAVAILABLE_COLOR } from '../viewer3d/splatPsnrMetric';
import type { ImageData } from './imageGalleryDataViewModel';
import {
  GALLERY_BORDER_COLOR_OPTIONS,
  getDefaultGalleryBorderColorMode,
  getGalleryBorderColorModeValue,
  getGalleryImageBorderColor,
  getGalleryMetricBorderColorScale,
} from './imageGalleryBorderColorViewModel';

function createImage(overrides: Partial<ImageData> = {}): ImageData {
  return {
    imageId: 1,
    name: 'image.jpg',
    numPoints2D: 0,
    numPoints3D: 0,
    cameraId: 1,
    cameraColorIndex: 2,
    cameraWidth: 640,
    cameraHeight: 480,
    covisibleCount: 0,
    avgError: 0,
    ...overrides,
  };
}

describe('image gallery border color view-model', () => {
  it('defines select options and defaults from splat presence', () => {
    expect(GALLERY_BORDER_COLOR_OPTIONS.map(option => option.value)).toEqual([
      'none',
      'camera',
      'psnr',
      'ssim',
    ]);
    expect(getDefaultGalleryBorderColorMode(true)).toBe('psnr');
    expect(getDefaultGalleryBorderColorMode(false)).toBe('none');
    expect(getGalleryBorderColorModeValue('camera')).toBe('camera');
    expect(getGalleryBorderColorModeValue('unknown')).toBeNull();
  });

  it('colors image borders by camera and metric scales', () => {
    const low = createImage({ imageId: 1, cameraColorIndex: 1, splatPsnr: 20, splatSsim: 0.8 });
    const high = createImage({ imageId: 2, cameraColorIndex: 2, splatPsnr: 30, splatSsim: 0.95 });
    const psnrScale = getGalleryMetricBorderColorScale([low, high], 'psnr');
    const ssimScale = getGalleryMetricBorderColorScale([low, high], 'ssim');

    expect(getGalleryImageBorderColor(low, 'none', null)).toBeUndefined();
    expect(getGalleryImageBorderColor(low, 'camera', null)).toBe(getCameraColor(1));
    expect(getGalleryImageBorderColor(high, 'psnr', psnrScale)).toBe(SPLAT_PSNR_GREEN);
    expect(getGalleryImageBorderColor(high, 'ssim', ssimScale)).toBe(SPLAT_PSNR_GREEN);
  });

  it('uses unavailable metric color when selected metric is missing', () => {
    const missing = createImage();

    expect(getGalleryMetricBorderColorScale([missing], 'psnr')).toBeNull();
    expect(getGalleryImageBorderColor(missing, 'psnr', null)).toBe(SPLAT_PSNR_UNAVAILABLE_COLOR);
    expect(getGalleryImageBorderColor(missing, 'ssim', null)).toBe(SPLAT_PSNR_UNAVAILABLE_COLOR);
  });
});
