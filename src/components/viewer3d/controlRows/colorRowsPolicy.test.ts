import { describe, expect, it } from 'vitest';
import {
  HEX_COLOR_MAX_LENGTH,
  HUE_DISPLAY_LIGHTNESS,
  HUE_FULL_SATURATION,
  HUE_WHEEL_STEP,
  formatHexColorDisplay,
  getBackgroundColorStyle,
  getBackgroundStyle,
  getColorStyle,
  getHueDisplayColor,
  getHueDisplayLabel,
  getHueWheelValue,
  normalizeHexColorInput,
  normalizeHueDegrees,
  parseHueInput,
  parseHueRangeValue,
} from './colorRowsPolicy';

describe('color rows policy', () => {
  it('normalizes valid hex color inputs and rejects invalid ones', () => {
    expect(HEX_COLOR_MAX_LENGTH).toBe(7);
    expect(normalizeHexColorInput('#AABBCC')).toBe('#aabbcc');
    expect(normalizeHexColorInput('AABBCC')).toBe('#aabbcc');
    expect(normalizeHexColorInput('#abc')).toBeNull();
    expect(normalizeHexColorInput('#gggggg')).toBeNull();
    expect(formatHexColorDisplay('#aabbcc')).toBe('#AABBCC');
  });

  it('wraps hue values into the color wheel range', () => {
    expect(normalizeHueDegrees(0)).toBe(0);
    expect(normalizeHueDegrees(359)).toBe(359);
    expect(normalizeHueDegrees(360)).toBe(0);
    expect(normalizeHueDegrees(725)).toBe(5);
    expect(normalizeHueDegrees(-5)).toBe(355);
  });

  it('parses hue text inputs using wrapped degrees', () => {
    expect(parseHueInput('120')).toBe(120);
    expect(parseHueInput(' 120 ')).toBe(120);
    expect(parseHueInput('360')).toBe(0);
    expect(parseHueInput('-10')).toBe(350);
    expect(parseHueInput('120px')).toBeNull();
    expect(parseHueInput('')).toBeNull();
    expect(parseHueInput('not-a-number')).toBeNull();
  });

  it('parses hue range values without wrapping or partial numeric strings', () => {
    expect(parseHueRangeValue('0')).toBe(0);
    expect(parseHueRangeValue('360')).toBe(360);
    expect(parseHueRangeValue(' 120 ')).toBe(120);
    expect(parseHueRangeValue('-1')).toBeNull();
    expect(parseHueRangeValue('361')).toBeNull();
    expect(parseHueRangeValue('120px')).toBeNull();
    expect(parseHueRangeValue('')).toBeNull();
  });

  it('maps wheel direction to hue changes', () => {
    expect(HUE_WHEEL_STEP).toBe(5);
    expect(getHueWheelValue(10, -1)).toBe(15);
    expect(getHueWheelValue(10, 1)).toBe(5);
    expect(getHueWheelValue(2, 1)).toBe(357);
    expect(getHueWheelValue(358, -1)).toBe(3);
  });

  it('derives display color and labels from hue values', () => {
    expect(HUE_FULL_SATURATION).toBe(100);
    expect(HUE_DISPLAY_LIGHTNESS).toBe(50);
    expect(getHueDisplayColor(0)).toBe('#ff0000');
    expect(getHueDisplayColor(120)).toBe('#00ff00');
    expect(getHueDisplayLabel(45)).toBe('45\u00b0');
  });

  it('creates stable inline style objects for color rows', () => {
    expect(getColorStyle('#123456')).toEqual({ color: '#123456' });
    expect(getBackgroundColorStyle('#123456')).toEqual({ backgroundColor: '#123456' });
    expect(getBackgroundStyle('linear-gradient(red, blue)')).toEqual({
      background: 'linear-gradient(red, blue)',
    });
  });
});
