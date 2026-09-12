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
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/images/cam1/photo.png', { signal: expect.any(AbortSignal) });
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

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/images/cam1/photo.JPG', { signal: expect.any(AbortSignal) });
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

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://example.test/masks/cam1/photo.jpg', { signal: expect.any(AbortSignal) });
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://example.test/masks/cam1/photo.jpg.png', { signal: expect.any(AbortSignal) });
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

  it('fetches an explicit per-image URL verbatim and caches it by COLMAP name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okImageResponse('mapped'));
    vi.stubGlobal('fetch', fetchMock);

    const explicitUrl = 'https://example.test/raw/10.07.25%20LHS/G0019585.JPG';
    const file = await fetchUrlImage('https://example.test/images/', '0.jpg', explicitUrl);

    // Explicit URL used as-is: no re-encoding, no join with the images base.
    expect(fetchMock).toHaveBeenCalledWith(explicitUrl, { signal: expect.any(AbortSignal) });
    // Display filename derived (decoded) from the explicit URL.
    expect(compressAndResizeToJpeg).toHaveBeenCalledWith(expect.any(Blob), 'G0019585.JPG');
    expect(file?.name).toBe('G0019585.jpg');
    // Cached under the COLMAP name, so getImageSync(name) finds it.
    expect(getUrlImageCached('0.jpg')).toBe(file);
  });

  it('fetches a raw explicit per-image URL for metric use', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okImageResponse('raw-mapped', 'image/jpeg'));
    vi.stubGlobal('fetch', fetchMock);

    const explicitUrl = 'https://example.test/raw/10.07.25%20RHS/G0019586.JPG';
    const file = await fetchUrlImageRaw('https://example.test/images/', '1.jpg', explicitUrl);

    expect(fetchMock).toHaveBeenCalledWith(explicitUrl, { signal: expect.any(AbortSignal) });
    expect(file?.name).toBe('G0019586.JPG');
    expect(file?.type).toBe('image/jpeg');
  });

  it('prefetch uses per-image mapped URLs when provided, falling back otherwise', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => okImageResponse(url));
    vi.stubGlobal('fetch', fetchMock);

    await prefetchUrlImages(
      'https://example.test/images/',
      ['0.jpg', '1.jpg'],
      2,
      { '0.jpg': 'https://example.test/raw/a/0.JPG' } // 1.jpg unmapped -> falls back to base
    );

    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([
      'https://example.test/images/1.jpg',
      'https://example.test/raw/a/0.JPG',
    ]);
  });

  it('stops probing masks after consecutive misses on a maskless source', async () => {
    const fetchMock = vi.fn(async () => buildResponse({ status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    // Probe more images than the absence threshold (8). Each miss is two
    // requests (the name and a .png suffix).
    for (let i = 0; i < 12; i++) {
      expect(await fetchUrlMask('https://example.test/masks/', `${i}.jpg`)).toBeNull();
    }
    expect(fetchMock).toHaveBeenCalledTimes(8 * 2);

    // Clearing the cache (a new dataset) resumes probing.
    fetchMock.mockClear();
    clearUrlImageCache();
    expect(await fetchUrlMask('https://example.test/masks/', 'fresh.jpg')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps probing masks once any mask is found (partially-masked source)', async () => {
    // First image has a mask (on the .png candidate); subsequent images miss but
    // must still be probed because the source clearly ships masks.
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('0.jpg.png') ? okImageResponse('mask', 'image/png') : buildResponse({ status: 404 })
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchUrlMask('https://example.test/masks/', '0.jpg')).toBeInstanceOf(File);
    for (let i = 1; i < 12; i++) {
      await fetchUrlMask('https://example.test/masks/', `${i}.jpg`);
    }
    // 2 (image 0) + 2 * 11 (images 1..11) — no short-circuit after a hit.
    expect(fetchMock).toHaveBeenCalledTimes(2 + 11 * 2);
  });
});

it('propagates independent cancellation through DatasetManager to an active URL body read', async () => {
  const { DatasetManager } = await import('../dataset/DatasetManager');
  let activeSignal!: AbortSignal;
  const started = createDeferred<void>();
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    activeSignal = init.signal as AbortSignal;
    return buildResponse({ blob: () => new Promise<Blob>((_resolve, reject) => {
      activeSignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      started.resolve();
    }) });
  });
  vi.stubGlobal('fetch', fetchMock);
  const manager = new DatasetManager(() => ({ sourceType: 'url', imageUrlBase: 'https://body.test/', maskUrlBase: null, imageNameToUrl: null, loadedFiles: null }));
  const first = new AbortController();
  const second = new AbortController();
  const a = manager.getImage('same.png', { signal: first.signal });
  const b = manager.getImage('same.png', { signal: second.signal });
  await started.promise;
  first.abort();
  await expect(a).resolves.toBeNull();
  expect(activeSignal.aborted).toBe(false);
  second.abort();
  await expect(b).resolves.toBeNull();
  expect(activeSignal.aborted).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('isolates same-name sources and shares explicit aliases without changing signed URLs', async () => {
  const fetchMock = vi.fn(async () => okImageResponse('bytes'));
  vi.stubGlobal('fetch', fetchMock);
  const url = 'https://alias.test/a%20b.png?sig=a%2Fb&x=2';
  const [a, b] = await Promise.all([fetchUrlImage(null, 'a', url), fetchUrlImage(null, 'b', url)]);
  expect(a).toBe(b);
  expect(getUrlImageCached('a', null, url)).toBe(a);
  expect(getUrlImageCached('b', null, url)).toBe(a);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await fetchUrlImage('https://other.test', 'a');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(getUrlImageCached('a', null, url)).toBe(a);
});

it('clear during encoding settles old aliases and protects replacement publication', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => okImageResponse('bytes')));
  const encoding = createDeferred<File>();
  const encodingStarted = createDeferred<void>();
  vi.mocked(compressAndResizeToJpeg).mockImplementationOnce(() => { encodingStarted.resolve(); return encoding.promise; });
  const old = fetchUrlImage('https://encoding.test', 'same.png');
  const duplicate = fetchUrlImage('https://encoding.test', 'same.png');
  await encodingStarted.promise;
  clearUrlImageCache();
  await expect(Promise.all([old, duplicate])).resolves.toEqual([null, null]);
  const current = await fetchUrlImage('https://encoding.test', 'same.png');
  encoding.resolve(new File(['obsolete'], 'obsolete'));
  await encoding.promise;
  expect(getUrlImageCached('same.png')).toBe(current);
});

