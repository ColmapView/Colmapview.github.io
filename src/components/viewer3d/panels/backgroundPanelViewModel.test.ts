import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_PANEL_LABELS,
  BACKGROUND_PANEL_TITLE,
  BACKGROUND_PANEL_TOOLTIP,
  formatBackgroundPercentValue,
} from './backgroundPanelViewModel';

describe('background panel view-model helpers', () => {
  it('defines stable panel title and tooltip copy', () => {
    expect(BACKGROUND_PANEL_TOOLTIP).toBe('Background color (B)');
    expect(BACKGROUND_PANEL_TITLE).toBe('Background Color (B)');
  });

  it('defines stable color control labels', () => {
    expect(BACKGROUND_PANEL_LABELS).toEqual({
      color: 'Color',
      hue: 'Hue',
      saturation: 'Saturation',
      lightness: 'Lightness',
    });
  });

  it('formats percent slider values with rounded whole numbers', () => {
    expect(formatBackgroundPercentValue(0)).toBe('0%');
    expect(formatBackgroundPercentValue(33.4)).toBe('33%');
    expect(formatBackgroundPercentValue(33.5)).toBe('34%');
    expect(formatBackgroundPercentValue(100)).toBe('100%');
  });
});
