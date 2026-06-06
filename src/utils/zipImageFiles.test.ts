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
  compressAndResizeToJpeg: vi.fn(async (_blob: Blob, filename: string) => {
    return new File([filename], filename.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  }),
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
  isZipLoadingAvailable,
  removeZipMaskCacheEntries,
} from './zipImageFiles';

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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('zip image files', () => {
  it('reports availability from the active ZIP archive', () => {
    vi.mocked(hasActiveZipArchive).mockReturnValue(false);
    expect(isZipLoadingAvailable()).toBe(false);

    vi.mocked(hasActiveZipArchive).mockReturnValue(true);
    expect(isZipLoadingAvailable()).toBe(true);
  });

  it('dedupes concurrent image extraction and caches the compressed file', async () => {
    vi.mocked(hasActiveZipArchive).mockReturnValue(true);

    const extractedFile = buildReadableFile({ name: 'photo.png', contents: '123' });
    const deferred = createDeferred<File | null>();

    vi.mocked(extractZipImage).mockReturnValue(deferred.promise);

    const first = fetchZipImage('cam1/photo.png');
    const second = fetchZipImage('cam1/photo.png');

    expect(extractZipImage).toHaveBeenCalledTimes(1);

    deferred.resolve(extractedFile);

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe(secondResult);
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
    expect(extractZipImage).toHaveBeenCalledWith('cam1/photo.png');
    expect(getZipImageCached('cam1/photo.png')).toBeUndefined();
    expect(getZipImageCacheStats()).toEqual({ count: 0, sizeBytes: 0 });
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
    expect(getZipMaskCacheStats()).toEqual({ count: 2, sizeBytes: 6 });

    removeZipMaskCacheEntries(['cam1/photo1.jpg']);
    expect(getZipMaskCacheStats()).toEqual({ count: 1, sizeBytes: 3 });

    vi.mocked(findZipEntry).mockClear();
    expect(await fetchZipMask('cam1/photo2.jpg')).toBe(maskFile);
    expect(findZipEntry).not.toHaveBeenCalled();
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
