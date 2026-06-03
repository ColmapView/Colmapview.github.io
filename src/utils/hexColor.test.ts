import { describe, expect, it } from 'vitest';
import {
  cssHexColorToInt,
  getCssHexColorRgb,
  normalizeCssHexColor,
  requireCssHexColorInt,
} from './hexColor';

describe('hex color utilities', () => {
  it('normalizes full CSS hex colors and preserves strict length', () => {
    expect(normalizeCssHexColor('#AABBCC')).toBe('#aabbcc');
    expect(normalizeCssHexColor('AABBCC')).toBe('#aabbcc');
    expect(normalizeCssHexColor('#abc')).toBeNull();
    expect(normalizeCssHexColor('#aabbccd')).toBeNull();
    expect(normalizeCssHexColor(' #aabbcc')).toBeNull();
  });

  it('rejects non-hex digits before deriving channels', () => {
    expect(getCssHexColorRgb('#00ffaa')).toEqual({ r: 0, g: 255, b: 170 });
    expect(getCssHexColorRgb('#00ffag')).toBeNull();
  });

  it('converts CSS hex colors to Three.js integer colors without partial parsing', () => {
    expect(cssHexColorToInt('#ff4444')).toBe(0xff4444);
    expect(cssHexColorToInt('#000000')).toBe(0x000000);
    expect(cssHexColorToInt('#fffffg')).toBeNull();
    expect(cssHexColorToInt('#fffffff')).toBeNull();
  });

  it('throws when a required internal color constant is malformed', () => {
    expect(requireCssHexColorInt('#ffffff')).toBe(0xffffff);
    expect(() => requireCssHexColorInt('#fff')).toThrow('Invalid CSS hex color: #fff');
  });
});
