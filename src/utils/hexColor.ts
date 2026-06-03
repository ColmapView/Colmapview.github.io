export const CSS_HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
export const CSS_HEX_COLOR_PATTERN_DESCRIPTION = 'hex color (#RRGGBB)';

export interface CssHexColorRgb {
  r: number;
  g: number;
  b: number;
}

function getHexDigitValue(char: string): number | null {
  const code = char.charCodeAt(0);

  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 70) return code - 55;
  if (code >= 97 && code <= 102) return code - 87;

  return null;
}

function readHexByte(hex: string, startIndex: number): number | null {
  const high = getHexDigitValue(hex[startIndex] ?? '');
  const low = getHexDigitValue(hex[startIndex + 1] ?? '');

  return high !== null && low !== null ? high * 16 + low : null;
}

export function normalizeCssHexColor(inputValue: string): string | null {
  const hex = inputValue.startsWith('#') ? inputValue : `#${inputValue}`;

  return CSS_HEX_COLOR_PATTERN.test(hex) ? hex.toLowerCase() : null;
}

export function getCssHexColorRgb(hex: string): CssHexColorRgb | null {
  const normalizedHex = normalizeCssHexColor(hex);
  if (normalizedHex === null) return null;

  const r = readHexByte(normalizedHex, 1);
  const g = readHexByte(normalizedHex, 3);
  const b = readHexByte(normalizedHex, 5);

  return r !== null && g !== null && b !== null ? { r, g, b } : null;
}

export function cssHexColorToInt(hex: string): number | null {
  const rgb = getCssHexColorRgb(hex);

  return rgb !== null ? (rgb.r << 16) + (rgb.g << 8) + rgb.b : null;
}

export function requireCssHexColorInt(hex: string): number {
  const value = cssHexColorToInt(hex);
  if (value === null) {
    throw new Error(`Invalid CSS hex color: ${hex}`);
  }

  return value;
}
