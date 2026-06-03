import { describe, expect, it } from 'vitest';
import {
  SELECTION_COLOR_MODE_OPTIONS,
  getSelectionHighlightHint,
  getSupportedSelectionColorMode,
  shouldShowSelectionColorControl,
  shouldShowSelectionSpeedControl,
} from './selectionHighlightPanelViewModel';

describe('selection highlight panel view-model helpers', () => {
  it('defines stable selection color mode labels', () => {
    expect(SELECTION_COLOR_MODE_OPTIONS).toEqual([
      { value: 'static', label: 'Static' },
      { value: 'blink', label: 'Blink' },
      { value: 'rainbow', label: 'Rainbow' },
    ]);
  });

  it('shows the color control for static and blink modes', () => {
    expect(shouldShowSelectionColorControl('static')).toBe(true);
    expect(shouldShowSelectionColorControl('blink')).toBe(true);
    expect(shouldShowSelectionColorControl('rainbow')).toBe(false);
  });

  it('shows the speed control for blink and rainbow modes', () => {
    expect(shouldShowSelectionSpeedControl('static')).toBe(false);
    expect(shouldShowSelectionSpeedControl('blink')).toBe(true);
    expect(shouldShowSelectionSpeedControl('rainbow')).toBe(true);
  });

  it('returns selection highlight hints by mode', () => {
    expect(getSelectionHighlightHint('static')).toEqual({
      title: 'Static:',
      lines: ['Solid color highlight', 'for selected camera.'],
    });
    expect(getSelectionHighlightHint('blink')).toEqual({
      title: 'Blink:',
      lines: ['Selected camera pulses', 'to draw attention.'],
    });
    expect(getSelectionHighlightHint('rainbow')).toEqual({
      title: 'Rainbow:',
      lines: ['Selected camera cycles', 'through all colors.'],
    });
  });

  it('falls back to rainbow for stale selection color modes', () => {
    expect(getSupportedSelectionColorMode('off')).toBeNull();
    expect(shouldShowSelectionColorControl('off')).toBe(false);
    expect(shouldShowSelectionSpeedControl('off')).toBe(false);
    expect(getSelectionHighlightHint('off')).toEqual({
      title: 'Rainbow:',
      lines: ['Selected camera cycles', 'through all colors.'],
    });
  });
});
