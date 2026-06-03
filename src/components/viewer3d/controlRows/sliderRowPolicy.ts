import type { CSSProperties } from 'react';
import { parseFiniteNumberString } from '../../../utils/numberParsing';

export const SLIDER_RANGE_PROGRESS_PROPERTY = '--range-progress';

export type SliderRangeProgressStyle = CSSProperties & Record<
  typeof SLIDER_RANGE_PROGRESS_PROPERTY,
  string
>;

export interface SliderWheelInput {
  value: number;
  min: number;
  max: number;
  step: number;
  deltaY: number;
}

export function getSliderDecimalPlaces(step: number): number {
  if (step >= 1) return 0;

  const stepText = step.toString();
  const exponentialMatch = stepText.match(/e-(\d+)$/);
  if (exponentialMatch) {
    return Number(exponentialMatch[1]);
  }

  const decimalIndex = stepText.indexOf('.');
  return decimalIndex === -1 ? 0 : stepText.length - decimalIndex - 1;
}

export function roundSliderValueToStep(value: number, step: number): number {
  const decimals = getSliderDecimalPlaces(step);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function getSafeSliderValue(
  value: number | null | undefined,
  min: number
): number {
  return value ?? min;
}

export function formatSliderValue(
  value: number,
  step: number,
  formatValue?: (value: number) => string
): string {
  return formatValue ? formatValue(value) : value.toFixed(getSliderDecimalPlaces(step));
}

export function getSliderProgress(value: number, min: number, max: number): number {
  if (max === min) {
    return 0;
  }

  return ((value - min) / (max - min)) * 100;
}

export function getSliderRangeProgressStyle(
  progress: number
): SliderRangeProgressStyle {
  return {
    [SLIDER_RANGE_PROGRESS_PROPERTY]: `${progress}%`,
  };
}

export function getCommittedSliderInputValue(
  inputValue: string,
  min: number,
  max: number,
  inputMax?: number
): number | null {
  const parsed = parseFiniteNumberString(inputValue);
  if (parsed === null) return null;

  const effectiveMax = inputMax ?? max;
  return Math.min(effectiveMax, Math.max(min, parsed));
}

export function parseSliderRangeValue(value: string): number | null {
  return parseFiniteNumberString(value);
}

export function getSliderWheelValue({
  value,
  min,
  max,
  step,
  deltaY,
}: SliderWheelInput): number {
  const delta = deltaY > 0 ? -step : step;
  const clamped = Math.min(max, Math.max(min, value + delta));

  return roundSliderValueToStep(clamped, step);
}
