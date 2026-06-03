import { describe, expect, it } from 'vitest';
import {
  POINT_COLOR_MODE_OPTIONS,
  formatMaxReprojectionError,
  getMaxReprojectionErrorFromSliderValue,
  getMaxReprojectionErrorSliderValue,
  getPointCloudColorHint,
  getPointCloudMaxErrorLimit,
  getSupportedPointColorMode,
} from './pointCloudPanelViewModel';

describe('point cloud panel view-model helpers', () => {
  it('defines stable point color mode labels', () => {
    expect(POINT_COLOR_MODE_OPTIONS).toEqual([
      { value: 'rgb', label: 'RGB' },
      { value: 'error', label: 'Error' },
      { value: 'trackLength', label: 'Track Length' },
      { value: 'splats', label: 'Splats' },
    ]);
  });

  it('returns point color hints by mode', () => {
    expect(getPointCloudColorHint('rgb')).toEqual({
      title: 'RGB Colors:',
      lines: ['Original point colors from', 'the reconstruction.'],
    });
    expect(getPointCloudColorHint('error')).toEqual({
      title: 'Reprojection Error:',
      lines: ['Blue = low error (accurate)', 'Red = high error (outliers)'],
    });
    expect(getPointCloudColorHint('trackLength')).toEqual({
      title: 'Track Length:',
      lines: ['Dark = few observations', 'Bright = many observations'],
    });
    expect(getPointCloudColorHint('splats')).toEqual({
      title: 'Splats:',
      lines: ['3D Gaussian rendering from', 'the discovered PLY file.'],
    });
  });

  it('falls back to RGB for stale point color modes', () => {
    expect(getSupportedPointColorMode('height')).toBeNull();
    expect(getPointCloudColorHint('height')).toEqual({
      title: 'RGB Colors:',
      lines: ['Original point colors from', 'the reconstruction.'],
    });
  });

  it('uses the reconstruction max error when available and keeps the fallback otherwise', () => {
    expect(getPointCloudMaxErrorLimit(4.25)).toBe(4.25);
    expect(getPointCloudMaxErrorLimit(null)).toBe(10);
    expect(getPointCloudMaxErrorLimit(undefined)).toBe(10);
  });

  it('maps unlimited max reprojection error to the slider limit', () => {
    expect(getMaxReprojectionErrorSliderValue(null, 12)).toBe(12);
    expect(getMaxReprojectionErrorSliderValue(3.5, 12)).toBe(3.5);
  });

  it('maps the slider limit back to unlimited reprojection error', () => {
    expect(getMaxReprojectionErrorFromSliderValue(11.9, 12)).toBe(11.9);
    expect(getMaxReprojectionErrorFromSliderValue(12, 12)).toBeNull();
    expect(getMaxReprojectionErrorFromSliderValue(12.1, 12)).toBeNull();
  });

  it('formats unlimited and finite reprojection error values', () => {
    expect(formatMaxReprojectionError(null, 12)).toBe('∞');
    expect(formatMaxReprojectionError(3.25, 3.25)).toBe('3.3');
  });
});
