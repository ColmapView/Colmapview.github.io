import { describe, expect, it } from 'vitest';
import {
  POINT_COLOR_MODE_OPTIONS,
  formatMaxReprojectionError,
  getActiveSplatFileSelectValue,
  getMaxReprojectionErrorFromSliderValue,
  getMaxReprojectionErrorSliderValue,
  getPointCloudColorHint,
  getPointCloudMaxErrorLimit,
  getPointColorModeOptions,
  getActiveSplatSourceSelectValue,
  getSplatFileFromSelectValue,
  getSplatFileSelectOptions,
  getSplatSourceSelectOptions,
  getSplatSourceSelectOptionsWithNone,
  getSupportedPointColorMode,
  shouldShowSplatPointOverlayColorControl,
  shouldShowSplatPointOverlaySpeedControl,
} from './pointCloudPanelViewModel';

describe('point cloud panel view-model helpers', () => {
  it('defines stable point color mode labels', () => {
    expect(POINT_COLOR_MODE_OPTIONS).toEqual([
      { value: 'rgb', label: 'RGB' },
      { value: 'error', label: 'Error' },
      { value: 'trackLength', label: 'Track Length' },
      { value: 'splats', label: 'Splats' },
      { value: 'splatPoints', label: 'Splats + Points' },
      { value: 'splatRainbowPoints', label: 'Splats + Rainbow' },
    ]);
  });

  it('drops the splat color modes when the dataset has no splat data', () => {
    expect(getPointColorModeOptions(false)).toEqual([
      { value: 'rgb', label: 'RGB' },
      { value: 'error', label: 'Error' },
      { value: 'trackLength', label: 'Track Length' },
    ]);
  });

  it('offers all six color modes when the dataset has splat data', () => {
    expect(getPointColorModeOptions(true)).toEqual(POINT_COLOR_MODE_OPTIONS);
    expect(getPointColorModeOptions(true)).toHaveLength(6);
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
      lines: ['3D Gaussian rendering from', 'the selected splat file.'],
    });
    expect(getPointCloudColorHint('splatPoints')).toEqual({
      title: 'Splats + Points:',
      lines: ['Blinking COLMAP points over', 'the splat rendering.'],
    });
    expect(getPointCloudColorHint('splatRainbowPoints')).toEqual({
      title: 'Splats + Rainbow:',
      lines: ['Rainbow COLMAP points over', 'the splat rendering.'],
    });
  });

  it('falls back to RGB for stale point color modes', () => {
    expect(getSupportedPointColorMode('height')).toBeNull();
    expect(getPointCloudColorHint('height')).toEqual({
      title: 'RGB Colors:',
      lines: ['Original point colors from', 'the reconstruction.'],
    });
  });

  it('shows overlay color and speed controls only for splat point overlay modes', () => {
    expect(shouldShowSplatPointOverlayColorControl('splatPoints')).toBe(true);
    expect(shouldShowSplatPointOverlayColorControl('splatRainbowPoints')).toBe(false);
    expect(shouldShowSplatPointOverlayColorControl('splats')).toBe(false);

    expect(shouldShowSplatPointOverlaySpeedControl('splatPoints')).toBe(true);
    expect(shouldShowSplatPointOverlaySpeedControl('splatRainbowPoints')).toBe(true);
    expect(shouldShowSplatPointOverlaySpeedControl('rgb')).toBe(false);
  });

  it('builds stable splat file select options and resolves selected values by index', () => {
    const ply = new File(['ply'], 'model.ply');
    const spz = new File(['spz'], 'model.spz');
    const files = [spz, ply];

    expect(getSplatFileSelectOptions(files)).toEqual([
      { value: '0', label: '1. model.spz' },
      { value: '1', label: '2. model.ply' },
    ]);
    expect(getActiveSplatFileSelectValue(files, ply)).toBe('1');
    expect(getActiveSplatFileSelectValue(files, undefined)).toBe('0');
    expect(getSplatFileFromSelectValue(files, '0')).toBe(spz);
    expect(getSplatFileFromSelectValue(files, '1')).toBe(ply);
    expect(getSplatFileFromSelectValue(files, '2')).toBeNull();
  });

  it('builds splat SOURCE options (lazy catalog) keyed by id, numbered only when many', () => {
    const sources = [
      { id: 'splats/a.ply', path: 'splats/a.ply', url: 'u/a' },
      { id: 'splats/b.spz', path: 'splats/b.spz', file: new File(['b'], 'b.spz') },
    ];

    expect(getSplatSourceSelectOptions(sources)).toEqual([
      { value: 'splats/a.ply', label: '1. a.ply' },
      { value: 'splats/b.spz', label: '2. b.spz' },
    ]);
    // A single source is not numbered.
    expect(getSplatSourceSelectOptions([sources[0]])).toEqual([
      { value: 'splats/a.ply', label: 'a.ply' },
    ]);

    const withNone = getSplatSourceSelectOptionsWithNone(sources);
    expect(withNone[0]).toEqual({ value: '', label: 'None - COLMAP only' });
    expect(withNone.slice(1).map((o) => o.value)).toEqual(['splats/a.ply', 'splats/b.spz']);

    expect(getActiveSplatSourceSelectValue(sources, 'splats/b.spz')).toBe('splats/b.spz');
    expect(getActiveSplatSourceSelectValue(sources, null)).toBe(''); // COLMAP only
    expect(getActiveSplatSourceSelectValue(sources, 'missing')).toBe('');
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
