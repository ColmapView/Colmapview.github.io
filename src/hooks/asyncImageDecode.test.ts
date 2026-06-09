import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildImageBitmap } from '../test/builders';
import {
  clearFailedImages,
  createImageBitmapWithTimeout,
  resizeImageBitmapToMaxSizeWithTimeout,
  getFailedImageCount,
  hasImageFailed,
  markImageFailed,
  shouldResizeImageBitmap,
  shouldLogDecodeFailure,
  shouldLogDecodeFailureSuppression,
} from './asyncImageDecode';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('async image decode helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
    clearFailedImages();
  });

  it('resolves decoded bitmaps before the timeout fires', async () => {
    vi.useFakeTimers();
    const file = new File(['image'], 'image.jpg');
    const bitmap = buildImageBitmap({ close: vi.fn() });
    const clearTimer = vi.fn(clearTimeout);

    await expect(createImageBitmapWithTimeout(file, 1000, {
      decode: vi.fn().mockResolvedValue(bitmap),
      clearTimer,
    })).resolves.toBe(bitmap);

    expect(clearTimer).toHaveBeenCalledOnce();
    expect(bitmap.close).not.toHaveBeenCalled();
  });

  it('rejects on timeout and closes a late bitmap result', async () => {
    vi.useFakeTimers();
    const file = new File(['image'], 'slow.jpg');
    const bitmap = buildImageBitmap({ close: vi.fn() });
    const deferred = createDeferred<ImageBitmap>();
    const promise = createImageBitmapWithTimeout(file, 100, {
      decode: () => deferred.promise,
    });

    const rejected = expect(promise).rejects.toThrow('Image decode timed out after 100ms');
    vi.advanceTimersByTime(100);
    await rejected;

    deferred.resolve(bitmap);
    await Promise.resolve();

    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('tracks failed image keys and decode failure log thresholds', () => {
    expect(hasImageFailed('bad.jpg')).toBe(false);
    expect(getFailedImageCount()).toBe(0);

    expect(markImageFailed('bad.jpg')).toBe(1);
    expect(markImageFailed('bad.jpg')).toBe(1);
    expect(hasImageFailed('bad.jpg')).toBe(true);

    for (let i = 2; i <= 21; i++) {
      markImageFailed(`bad-${i}.jpg`);
    }

    expect(getFailedImageCount()).toBe(21);
    expect(shouldLogDecodeFailure(20)).toBe(true);
    expect(shouldLogDecodeFailure(21)).toBe(false);
    expect(shouldLogDecodeFailureSuppression(20)).toBe(false);
    expect(shouldLogDecodeFailureSuppression(21)).toBe(true);

    clearFailedImages();
    expect(getFailedImageCount()).toBe(0);
  });

  it('resizes oversized bitmaps with high-quality createImageBitmap options', async () => {
    const source = buildImageBitmap({ width: 4000, height: 2000, close: vi.fn() });
    const resized = buildImageBitmap({ width: 256, height: 128, close: vi.fn() });
    const resize = vi.fn().mockResolvedValue(resized);

    await expect(resizeImageBitmapToMaxSizeWithTimeout(source, 256, 1000, {
      resize,
    })).resolves.toBe(resized);

    expect(resize).toHaveBeenCalledWith(source, 0, 0, 4000, 2000, {
      resizeWidth: 256,
      resizeHeight: 128,
      resizeQuality: 'high',
    });
    expect(source.close).toHaveBeenCalledOnce();
    expect(resized.close).not.toHaveBeenCalled();
  });

  it('keeps already-small bitmaps without resizing', async () => {
    const source = buildImageBitmap({ width: 128, height: 64, close: vi.fn() });
    const resize = vi.fn();

    await expect(resizeImageBitmapToMaxSizeWithTimeout(source, 256, 1000, {
      resize,
    })).resolves.toBe(source);

    expect(shouldResizeImageBitmap(source, 256)).toBe(false);
    expect(resize).not.toHaveBeenCalled();
    expect(source.close).not.toHaveBeenCalled();
  });

  it('falls back to the original bitmap if async resizing fails', async () => {
    const source = buildImageBitmap({ width: 4000, height: 2000, close: vi.fn() });
    const resize = vi.fn().mockRejectedValue(new Error('resize unsupported'));

    await expect(resizeImageBitmapToMaxSizeWithTimeout(source, 256, 1000, {
      resize,
    })).resolves.toBe(source);

    expect(resize).toHaveBeenCalledOnce();
    expect(source.close).not.toHaveBeenCalled();
  });

  it('falls back to the original bitmap and closes late resize results after timeout', async () => {
    vi.useFakeTimers();
    const source = buildImageBitmap({ width: 4000, height: 2000, close: vi.fn() });
    const resized = buildImageBitmap({ width: 256, height: 128, close: vi.fn() });
    const deferred = createDeferred<ImageBitmap>();
    const resize = vi.fn(() => deferred.promise);

    const promise = resizeImageBitmapToMaxSizeWithTimeout(source, 256, 100, {
      resize,
    });

    const resolved = expect(promise).resolves.toBe(source);
    vi.advanceTimersByTime(100);
    await resolved;

    deferred.resolve(resized);
    await Promise.resolve();

    expect(source.close).not.toHaveBeenCalled();
    expect(resized.close).toHaveBeenCalledOnce();
  });
});
