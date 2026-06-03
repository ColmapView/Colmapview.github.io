import { describe, expect, it } from 'vitest';
import {
  getNextSelectionRainbowHue,
  getSelectionBlinkFactor,
  getSelectionBlinkOpacity,
} from './frustumPlaneSelectionBorderPolicy';

describe('frustum plane selection border policy', () => {
  it('advances rainbow hue by delta, animation speed, and speed multiplier', () => {
    expect(getNextSelectionRainbowHue({
      hue: 0.2,
      delta: 0.5,
      animationSpeed: 2,
      speedMultiplier: 0.25,
    })).toBeCloseTo(0.45);
  });

  it('wraps rainbow hue into the unit interval', () => {
    expect(getNextSelectionRainbowHue({
      hue: 0.9,
      delta: 1,
      animationSpeed: 1,
      speedMultiplier: 0.25,
    })).toBeCloseTo(0.15);
  });

  it('calculates blink factor from elapsed time and animation speed', () => {
    expect(getSelectionBlinkFactor({
      elapsedTime: Math.PI / 4,
      animationSpeed: 1,
    })).toBeCloseTo(1);
  });

  it('maps blink factor to the selected-border opacity range', () => {
    expect(getSelectionBlinkOpacity(0)).toBeCloseTo(0.3);
    expect(getSelectionBlinkOpacity(1)).toBeCloseTo(1);
  });
});
