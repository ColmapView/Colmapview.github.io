import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildResponse } from '../test/builders';

vi.mock('./imageFileCompression', () => ({
  compressAndResizeToJpeg: vi.fn(async (_blob: Blob, filename: string) => {
    return new File([filename], filename.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  }),
}));

import { compressAndResizeToJpeg } from './imageFileCompression';
import {
  clearUrlImageCache,
  fetchUrlImage,
  fetchUrlImageRaw,
  fetchUrlMask,
  getUrlImageCacheStats,
  getUrlImageCached,
  getUrlMaskCacheStats,
  getUrlMaskCached,
  prefetchUrlImages,
} from './urlImageFiles';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function okImageResponse(contents: string, type = 'image/png'): Response {
  return buildResponse({
    blob: vi.fn().mockResolvedValue(new Blob([contents], { type })),
  });
}

beforeEach(() => {
  clearUrlImageCache();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('url image files', () => {
  it('fetches, compresses, caches, and reports URL image files', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okImageResponse('image'));
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchUrlImage('https://example.test/images/', 'images/cam1/photo.png');
    const second = await fetchUrlImage('https://example.test/images/', 'images/cam1/photo.png');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/images/cam1/photo.png');
    expect(compressAndResizeToJpeg).toHaveBeenCalledWith(expect.any(Blob), 'photo.png');
    expect(first?.name).toBe('photo.jpg');
    expect(second).toBe(first);
    expect(getUrlImageCached('images/cam1/photo.png')).toBe(first);
    expect(getUrlImageCacheStats()).toEqual({ count: 1, sizeBytes: first?.size ?? 0 });
  });

  it('resolves concurrent image waiters when a shared URL fetch fails', async () => {
    const deferred = createDeferred<Response>();
    const fetchMock = vi.fn(() => deferred.promise);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    vi.stubGlobal('fetch', fetchMock);

    const first = fetchUrlImage('https://example.test/images', 'cam1/photo.jpg');
    const second = fetchUrlImage('https://example.test/images', 'cam1/photo.jpg');

    expect(fetchMock).toHaveBeenCalledTimes(1);

    deferred.resolve(buildResponse({ status: 404 }));

    await expect(Promise.all([first, second])).resolves.toEqual([null, null]);
    expect(getUrlImageCacheStats()).toEqual({ count: 0, sizeBytes: 0 });

    warn.mockRestore();
  });

  it('fetches raw URL image files without compression or display-cache writes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okImageResponse('raw-image', 'image/jpeg'));
    vi.stubGlobal('fetch', fetchMock);

    const file = await fetchUrlImageRaw('https://example.test/images/', 'images/cam1/photo.JPG');

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/images/cam1/photo.JPG');
    expect(compressAndResizeToJpeg).not.toHaveBeenCalled();
    expect(file?.name).toBe('photo.JPG');
    expect(file?.type).toBe('image/jpeg');
    expect(file?.size).toBe('raw-image'.length);
    expect(getUrlImageCached('images/cam1/photo.JPG')).toBeUndefined();
  });

  it('tries URL mask candidates and returns the first matching file', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(buildResponse({ status: 404 }))
      .mockResolvedValueOnce(okImageResponse('mask', 'image/png'));

    vi.stubGlobal('fetch', fetchMock);

    const mask = await fetchUrlMask('https://example.test/masks', 'images/cam1/photo.jpg');
    const cachedMask = await fetchUrlMask('https://example.test/masks', 'images/cam1/photo.jpg');

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://example.test/masks/cam1/photo.jpg');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://example.test/masks/cam1/photo.jpg.png');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mask?.name).toBe('photo.jpg.png');
    expect(mask?.type).toBe('image/png');
    expect(cachedMask).toBe(mask);
    expect(getUrlMaskCached('images/cam1/photo.jpg')).toBe(mask);
    expect(getUrlMaskCacheStats()).toEqual({ count: 1, sizeBytes: mask?.size ?? 0 });

    debug.mockRestore();
  });

  it('prefetches only uncached images in concurrency-sized batches', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => okImageResponse(url));
    vi.stubGlobal('fetch', fetchMock);

    await fetchUrlImage('https://example.test/images', 'cached.jpg');
    fetchMock.mockClear();

    await prefetchUrlImages(
      'https://example.test/images',
      ['cached.jpg', 'first.jpg', 'second.jpg', 'third.jpg'],
      2
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://example.test/images/first.jpg',
      'https://example.test/images/second.jpg',
      'https://example.test/images/third.jpg',
    ]);
  });
});
