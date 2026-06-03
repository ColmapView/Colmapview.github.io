import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildImageBitmap } from '../test/builders';
import {
  clearFailedImages,
  createImageBitmapWithTimeout,
  getFailedImageCount,
  hasImageFailed,
  markImageFailed,
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
});
