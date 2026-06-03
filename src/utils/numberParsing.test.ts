import { describe, expect, it } from 'vitest';
import {
  parseFiniteNumberString,
  parseSafeIntegerString,
} from './numberParsing';

describe('parseSafeIntegerString', () => {
  it('parses unsigned safe integer strings and rejects partial numbers', () => {
    expect(parseSafeIntegerString('12')).toBe(12);
    expect(parseSafeIntegerString(' 12 ')).toBe(12);
    expect(parseSafeIntegerString('08')).toBe(8);
    expect(parseSafeIntegerString('')).toBeNull();
    expect(parseSafeIntegerString('-1')).toBeNull();
    expect(parseSafeIntegerString('12px')).toBeNull();
    expect(parseSafeIntegerString('1.2')).toBeNull();
    expect(parseSafeIntegerString(String(Number.MAX_SAFE_INTEGER + 1))).toBeNull();
  });

  it('supports signed values and inclusive bounds when requested', () => {
    expect(parseSafeIntegerString('-10', { allowSign: true })).toBe(-10);
    expect(parseSafeIntegerString('-1', { allowSign: true, min: 0 })).toBeNull();
    expect(parseSafeIntegerString('361', { max: 360 })).toBeNull();
    expect(parseSafeIntegerString('360', { max: 360 })).toBe(360);
  });

  it('parses finite decimal strings without accepting partial values', () => {
    expect(parseFiniteNumberString('1')).toBe(1);
    expect(parseFiniteNumberString(' 1.25 ')).toBe(1.25);
    expect(parseFiniteNumberString('.5')).toBe(0.5);
    expect(parseFiniteNumberString('-1e-3')).toBe(-0.001);
    expect(parseFiniteNumberString('1px')).toBeNull();
    expect(parseFiniteNumberString('Infinity')).toBeNull();
    expect(parseFiniteNumberString('NaN')).toBeNull();
    expect(parseFiniteNumberString('')).toBeNull();
  });
});
