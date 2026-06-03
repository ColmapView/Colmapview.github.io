import { describe, expect, it } from 'vitest';
import {
  parseColmapBigIntToken,
  parseColmapIntegerToken,
  parseColmapNumberToken,
  parseColmapNumberTokens,
} from './colmapTextTokens';

describe('COLMAP text token parsing', () => {
  it('parses safe integer tokens without accepting partial values', () => {
    expect(parseColmapIntegerToken('42')).toBe(42);
    expect(parseColmapIntegerToken(' 42 ')).toBe(42);
    expect(parseColmapIntegerToken('-1')).toBe(-1);
    expect(parseColmapIntegerToken('-1', { min: 0 })).toBeNull();
    expect(parseColmapIntegerToken('256', { min: 0, max: 255 })).toBeNull();
    expect(parseColmapIntegerToken('42px')).toBeNull();
    expect(parseColmapIntegerToken('4.2')).toBeNull();
  });

  it('parses finite decimal and scientific notation tokens', () => {
    expect(parseColmapNumberToken('1')).toBe(1);
    expect(parseColmapNumberToken('-1.25')).toBe(-1.25);
    expect(parseColmapNumberToken('.5')).toBe(0.5);
    expect(parseColmapNumberToken('1e-3')).toBe(0.001);
    expect(parseColmapNumberToken('+2E3')).toBe(2000);
  });

  it('rejects partial, non-finite, and non-decimal number tokens', () => {
    expect(parseColmapNumberToken('1px')).toBeNull();
    expect(parseColmapNumberToken('Infinity')).toBeNull();
    expect(parseColmapNumberToken('NaN')).toBeNull();
    expect(parseColmapNumberToken('0x10')).toBeNull();
    expect(parseColmapNumberToken('')).toBeNull();
  });

  it('parses a full token list only when every token is valid', () => {
    expect(parseColmapNumberTokens(['1', '2.5', '-3e2'])).toEqual([1, 2.5, -300]);
    expect(parseColmapNumberTokens(['1', 'bad'])).toBeNull();
  });

  it('parses signed BigInt tokens without accepting partial values', () => {
    expect(parseColmapBigIntToken('123')).toBe(123n);
    expect(parseColmapBigIntToken('-1')).toBe(-1n);
    expect(parseColmapBigIntToken('123px')).toBeNull();
    expect(parseColmapBigIntToken('1.2')).toBeNull();
  });
});
