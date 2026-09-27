import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIZE } from '../theme';
import { buildCanvas2dContext, buildIdleDeadline, buildImageBitmap } from '../test/builders';
import { clearFailedImages, hasImageFailed, markImageFailed } from './asyncImageDecode';
import { createImageCache } from './useAsyncImageCache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('image cache lifecycle', () => {
  let idleCallbacks: IdleRequestCallback[];
  let caches: Array<ReturnType<typeof createImageCache<string>>>;

  beforeEach(() => {
    vi.useFakeTimers();
    idleCallbacks = [];
    caches = [];
    vi.stubGlobal('requestIdleCallback', vi.fn((callback: IdleRequestCallback) => idleCallbacks.push(callback)));
    vi.stubGlobal('OffscreenCanvas', undefined);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => buildImageBitmap({ width: 64, height: 64 })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(buildCanvas2dContext());
  });

  afterEach(() => {
    for (const cache of caches) cache.clear();
    clearFailedImages();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setup(processCanvas: () => string | Promise<string | null> = () => 'blob:thumbnail') {
    const dispose = vi.fn();
    const cache = createImageCache({ maxSize: 256, processCanvas, dispose });
    caches.push(cache);
    return { cache, dispose };
  }

  function runIdle() {
    const callback = idleCallbacks.shift();
    expect(callback).toBeDefined();
    callback!(buildIdleDeadline({ timeRemaining: () => 50 }));
  }

  const file = new File(['image'], 'photo.jpg');

  it('shares an in-flight load and retains one result until disposal', async () => {
    const { cache, dispose } = setup();
    const load = cache.load(file, 'photo');
    expect(cache.load(file, 'photo')).toBe(load);
    await vi.advanceTimersByTimeAsync(0);
    runIdle();
    await expect(load).resolves.toBe('blob:thumbnail');
    expect(cache.getStats()).toEqual({ count: 1, loading: 0, pending: 0 });
    cache.clear();
    expect(dispose).toHaveBeenCalledExactlyOnceWith('blob:thumbnail');
  });

  it('settles both queued and decoding requests immediately on clear', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<ImageBitmap>(() => {})));
    const { cache } = setup();
    const settled = vi.fn();
    for (let i = 0; i <= SIZE.maxConcurrentLoads; i++) {
      void cache.load(file, `photo-${i}`).then(settled);
    }
    expect(createImageBitmap).toHaveBeenCalledTimes(SIZE.maxConcurrentLoads);

    cache.clear();
    await vi.advanceTimersByTimeAsync(0);

    expect(settled).toHaveBeenCalledTimes(SIZE.maxConcurrentLoads + 1);
    expect(settled.mock.calls.every(([result]) => result === null)).toBe(true);
    expect(createImageBitmap).toHaveBeenCalledTimes(SIZE.maxConcurrentLoads);
    expect(cache.getStats()).toEqual({ count: 0, loading: 0, pending: 0 });
  });

  it('disposes a late conversion result without overwriting the next dataset thumbnail', async () => {
    const conversion = deferred<string>();
    const processCanvas = vi.fn<() => string | Promise<string | null>>()
      .mockReturnValueOnce(conversion.promise).mockReturnValue('blob:current');
    const { cache, dispose } = setup(processCanvas);
    const obsolete = cache.load(file, 'photo');
    await vi.advanceTimersByTimeAsync(0);
    runIdle();
    cache.clear();

    const current = cache.load(file, 'photo');
    await vi.advanceTimersByTimeAsync(0);
    runIdle();
    await expect(current).resolves.toBe('blob:current');
    conversion.resolve('blob:obsolete');
    await vi.advanceTimersByTimeAsync(0);

    await expect(obsolete).resolves.toBeNull();
    expect(cache.getCached('photo')).toBe('blob:current');
    expect(dispose).toHaveBeenCalledExactlyOnceWith('blob:obsolete');
    expect(cache.getStats()).toEqual({ count: 1, loading: 0, pending: 0 });
  });

  it('does not blacklist a new dataset image when an old decode fails late', async () => {
    const decode = deferred<ImageBitmap>();
    const bitmap = buildImageBitmap({ width: 64, height: 64 });
    vi.stubGlobal('createImageBitmap', vi.fn().mockReturnValueOnce(decode.promise).mockResolvedValue(bitmap));
    const { cache } = setup();
    const obsolete = cache.load(file, 'photo');
    cache.clear();
    decode.reject(new Error('old decode failed'));
    await vi.advanceTimersByTimeAsync(0);

    expect(hasImageFailed('photo')).toBe(false);
    const current = cache.load(file, 'photo');
    await vi.advanceTimersByTimeAsync(0);
    runIdle();
    await expect(current).resolves.toBe('blob:thumbnail');
    await expect(obsolete).resolves.toBeNull();
  });

  it('continues processing other images after a synchronous conversion failure', async () => {
    const processCanvas = vi.fn().mockImplementationOnce(() => { throw new Error('canvas failed'); })
      .mockReturnValue('blob:next');
    const { cache } = setup(processCanvas);
    const failed = cache.load(file, 'failed');
    const next = cache.load(file, 'next');
    await vi.advanceTimersByTimeAsync(0);

    expect(runIdle).not.toThrow();
    await expect(failed).resolves.toBeNull();
    await expect(next).resolves.toBe('blob:next');
    expect(cache.getStats()).toEqual({ count: 1, loading: 0, pending: 0 });
  });

  it('queues new images while paused and starts them only after resume', async () => {
    const { cache } = setup();
    cache.pause();
    const load = cache.load(file, 'photo');
    expect(createImageBitmap).not.toHaveBeenCalled();

    cache.resume();
    expect(createImageBitmap).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(0);
    runIdle();
    await expect(load).resolves.toBe('blob:thumbnail');
  });

  it('stops a cleared prefetch without starting later batches or reporting stale progress', async () => {
    const { cache } = setup();
    const onProgress = vi.fn();
    const complete = vi.fn();
    const images = Array.from({ length: SIZE.maxConcurrentLoads * 4 + 1 }, (_, i) => ({ file, name: `image-${i}` }));
    void cache.prefetch(images, onProgress).then(complete);
    cache.clear();
    await vi.advanceTimersByTimeAsync(0);

    expect(complete).toHaveBeenCalledOnce();
    expect(onProgress).not.toHaveBeenCalled();
    expect(createImageBitmap).toHaveBeenCalledTimes(SIZE.maxConcurrentLoads);
    expect(cache.getStats()).toEqual({ count: 0, loading: 0, pending: 0 });
  });

  it('does not retain a completed loading promise for a known failed image', async () => {
    const { cache } = setup();
    markImageFailed('photo');
    await expect(cache.load(file, 'photo')).resolves.toBeNull();
    expect(cache.getStats()).toEqual({ count: 0, loading: 0, pending: 0 });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });
});
