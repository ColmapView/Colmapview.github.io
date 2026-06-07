import { describe, expect, it, vi } from 'vitest';
import { buildImageBitmap } from '../test/builders';
import type { AsyncImageCachePendingItem } from './asyncImageCacheState';
import { processAsyncImagePendingItem } from './asyncImageCachePendingItem';

function createPending<T>(
  cacheKey = 'image.jpg',
  resolve: (result: T | null) => void = vi.fn()
): AsyncImageCachePendingItem<T> {
  return {
    bitmap: buildImageBitmap({ close: vi.fn() }),
    cacheKey,
    resolve,
  };
}

function createCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

describe('async image cache pending item processing', () => {
  it('resolves cached items and closes the unused bitmap', () => {
    const pending = createPending<string>();
    const cache = new Map([['image.jpg', 'cached-value']]);
    const drawToCanvas = vi.fn(() => createCanvas());
    const processCanvas = vi.fn(() => 'processed-value');

    processAsyncImagePendingItem(pending, {
      cache,
      drawToCanvas,
      maxSize: 256,
      processCanvas,
    });

    expect(pending.bitmap.close).toHaveBeenCalledOnce();
    expect(pending.resolve).toHaveBeenCalledWith('cached-value');
    expect(drawToCanvas).not.toHaveBeenCalled();
    expect(processCanvas).not.toHaveBeenCalled();
  });

  it('draws, processes, caches, and resolves synchronous canvas results', () => {
    const pending = createPending<string>();
    const cache = new Map<string, string>();
    const canvas = createCanvas();
    const drawToCanvas = vi.fn(() => canvas);
    const processCanvas = vi.fn(() => 'processed-value');

    processAsyncImagePendingItem(pending, {
      cache,
      drawToCanvas,
      maxSize: 512,
      processCanvas,
    });

    expect(drawToCanvas).toHaveBeenCalledWith(pending.bitmap, 512);
    expect(processCanvas).toHaveBeenCalledWith(canvas);
    expect(cache.get('image.jpg')).toBe('processed-value');
    expect(pending.resolve).toHaveBeenCalledWith('processed-value');
  });

  it('does not process or cache when drawing returns no canvas', () => {
    const pending = createPending<string>();
    const cache = new Map<string, string>();
    const drawToCanvas = vi.fn(() => null);
    const processCanvas = vi.fn(() => 'processed-value');

    processAsyncImagePendingItem(pending, {
      cache,
      drawToCanvas,
      maxSize: 512,
      processCanvas,
    });

    expect(drawToCanvas).toHaveBeenCalledWith(pending.bitmap, 512);
    expect(processCanvas).not.toHaveBeenCalled();
    expect(cache.has('image.jpg')).toBe(false);
    expect(pending.resolve).toHaveBeenCalledWith(null);
  });

  it('caches non-null asynchronous canvas results', async () => {
    const pending = createPending<string>();
    const cache = new Map<string, string>();

    processAsyncImagePendingItem(pending, {
      cache,
      drawToCanvas: vi.fn(() => createCanvas()),
      maxSize: 256,
      processCanvas: vi.fn(async () => 'async-value'),
    });

    await Promise.resolve();

    expect(cache.get('image.jpg')).toBe('async-value');
    expect(pending.resolve).toHaveBeenCalledWith('async-value');
  });

  it('does not cache null asynchronous canvas results', async () => {
    const pending = createPending<string>();
    const cache = new Map<string, string>();

    processAsyncImagePendingItem(pending, {
      cache,
      drawToCanvas: vi.fn(() => createCanvas()),
      maxSize: 256,
      processCanvas: vi.fn(async () => null),
    });

    await Promise.resolve();

    expect(cache.has('image.jpg')).toBe(false);
    expect(pending.resolve).toHaveBeenCalledWith(null);
  });

  it('resolves null when asynchronous processing rejects', async () => {
    const pending = createPending<string>();
    const cache = new Map<string, string>();

    processAsyncImagePendingItem(pending, {
      cache,
      drawToCanvas: vi.fn(() => createCanvas()),
      maxSize: 256,
      processCanvas: vi.fn(async () => {
        throw new Error('processor failed');
      }),
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(cache.has('image.jpg')).toBe(false);
    expect(pending.resolve).toHaveBeenCalledWith(null);
  });
});
