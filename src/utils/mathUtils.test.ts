import { describe, it, expect } from 'vitest';
import { percentile, median } from './mathUtils';

describe('percentile', () => {
  it('returns 0 for empty array', () => {
    expect(percentile([], 50)).toBe(0);
  });

  it('returns the only element for single-element array', () => {
    expect(percentile([42], 0)).toBe(42);
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 100)).toBe(42);
  });

  it('returns exact value at boundaries', () => {
    const sorted = [1, 2, 3, 4, 5];
    expect(percentile(sorted, 0)).toBe(1);
    expect(percentile(sorted, 100)).toBe(5);
  });

  it('returns exact value at 50th percentile for odd-length array', () => {
    const sorted = [1, 2, 3, 4, 5];
    expect(percentile(sorted, 50)).toBe(3);
  });

  it('interpolates correctly for even-length array', () => {
    const sorted = [1, 2, 3, 4];
    // 50th percentile: idx = 0.5 * 3 = 1.5
    // lower = 1, upper = 2 -> sorted[1] * 0.5 + sorted[2] * 0.5 = 2 * 0.5 + 3 * 0.5 = 2.5
    expect(percentile(sorted, 50)).toBe(2.5);
  });

  it('calculates 25th and 75th percentiles correctly', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    // 25th: idx = 0.25 * 8 = 2 -> sorted[2] = 3
    expect(percentile(sorted, 25)).toBe(3);
    // 75th: idx = 0.75 * 8 = 6 -> sorted[6] = 7
    expect(percentile(sorted, 75)).toBe(7);
  });

  it('handles negative numbers', () => {
    const sorted = [-10, -5, 0, 5, 10];
    expect(percentile(sorted, 50)).toBe(0);
    expect(percentile(sorted, 0)).toBe(-10);
    expect(percentile(sorted, 100)).toBe(10);
  });

  it('handles floating point values', () => {
    const sorted = [0.1, 0.2, 0.3, 0.4, 0.5];
    expect(percentile(sorted, 50)).toBeCloseTo(0.3);
  });
});

describe('median', () => {
  it('returns 0 for empty array', () => {
    expect(median([])).toBe(0);
  });

  it('returns the only element for single-element array', () => {
    expect(median([42])).toBe(42);
  });

  it('returns middle element for odd-length array', () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([5, 1, 3])).toBe(3); // unsorted input
    expect(median([1, 2, 3, 4, 5])).toBe(3);
  });

  it('returns average of middle elements for even-length array', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([4, 1, 2, 3])).toBe(2.5); // unsorted input
  });

  it('does not modify original array', () => {
    const arr = [3, 1, 2];
    median(arr);
    expect(arr).toEqual([3, 1, 2]);
  });

  it('handles negative numbers', () => {
    expect(median([-5, -1, -3])).toBe(-3);
    expect(median([-10, 0, 10])).toBe(0);
  });

  it('handles floating point values', () => {
    expect(median([0.1, 0.3, 0.2])).toBeCloseTo(0.2);
  });

  it('handles large arrays', () => {
    const arr = Array.from({ length: 1001 }, (_, i) => i);
    expect(median(arr)).toBe(500);
  });
});
