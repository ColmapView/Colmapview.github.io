import { describe, it, expect } from 'vitest';
import {
  computeErrorStats,
  computeTrackStats,
  normalizeValue,
  safeMinMax,
  computePointColors,
  computeSinglePointColor,
  type MinMaxStats,
} from './pointCloudUtils';

describe('computeErrorStats', () => {
  it('handles empty array', () => {
    const errors = new Float32Array(0);
    const result = computeErrorStats(errors);
    expect(result.min).toBe(Infinity);
    expect(result.max).toBe(-Infinity);
  });

  it('handles single value', () => {
    const errors = new Float32Array([0.5]);
    const result = computeErrorStats(errors);
    expect(result.min).toBe(0.5);
    expect(result.max).toBe(0.5);
  });

  it('computes correct min/max for normal range', () => {
    const errors = new Float32Array([0.1, 0.5, 0.3, 0.9, 0.2]);
    const result = computeErrorStats(errors);
    expect(result.min).toBeCloseTo(0.1, 5);
    expect(result.max).toBeCloseTo(0.9, 5);
  });

  it('ignores negative values', () => {
    const errors = new Float32Array([-1, 0.5, -2, 0.3, -0.5]);
    const result = computeErrorStats(errors);
    expect(result.min).toBeCloseTo(0.3, 5);
    expect(result.max).toBeCloseTo(0.5, 5);
  });

  it('handles all negative values', () => {
    const errors = new Float32Array([-1, -2, -3]);
    const result = computeErrorStats(errors);
    expect(result.min).toBe(Infinity);
    expect(result.max).toBe(-Infinity);
  });

  it('handles zero values correctly', () => {
    const errors = new Float32Array([0, 0.5, 0, 1.0]);
    const result = computeErrorStats(errors);
    expect(result.min).toBe(0);
    expect(result.max).toBe(1.0);
  });
});

describe('computeTrackStats', () => {
  it('handles empty array', () => {
    const tracks = new Uint32Array(0);
    const result = computeTrackStats(tracks);
    expect(result.min).toBe(Infinity);
    expect(result.max).toBe(-Infinity);
  });

  it('handles single value', () => {
    const tracks = new Uint32Array([5]);
    const result = computeTrackStats(tracks);
    expect(result.min).toBe(5);
    expect(result.max).toBe(5);
  });

  it('computes correct min/max', () => {
    const tracks = new Uint32Array([2, 5, 3, 10, 1]);
    const result = computeTrackStats(tracks);
    expect(result.min).toBe(1);
    expect(result.max).toBe(10);
  });

  it('handles all same values', () => {
    const tracks = new Uint32Array([3, 3, 3, 3]);
    const result = computeTrackStats(tracks);
    expect(result.min).toBe(3);
    expect(result.max).toBe(3);
  });
});

describe('normalizeValue', () => {
  it('normalizes middle value correctly', () => {
    expect(normalizeValue(5, 0, 10)).toBe(0.5);
  });

  it('returns 0 for min value', () => {
    expect(normalizeValue(0, 0, 10)).toBe(0);
  });

  it('returns 1 for max value', () => {
    expect(normalizeValue(10, 0, 10)).toBe(1);
  });

  it('handles equal min/max by returning 0', () => {
    expect(normalizeValue(5, 5, 5)).toBe(0);
  });

  it('clamps values above max to 1', () => {
    expect(normalizeValue(15, 0, 10)).toBe(1);
  });

  it('clamps values below min to 0', () => {
    expect(normalizeValue(-5, 0, 10)).toBe(0);
  });

  it('handles negative range', () => {
    expect(normalizeValue(-5, -10, 0)).toBe(0.5);
  });
});

describe('safeMinMax', () => {
  it('returns adjusted max when min === max', () => {
    const result = safeMinMax({ min: 5, max: 5 });
    expect(result.min).toBe(5);
    expect(result.max).toBe(6);
  });

  it('returns default values for Infinity stats', () => {
    const result = safeMinMax({ min: Infinity, max: -Infinity });
    expect(result.min).toBe(0);
    expect(result.max).toBe(1);
  });

  it('returns unchanged stats when valid', () => {
    const stats: MinMaxStats = { min: 0, max: 10 };
    const result = safeMinMax(stats);
    expect(result.min).toBe(0);
    expect(result.max).toBe(10);
  });
});

