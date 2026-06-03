import { describe, expect, it } from 'vitest';
import {
  getBoundedCacheDimensions,
  getCacheResizeDimensions,
  getFileMapStats,
  getJpegCacheFilename,
  getUniqueFileMapStats,
} from './imageFileCachePolicy';

describe('image file cache policy', () => {
  it('bounds cache dimensions by screen size, device pixel ratio, and maximum size', () => {
    expect(getBoundedCacheDimensions({
      screenWidth: 800,
      screenHeight: 600,
      devicePixelRatio: 1.5,
      maxDimension: 2048,
    })).toEqual({ maxWidth: 1200, maxHeight: 900 });

    expect(getBoundedCacheDimensions({
      screenWidth: 4000,
      screenHeight: 3000,
      devicePixelRatio: 4,
      maxDimension: 2048,
    })).toEqual({ maxWidth: 2048, maxHeight: 2048 });

    expect(getBoundedCacheDimensions({
      screenWidth: 1024,
      screenHeight: 768,
      devicePixelRatio: 0,
      maxDimension: 2048,
    })).toEqual({ maxWidth: 1024, maxHeight: 768 });
  });

  it('preserves aspect ratio while fitting images inside cache bounds', () => {
    expect(getCacheResizeDimensions(
      { width: 4000, height: 2000 },
      { maxWidth: 1000, maxHeight: 1000 }
    )).toEqual({ width: 1000, height: 500 });

    expect(getCacheResizeDimensions(
      { width: 1000, height: 4000 },
      { maxWidth: 1000, maxHeight: 1000 }
    )).toEqual({ width: 250, height: 1000 });

    expect(getCacheResizeDimensions(
      { width: 800, height: 600 },
      { maxWidth: 1000, maxHeight: 1000 }
    )).toEqual({ width: 800, height: 600 });
  });

  it('derives JPEG cache filenames without changing extensionless names', () => {
    expect(getJpegCacheFilename('photo.png')).toBe('photo.jpg');
    expect(getJpegCacheFilename('cam1/photo.raw.tiff')).toBe('cam1/photo.raw.jpg');
    expect(getJpegCacheFilename('photo')).toBe('photo');
  });

  it('calculates map stats and deduplicated local file stats', () => {
    const first = new File([new Uint8Array([1, 2, 3])], 'first.jpg');
    const second = new File([new Uint8Array([4, 5])], 'second.jpg');
    const files = new Map([
      ['first.jpg', first],
      ['FIRST.JPG', first],
      ['second.jpg', second],
    ]);

    expect(getFileMapStats(files)).toEqual({
      count: 3,
      sizeBytes: first.size * 2 + second.size,
    });
    expect(getUniqueFileMapStats(files)).toEqual({
      count: 2,
      sizeBytes: first.size + second.size,
    });
    expect(getUniqueFileMapStats(undefined)).toEqual({ count: 0, sizeBytes: 0 });
  });
});
