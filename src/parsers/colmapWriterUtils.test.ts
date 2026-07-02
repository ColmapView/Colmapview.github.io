import { describe, it, expect } from 'vitest';
import { formatDouble } from './colmapWriterUtils';

describe('formatDouble', () => {
  // toPrecision(17) is lossless for every finite float64, so the exact
  // round-trip parseFloat(formatDouble(v)) === v must hold. The historical bug
  // stripped the trailing "0" of an exponent (5e-10 -> "…e-1" -> 0.5).
  const ROUND_TRIP_CASES = [
    5e-10, 1.23e-10, 2.5e-9, 1e20, 2.5e20, -3.7e-10,
    0.5, 50, -0.125, Math.PI, 1e-300, 0,
  ];
  it.each(ROUND_TRIP_CASES)('round-trips %s exactly', (v) => {
    expect(parseFloat(formatDouble(v))).toBe(v);
  });

  it('does not strip exponent digits (5e-10 must not become 0.5)', () => {
    // Was 0.5 before the fix.
    expect(parseFloat(formatDouble(5e-10))).toBe(5e-10);
    expect(formatDouble(5e-10)).toContain('e-10');
  });

  it('does not corrupt positive exponents (1e20 must not become 100)', () => {
    expect(parseFloat(formatDouble(1e20))).toBe(1e20);
    expect(formatDouble(1e20)).toBe('1e+20');
  });

  it('keeps the mantissa AND exponent for values with trailing mantissa zeros', () => {
    expect(formatDouble(2.5e20)).toBe('2.5e+20');
    expect(parseFloat(formatDouble(2.5e20))).toBe(2.5e20);
  });

  // Large integers in [1e16, 1e17) render via toPrecision(17) as a bare integer
  // string with no '.' and no 'e' (1e16 -> "10000000000000000"). The trailing-zero
  // strip corrupted these too (1e16 -> "1") — the same corruption class as the
  // exponent bug. Guard them so formatDouble is a lossless round-trip for ALL
  // finite doubles, not just the ones that happen to carry a decimal point.
  const BARE_INTEGER_CASES = [1e16, 5e16, 9e16, -1e16, -5e16];
  it.each(BARE_INTEGER_CASES)('preserves trailing zeros of bare integers (%s)', (v) => {
    expect(parseFloat(formatDouble(v))).toBe(v);
  });
  it('does not collapse 1e16 to "1"', () => {
    expect(formatDouble(1e16)).toBe('10000000000000000');
  });

  it('handles negatives, zero, plain integers, and irrationals without an exponent', () => {
    expect(formatDouble(0)).toBe('0');
    expect(formatDouble(-0.125)).toBe('-0.125');
    expect(formatDouble(50)).toBe('50');
    expect(parseFloat(formatDouble(-Math.PI))).toBe(-Math.PI);
  });

  it('emits no whitespace (safe for space-delimited COLMAP text rows)', () => {
    for (const v of [...ROUND_TRIP_CASES, ...BARE_INTEGER_CASES]) {
      expect(formatDouble(v)).not.toMatch(/\s/);
    }
  });
});
