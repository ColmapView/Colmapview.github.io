import { describe, expect, it } from 'vitest';
import {
  AXES_COORDINATE_SYSTEM_OPTIONS,
  AXIS_LABEL_MODE_OPTIONS,
  formatLogScaleValue,
  logSliderValueToScale,
  scaleToLogSliderValue,
} from './axesGridPanelViewModel';

describe('axes/grid panel view-model helpers', () => {
  it('defines stable coordinate system labels', () => {
    expect(AXES_COORDINATE_SYSTEM_OPTIONS).toEqual([
      { value: 'colmap', label: 'COLMAP' },
      { value: 'opencv', label: 'OpenCV' },
      { value: 'threejs', label: 'Three.js' },
      { value: 'opengl', label: 'OpenGL' },
      { value: 'vulkan', label: 'Vulkan' },
      { value: 'blender', label: 'Blender' },
      { value: 'houdini', label: 'Houdini' },
      { value: 'unity', label: 'Unity' },
      { value: 'unreal', label: 'Unreal' },
    ]);
  });

  it('defines stable axis label mode labels', () => {
    expect(AXIS_LABEL_MODE_OPTIONS).toEqual([
      { value: 'off', label: 'Off' },
      { value: 'xyz', label: 'XYZ' },
      { value: 'extra', label: 'Extra' },
    ]);
  });

  it('maps positive scales to log slider values', () => {
    expect(scaleToLogSliderValue(0.001)).toBeCloseTo(-3);
    expect(scaleToLogSliderValue(1)).toBeCloseTo(0);
    expect(scaleToLogSliderValue(1000)).toBeCloseTo(3);
  });

  it('maps log slider values back to positive scales', () => {
    expect(logSliderValueToScale(-3)).toBeCloseTo(0.001);
    expect(logSliderValueToScale(0)).toBeCloseTo(1);
    expect(logSliderValueToScale(3)).toBeCloseTo(1000);
  });

  it('formats log slider labels with the existing superscript style', () => {
    expect(formatLogScaleValue(0)).toBe('10⁰·⁰');
    expect(formatLogScaleValue(2.5)).toBe('10²·⁵');
    expect(formatLogScaleValue(-1.2)).toBe('10⁻¹·²');
  });
});
