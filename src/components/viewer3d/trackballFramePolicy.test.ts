import { describe, expect, it } from 'vitest';
import {
  getAutoRotateDelta,
  getCappedFrameDeltaMs,
  getFrameDamping,
  getOrbitDistanceStep,
  shouldApplyAngularVelocity,
} from './trackballFramePolicy';

describe('trackball frame policy', () => {
  it('caps frame deltas before deriving damping', () => {
    expect(getCappedFrameDeltaMs(250, 100, 100)).toBe(100);
    expect(getCappedFrameDeltaMs(125, 100, 100)).toBe(25);
    expect(getFrameDamping(0.9, 16, 16)).toBeCloseTo(0.9);
    expect(getFrameDamping(0.9, 32, 16)).toBeCloseTo(0.81);
  });

  it('applies angular velocity only above the configured threshold', () => {
    expect(shouldApplyAngularVelocity({ x: 0.02, y: 0 }, 0.01)).toBe(true);
    expect(shouldApplyAngularVelocity({ x: 0, y: -0.02 }, 0.01)).toBe(true);
    expect(shouldApplyAngularVelocity({ x: 0.01, y: -0.01 }, 0.01)).toBe(false);
  });

  it('steps orbit distance only when the target distance is meaningfully different', () => {
    expect(getOrbitDistanceStep(10, 10.00005, 0.0001, 0.2)).toEqual({
      distance: 10,
      changed: false,
    });
    expect(getOrbitDistanceStep(10, 20, 0.0001, 0.2)).toEqual({
      distance: 12,
      changed: true,
    });
  });

  it('derives auto-rotate direction from mode and frame time', () => {
    expect(getAutoRotateDelta('off', 2, 500)).toBe(0);
    expect(getAutoRotateDelta('cw', 2, 500)).toBe(1);
    expect(getAutoRotateDelta('ccw', 2, 500)).toBe(-1);
  });
});
