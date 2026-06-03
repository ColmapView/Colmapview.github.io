import { describe, expect, it } from 'vitest';
import {
  VIEW_DIRECTION_BUTTON_ROWS,
  VIEW_PROJECTION_OPTIONS,
  formatCameraFovValue,
  shouldShowCameraFovSlider,
} from './viewPanelViewModel';

describe('view panel view-model helpers', () => {
  it('defines stable projection button labels', () => {
    expect(VIEW_PROJECTION_OPTIONS).toEqual([
      { value: 'perspective', label: 'Persp' },
      { value: 'orthographic', label: 'Ortho' },
    ]);
  });

  it('defines stable view direction button rows', () => {
    expect(VIEW_DIRECTION_BUTTON_ROWS).toEqual([
      [
        { direction: 'x', label: '+X', hotkey: '1' },
        { direction: 'y', label: '+Y', hotkey: '2' },
        { direction: 'z', label: '+Z', hotkey: '3' },
      ],
      [
        { direction: '-x', label: '-X', hotkey: '4' },
        { direction: '-y', label: '-Y', hotkey: '5' },
        { direction: '-z', label: '-Z', hotkey: '6' },
      ],
    ]);
  });

  it('shows FOV controls only for perspective projection', () => {
    expect(shouldShowCameraFovSlider('perspective')).toBe(true);
    expect(shouldShowCameraFovSlider('orthographic')).toBe(false);
  });

  it('formats camera FOV labels with one decimal degree', () => {
    expect(formatCameraFovValue(60)).toBe('60.0°');
    expect(formatCameraFovValue(72.34)).toBe('72.3°');
  });
});
