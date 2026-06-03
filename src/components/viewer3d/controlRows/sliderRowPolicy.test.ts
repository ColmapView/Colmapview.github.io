import { describe, expect, it } from 'vitest';
import {
  SLIDER_RANGE_PROGRESS_PROPERTY,
  formatSliderValue,
  getCommittedSliderInputValue,
  getSafeSliderValue,
  getSliderDecimalPlaces,
  getSliderProgress,
  getSliderRangeProgressStyle,
  getSliderWheelValue,
  parseSliderRangeValue,
  roundSliderValueToStep,
} from './sliderRowPolicy';

describe('slider row policy', () => {
  it('derives decimal precision from slider step values', () => {
    expect(getSliderDecimalPlaces(1)).toBe(0);
    expect(getSliderDecimalPlaces(0.1)).toBe(1);
    expect(getSliderDecimalPlaces(0.05)).toBe(2);
    expect(getSliderDecimalPlaces(1e-7)).toBe(7);
  });

  it('rounds wheel values to the step precision', () => {
    expect(roundSliderValueToStep(2.1000000001, 0.1)).toBe(2.1);
    expect(roundSliderValueToStep(0.333333, 0.01)).toBe(0.33);
  });

  it('formats safe values and supports custom labels', () => {
    expect(getSafeSliderValue(null, 4)).toBe(4);
    expect(getSafeSliderValue(undefined, 4)).toBe(4);
    expect(getSafeSliderValue(7, 4)).toBe(7);

    expect(formatSliderValue(1.5, 0.1)).toBe('1.5');
    expect(formatSliderValue(0.125, 0.01)).toBe('0.13');
    expect(formatSliderValue(0.42, 0.01, value => `${Math.round(value * 100)}%`)).toBe('42%');
  });

  it('computes range progress style data', () => {
    expect(getSliderProgress(5, 0, 10)).toBe(50);
    expect(getSliderProgress(5, 5, 5)).toBe(0);
    expect(getSliderRangeProgressStyle(62.5)).toEqual({
      [SLIDER_RANGE_PROGRESS_PROPERTY]: '62.5%',
    });
  });

  it('commits typed input with min and optional input max clamping', () => {
    expect(getCommittedSliderInputValue('abc', 0, 10)).toBeNull();
    expect(getCommittedSliderInputValue('4px', 0, 10)).toBeNull();
    expect(getCommittedSliderInputValue('-5', 0, 10)).toBe(0);
    expect(getCommittedSliderInputValue('12', 0, 10)).toBe(10);
    expect(getCommittedSliderInputValue('12', 0, 10, 20)).toBe(12);
  });

  it('parses range event values with the same finite-number rules', () => {
    expect(parseSliderRangeValue('0.5')).toBe(0.5);
    expect(parseSliderRangeValue('0.5px')).toBeNull();
  });

  it('maps wheel direction to clamped stepped values', () => {
    expect(getSliderWheelValue({
      value: 2,
      min: 0,
      max: 10,
      step: 0.1,
      deltaY: -1,
    })).toBe(2.1);

    expect(getSliderWheelValue({
      value: 2,
      min: 0,
      max: 10,
      step: 0.1,
      deltaY: 1,
    })).toBe(1.9);

    expect(getSliderWheelValue({
      value: 10,
      min: 0,
      max: 10,
      step: 1,
      deltaY: -1,
    })).toBe(10);
  });
});
