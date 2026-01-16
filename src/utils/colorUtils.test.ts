import { describe, it, expect } from 'vitest';
import { sRGBToLinear, jetColormap } from './colorUtils';

describe('sRGBToLinear', () => {
  it('returns 0 for input 0', () => {
    expect(sRGBToLinear(0)).toBe(0);
  });

  it('returns 1 for input 1', () => {
    expect(sRGBToLinear(1)).toBeCloseTo(1, 5);
  });

  it('uses linear formula below threshold', () => {
    // Below 0.04045, uses c / 12.92
    expect(sRGBToLinear(0.01)).toBeCloseTo(0.01 / 12.92, 5);
    expect(sRGBToLinear(0.04)).toBeCloseTo(0.04 / 12.92, 5);
  });

  it('uses gamma formula above threshold', () => {
    // Above 0.04045, uses ((c + 0.055) / 1.055)^2.4
    const c = 0.5;
    const expected = Math.pow((c + 0.055) / 1.055, 2.4);
    expect(sRGBToLinear(c)).toBeCloseTo(expected, 5);
  });

  it('produces values less than input (gamma compression)', () => {
    // Linear values should be less than sRGB values for c > 0
    for (const c of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(sRGBToLinear(c)).toBeLessThan(c);
    }
  });

  it('is monotonically increasing', () => {
    let prev = 0;
    for (let c = 0; c <= 1; c += 0.1) {
      const current = sRGBToLinear(c);
      expect(current).toBeGreaterThanOrEqual(prev);
      prev = current;
    }
  });
});

describe('jetColormap', () => {
  it('returns blue at t=0', () => {
    const [r, g, b] = jetColormap(0);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(1);
  });

  it('returns red at t=1', () => {
    const [r, g, b] = jetColormap(1);
    expect(r).toBe(1);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('returns cyan at t=0.125 (midpoint of first segment)', () => {
    const [r, g, b] = jetColormap(0.125);
    expect(r).toBe(0);
    expect(g).toBeCloseTo(0.5, 5); // 0.125 * 4 = 0.5
    expect(b).toBe(1);
  });

  it('returns green at t=0.5', () => {
    const [r, g, b] = jetColormap(0.5);
    expect(r).toBe(0);
    expect(g).toBe(1);
    expect(b).toBe(0);
  });

  it('returns yellow at t=0.75', () => {
    const [r, g, b] = jetColormap(0.75);
    expect(r).toBe(1);
    expect(g).toBe(1);
    expect(b).toBe(0);
  });

  it('clamps values below 0', () => {
    const [r, g, b] = jetColormap(-0.5);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(1);
  });

  it('clamps values above 1', () => {
    const [r, g, b] = jetColormap(1.5);
    expect(r).toBe(1);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('returns valid RGB values (0-1 range)', () => {
    for (let t = 0; t <= 1; t += 0.1) {
      const [r, g, b] = jetColormap(t);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    }
  });
});