describe('computePointColors', () => {
  describe('rgb mode', () => {
    it('returns correct array size', () => {
      const count = 10;
      const colors = computePointColors('rgb', count, {});
      expect(colors.length).toBe(count * 3);
    });

    it('uses white when no wasmColors provided', () => {
      const colors = computePointColors('rgb', 2, {});
      expect(colors[0]).toBe(1);
      expect(colors[1]).toBe(1);
      expect(colors[2]).toBe(1);
    });

    it('applies sRGB to linear conversion', () => {
      // sRGB value 0.5 -> linear ~0.214
      const wasmColors = new Float32Array([0.5, 0.5, 0.5]);
      const colors = computePointColors('rgb', 1, { wasmColors });
      // sRGB to linear conversion should reduce the value
      expect(colors[0]).toBeLessThan(0.5);
      expect(colors[0]).toBeGreaterThan(0.1);
    });
  });

  describe('error mode', () => {
    it('returns correct array size', () => {
      const count = 5;
      const errors = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
      const colors = computePointColors('error', count, { errors });
      expect(colors.length).toBe(count * 3);
    });

    it('uses jet colormap', () => {
      // With error range 0-1, value 0 should be blue-ish, value 1 should be red-ish
      const errors = new Float32Array([0, 1]);
      const colors = computePointColors('error', 2, { errors });

      // First point (error=0, normalized=0): blue region of jet
      expect(colors[2]).toBeGreaterThan(colors[0]); // B > R for low values

      // Second point (error=1, normalized=1): red region of jet
      expect(colors[3]).toBeGreaterThan(colors[5]); // R > B for high values
    });

    it('handles pre-computed stats', () => {
      const errors = new Float32Array([5, 10, 15]);
      const errorStats = { min: 5, max: 15 };
      const colors = computePointColors('error', 3, { errors, errorStats });
      expect(colors.length).toBe(9);
    });
  });

  describe('trackLength mode', () => {
    it('returns correct array size', () => {
      const count = 3;
      const trackLengths = new Uint32Array([2, 5, 10]);
      const colors = computePointColors('trackLength', count, { trackLengths });
      expect(colors.length).toBe(count * 3);
    });

    it('produces varying colors for different track lengths', () => {
      const trackLengths = new Uint32Array([1, 50, 100]);
      const colors = computePointColors('trackLength', 3, { trackLengths });

      // Colors should be different for different track lengths
      const p1 = [colors[0], colors[1], colors[2]];
      const p2 = [colors[3], colors[4], colors[5]];
      const p3 = [colors[6], colors[7], colors[8]];

      // At least one component should differ
      expect(p1[0] !== p2[0] || p1[1] !== p2[1] || p1[2] !== p2[2]).toBe(true);
      expect(p2[0] !== p3[0] || p2[1] !== p3[1] || p2[2] !== p3[2]).toBe(true);
    });
  });

});

describe('computeSinglePointColor', () => {
  it('returns RGB color for rgb mode', () => {
    const wasmColors = new Float32Array([0.5, 0.3, 0.8]);
    const color = computeSinglePointColor(0, 'rgb', {
      wasmColors,
      minError: 0,
      maxError: 1,
      minTrack: 0,
      maxTrack: 1,
    });
    expect(color).toHaveLength(3);
    // Should apply sRGB to linear
    expect(color[0]).toBeLessThan(0.5);
  });

  it('returns jet color for error mode', () => {
    const errors = new Float32Array([0.5]);
    const color = computeSinglePointColor(0, 'error', {
      errors,
      minError: 0,
      maxError: 1,
      minTrack: 0,
      maxTrack: 1,
    });
    expect(color).toHaveLength(3);
    // Mid-range error should have some green component
    expect(color[1]).toBeGreaterThan(0);
  });

  it('returns trackLength color', () => {
    const trackLengths = new Uint32Array([50]);
    const color = computeSinglePointColor(0, 'trackLength', {
      trackLengths,
      minError: 0,
      maxError: 1,
      minTrack: 0,
      maxTrack: 100,
    });
    expect(color).toHaveLength(3);
  });

  it('returns white when no data available', () => {
    const color = computeSinglePointColor(0, 'rgb', {
      minError: 0,
      maxError: 1,
      minTrack: 0,
      maxTrack: 1,
    });
    expect(color).toEqual([1, 1, 1]);
  });
});
