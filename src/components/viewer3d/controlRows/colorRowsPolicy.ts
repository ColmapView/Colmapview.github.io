import type { CSSProperties } from 'react';
import { hslToHex } from '../../../utils/colorUtils';
import { normalizeCssHexColor } from '../../../utils/hexColor';
import { parseSafeIntegerString } from '../../../utils/numberParsing';

export const HUE_WHEEL_STEP = 5;
export const HUE_FULL_SATURATION = 100;
export const HUE_DISPLAY_LIGHTNESS = 50;
export const HEX_COLOR_MAX_LENGTH = 7;

export function normalizeHexColorInput(inputValue: string): string | null {
  return normalizeCssHexColor(inputValue);
}

export function formatHexColorDisplay(value: string): string {
  return value.toUpperCase();
}

export function normalizeHueDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function parseHueInput(inputValue: string): number | null {
  const parsed = parseSafeIntegerString(inputValue, { allowSign: true });

  return parsed !== null ? normalizeHueDegrees(parsed) : null;
}

export function parseHueRangeValue(inputValue: string): number | null {
  return parseSafeIntegerString(inputValue, { min: 0, max: 360 });
}

export function getHueWheelValue(value: number, deltaY: number): number {
  const delta = deltaY > 0 ? -HUE_WHEEL_STEP : HUE_WHEEL_STEP;

  return normalizeHueDegrees(value + delta);
}

export function getHueDisplayColor(value: number): string {
  return hslToHex(value, HUE_FULL_SATURATION, HUE_DISPLAY_LIGHTNESS);
}

export function getHueDisplayLabel(value: number): string {
  return `${value}\u00b0`;
}

export function getColorStyle(value: string): CSSProperties {
  return { color: value };
}

export function getBackgroundColorStyle(value: string): CSSProperties {
  return { backgroundColor: value };
}

export function getBackgroundStyle(value: string): CSSProperties {
  return { background: value };
}
