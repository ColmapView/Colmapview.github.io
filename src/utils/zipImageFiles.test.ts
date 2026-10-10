import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildArchiveEntry,
  buildFile,
  buildReadableFile,
} from '../test/builders';

vi.mock('./zipLoader', () => ({
  hasActiveZipArchive: vi.fn(),
  findZipEntry: vi.fn(),
  extractZipImage: vi.fn(),
  getActiveZipImageIndex: vi.fn(),
  clearActiveZipArchive: vi.fn(),
}));

vi.mock('./imageFileCompression', () => ({
  getMaxCacheDimensions: vi.fn(() => ({ maxWidth: 800, maxHeight: 600 })),
}));

import {
  clearActiveZipArchive,
  extractZipImage,
  findZipEntry,
  getActiveZipImageIndex,
  hasActiveZipArchive,
} from './zipLoader';
import {
  clearZipCache,
  fetchZipImage,
  fetchZipImageRaw,
  fetchZipMask,
  getZipImageCacheStats,
  getZipImageCached,
  getZipMaskCacheStats,
  getZipMaskCached,
  isZipLoadingAvailable,
  removeZipMaskCacheEntries,
} from './zipImageFiles';
import { appLogger } from './logger';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  clearZipCache();
  vi.clearAllMocks();
  // An archive's mask count is reported once, at info level.
  vi.spyOn(appLogger, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('zip image files', () => {
  it('reports availability from the active ZIP archive', () => {
    vi.mocked(hasActiveZipArchive).mockReturnValue(false);
    expect(isZipLoadingAvailable()).toBe(false);

    vi.mocked(hasActiveZipArchive).mockReturnValue(true);
    expect(isZipLoadingAvailable()).toBe(true);
  });

  it('dedupes concurrent image extraction and caches the worker preview', async () => {
    vi.mocked(hasActiveZipArchive).mockReturnValue(true);

    const preview = buildFile('photo.jpg', '123', 'image/jpeg');
    const deferred = createDeferred<File | null>();

    vi.mocked(extractZipImage).mockReturnValue(deferred.promise);

    const first = fetchZipImage('cam1/photo.png');
    const second = fetchZipImage('cam1/photo.png');

    expect(extractZipImage).toHaveBeenCalledTimes(1);

    deferred.resolve(preview);

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe(secondResult);
    expect(firstResult).toBe(preview);
    expect(firstResult?.name).toBe('photo.jpg');
    expect(getZipImageCached('cam1/photo.png')).toBe(firstResult);
    expect(getZipImageCacheStats()).toEqual({ count: 1, sizeBytes: firstResult?.size ?? 0 });

    await expect(fetchZipImage('cam1/photo.png')).resolves.toBe(firstResult);
    expect(extractZipImage).toHaveBeenCalledTimes(1);
  });

  it('extracts raw ZIP images without compression or display-cache writes', async () => {
    vi.mocked(hasActiveZipArchive).mockReturnValue(true);

    const rawFile = buildReadableFile({ name: 'photo.png', contents: 'raw' });
    vi.mocked(extractZipImage).mockResolvedValue(rawFile);

    const result = await fetchZipImageRaw('cam1/photo.png');

    expect(result).toBe(rawFile);
    expect(extractZipImage).toHaveBeenCalledWith('cam1/photo.png', expect.objectContaining({
      signal: expect.any(AbortSignal), getPriority: expect.any(Function),
    }));
    expect(getZipImageCached('cam1/photo.png')).toBeUndefined();
    expect(getZipImageCacheStats()).toEqual({ count: 0, sizeBytes: 0 });
  });

  it('uses worker previews without decoding or recompressing them on the main thread', async () => {
    vi.mocked(hasActiveZipArchive).mockReturnValue(true);
    vi.stubGlobal('createImageBitmap', vi.fn());
    const preview = buildFile('photo.jpg', 'preview', 'image/jpeg');
    vi.mocked(extractZipImage).mockResolvedValue(preview);
    expect(await fetchZipImage('photo.png')).toBe(preview);
    expect(extractZipImage).toHaveBeenCalledWith('photo.png', expect.objectContaining({ bounds: { maxWidth: 800, maxHeight: 600 } }));
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(findZipEntry).not.toHaveBeenCalled();
  });

  it('shares a byte budget between display images and masks and bypasses oversized files', async () => {
    vi.mocked(hasActiveZipArchive).mockReturnValue(true);
    vi.mocked(getActiveZipImageIndex).mockReturnValue(new Map());
    const largeFile = (name: string, size: number) => {
      const file = buildFile(name, 'placeholder', 'image/png');
      Object.defineProperty(file, 'size', { value: size }); return file;
    };
    vi.mocked(findZipEntry).mockImplementation(path => buildArchiveEntry({ name: path,
      extract: async () => largeFile(path, 64 * 1024 * 1024) }));
    vi.mocked(extractZipImage).mockImplementation(async name => largeFile(name, (name === 'oversized.png' ? 129 : 64) * 1024 * 1024));
    await fetchZipImage('first.png'); await fetchZipImage('second.png'); await fetchZipMask('second.png');
    expect(getZipImageCached('first.png')).toBeUndefined(); expect(getZipImageCached('second.png')).toBeDefined();
    expect(getZipImageCacheStats().sizeBytes + getZipMaskCacheStats().sizeBytes).toBe(128 * 1024 * 1024);
    expect((await fetchZipImage('oversized.png'))?.size).toBe(129 * 1024 * 1024);
    expect(getZipImageCached('oversized.png')).toBeUndefined();
    expect(getZipImageCacheStats().sizeBytes + getZipMaskCacheStats().sizeBytes).toBe(128 * 1024 * 1024);
  });

  it('extracts, caches, and removes ZIP masks by image name', async () => {
    vi.mocked(hasActiveZipArchive).mockReturnValue(true);
    vi.mocked(getActiveZipImageIndex).mockReturnValue(new Map());

    const maskFile = buildFile('mask.png', '123', 'image/png');
    vi.mocked(findZipEntry).mockImplementation((path: string) => {
      if (path.startsWith('masks/')) {
        return buildArchiveEntry({ name: path, extract: () => Promise.resolve(maskFile) });
      }
      return null;
    });

    expect(await fetchZipMask('cam1/photo1.jpg')).toBe(maskFile);
    expect(await fetchZipMask('cam1/photo2.jpg')).toBe(maskFile);
    expect(getZipMaskCached('cam1/photo1.jpg')).toBe(maskFile);
    expect(getZipMaskCacheStats()).toEqual({ count: 2, sizeBytes: 6 });

    removeZipMaskCacheEntries(['cam1/photo1.jpg']);
    expect(getZipMaskCached('cam1/photo1.jpg')).toBeUndefined();
    expect(getZipMaskCacheStats()).toEqual({ count: 1, sizeBytes: 3 });

    vi.mocked(findZipEntry).mockClear();
    expect(await fetchZipMask('cam1/photo2.jpg')).toBe(maskFile);
    expect(findZipEntry).not.toHaveBeenCalled();
  });

  it('reports how many masks each archive holds, once, when its masks are first read', async () => {
    vi.mocked(hasActiveZipArchive).mockReturnValue(true);
    vi.mocked(findZipEntry).mockImplementation((path, index) => index.get(path) ?? null);
    const [maskA, maskB, image] = ['scene/masks/a.jpg.png', 'scene/masks/b.jpg.png', 'scene/images/a.jpg'].map(name => buildArchiveEntry({ name }));
    // The index keeps every path suffix of each file: each mask file counts once, and images not at all.
    vi.mocked(getActiveZipImageIndex).mockReturnValue(new Map([
      ['scene/masks/a.jpg.png', maskA], ['masks/a.jpg.png', maskA], ['scene/masks/b.jpg.png', maskB], ['masks/b.jpg.png', maskB],
      ['scene/images/a.jpg', image], ['images/a.jpg', image], ['a.jpg', image],
    ]));
    await fetchZipMask('a.jpg');
    await fetchZipMask('b.jpg');
    expect(appLogger.info).toHaveBeenCalledExactlyOnceWith('[ZIP Mask] Found 2 masks');

    vi.mocked(getActiveZipImageIndex).mockReturnValue(new Map([['masks/c.jpg.png', buildArchiveEntry({ name: 'masks/c.jpg.png' })]]));
    await fetchZipMask('c.jpg');
    expect(appLogger.info).toHaveBeenLastCalledWith('[ZIP Mask] Found 1 mask');

    vi.mocked(getActiveZipImageIndex).mockReturnValue(new Map([['images/d.jpg', buildArchiveEntry({ name: 'images/d.jpg' })]]));
    await fetchZipMask('d.jpg');
    expect(appLogger.info).toHaveBeenCalledTimes(2);
  });

  it('clears ZIP image and mask caches and releases the active archive', async () => {
    vi.mocked(hasActiveZipArchive).mockReturnValue(true);
    vi.mocked(getActiveZipImageIndex).mockReturnValue(new Map());
    vi.mocked(extractZipImage).mockResolvedValue(buildReadableFile({ name: 'photo.jpg', contents: '1' }));
    vi.mocked(findZipEntry).mockReturnValue(buildArchiveEntry({
      name: 'masks/photo.jpg',
      extract: () => Promise.resolve(buildFile('mask.png', 'mask', 'image/png')),
    }));

    await fetchZipImage('photo.jpg');
    await fetchZipMask('photo.jpg');
    expect(getZipImageCacheStats().count).toBe(1);
    expect(getZipMaskCacheStats().count).toBe(1);

    clearZipCache();

    expect(getZipImageCacheStats().count).toBe(0);
    expect(getZipMaskCacheStats().count).toBe(0);
    expect(clearActiveZipArchive).toHaveBeenCalledOnce();
  });
});

it('clear discards uncancellable ZIP extraction without settling a same-name replacement', async () => {
  vi.mocked(hasActiveZipArchive).mockReturnValue(true);
  const old = createDeferred<File | null>();
  const replacement = createDeferred<File | null>();
  vi.mocked(extractZipImage).mockReturnValueOnce(old.promise).mockReturnValueOnce(replacement.promise);
  const first = fetchZipImage('same.png');
  const duplicate = fetchZipImage('same.png');
  clearZipCache();
  await expect(Promise.all([first, duplicate])).resolves.toEqual([null, null]);
  const next = fetchZipImage('same.png');
  old.resolve(buildReadableFile({ name: 'old.png', contents: 'old' }));
  await old.promise;
  expect(getZipImageCached('same.png')).toBeUndefined();
  replacement.resolve(buildReadableFile({ name: 'new.png', contents: 'new' }));
  const file = await next;
  expect(file).not.toBeNull();
  expect(getZipImageCached('same.png')).toBe(file);
});