it('only definitive absence suppresses masks, and suppression stays scoped to its source', async () => {
  const fetchMock = vi.fn(async () => buildResponse({ status: 503 }));
  vi.stubGlobal('fetch', fetchMock);
  for (let i = 0; i < 10; i++) await fetchUrlMask('https://errors.test/masks', `${i}.jpg`);
  expect(fetchMock).toHaveBeenCalledTimes(20);
  fetchMock.mockImplementation(async () => buildResponse({ status: 404 }));
  for (let i = 0; i < 10; i++) await fetchUrlMask('https://absent.test/masks', `${i}.jpg`);
  expect(fetchMock).toHaveBeenCalledTimes(36);
  await fetchUrlMask('https://independent.test/masks', 'same.jpg');
  expect(fetchMock).toHaveBeenCalledTimes(38);
});

it('coalesces overlapping mask candidate URLs across different names', async () => {
  const body = createDeferred<Blob>();
  const secondStarted = createDeferred<void>();
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/a.jpg')) return buildResponse({ status: 404 });
    secondStarted.resolve();
    return buildResponse({ blob: () => body.promise });
  });
  vi.stubGlobal('fetch', fetchMock);
  const first = fetchUrlMask('https://overlap.test', 'a.jpg');
  await secondStarted.promise;
  const second = fetchUrlMask('https://overlap.test', 'a.jpg.png');
  body.resolve(new Blob(['mask']));
  const [a, b] = await Promise.all([first, second]);
  expect(a?.size).toBe(4);
  expect(b?.size).toBe(4);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(getUrlMaskCacheStats()).toEqual({ count: 1, sizeBytes: 4 });
});

it('preserves exhausted 429 errors for every mask consumer without reporting 404 as failure', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn(async () => buildResponse({ status: 429, headers: new Headers({ 'Retry-After': '1' }) }));
  vi.stubGlobal('fetch', fetchMock);
  const firstError = vi.fn();
  const secondError = vi.fn();
  const a = fetchUrlMask('https://rate-mask.test', 'a.jpg', { onError: firstError });
  const b = fetchUrlMask('https://rate-mask.test', 'a.jpg', { onError: secondError });
  await vi.runAllTimersAsync();
  await expect(Promise.all([a, b])).resolves.toEqual([null, null]);
  expect(firstError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'http', status: 429, message: expect.stringContaining('429') }));
  expect(secondError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 429 }));
  expect(fetchMock).toHaveBeenCalledTimes(6);
  fetchMock.mockImplementation(async () => buildResponse({ status: 404 }));
  const absentError = vi.fn();
  await fetchUrlMask('https://absent-mask.test', 'a.jpg', { onError: absentError });
  expect(absentError).not.toHaveBeenCalled();
  vi.useRealTimers();
});
