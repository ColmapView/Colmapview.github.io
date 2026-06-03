import { describe, expect, it } from 'vitest';
import {
  getPrefetchChunkSize,
  getPrefetchProgress,
  getResizedImageDimensions,
  shouldReportPrefetchProgress,
} from './asyncImageCachePolicy';

describe('async image cache policy', () => {
  it('preserves aspect ratio while fitting images inside the max size', () => {
    expect(getResizedImageDimensions({ width: 4000, height: 2000 }, 1000)).toEqual({
      width: 1000,
      height: 500,
    });
    expect(getResizedImageDimensions({ width: 1000, height: 4000 }, 1000)).toEqual({
      width: 250,
      height: 1000,
    });
    expect(getResizedImageDimensions({ width: 800, height: 600 }, 1000)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('derives bounded prefetch chunk sizes from concurrency', () => {
    expect(getPrefetchChunkSize(6)).toBe(24);
    expect(getPrefetchChunkSize(6, 2)).toBe(12);
    expect(getPrefetchChunkSize(0)).toBe(1);
  });

  it('calculates progress and handles empty prefetch lists', () => {
    expect(getPrefetchProgress(5, 20)).toBe(0.25);
    expect(getPrefetchProgress(0, 0)).toBe(1);
  });

  it('reports prefetch progress every five percent and at completion', () => {
    expect(shouldReportPrefetchProgress(1, 100, 0)).toBe(false);
    expect(shouldReportPrefetchProgress(5, 100, 0)).toBe(true);
    expect(shouldReportPrefetchProgress(54, 100, 0.5)).toBe(false);
    expect(shouldReportPrefetchProgress(55, 100, 0.5)).toBe(true);
    expect(shouldReportPrefetchProgress(100, 100, 0.99)).toBe(true);
  });
});
