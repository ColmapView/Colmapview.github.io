import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildArchiveEntry,
  buildFile,
  buildReadableFile,
  buildResponse,
} from '../test/builders';

// Mock the zipLoader module so fetchZipMask can populate the cache
vi.mock('./zipLoader', () => ({
  hasActiveZipArchive: vi.fn(),
  findZipEntry: vi.fn(),
  extractZipImage: vi.fn(),
  getActiveZipImageIndex: vi.fn(),
  clearActiveZipArchive: vi.fn(),
}));

import { hasActiveZipArchive, findZipEntry, getActiveZipImageIndex, extractZipImage } from './zipLoader';
import {
  collectImageFiles,
  clearUrlImageCache,
  fetchUrlImage,
  fetchZipImage,
  fetchZipMask,
  getImageFile,
  getMaskFile,
  getZipImageCacheStats,
  removeZipMaskCacheEntries,
  getZipMaskCacheStats,
  clearZipCache,
  getMaskPathVariants,
} from './imageFileUtils';

let consoleLog: ReturnType<typeof vi.spyOn>;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  clearUrlImageCache();
  clearZipCache();
  vi.clearAllMocks();
  consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleLog.mockRestore();
  vi.unstubAllGlobals();
});

describe('image request deduplication', () => {
  it('resolves concurrent URL image waiters when the shared fetch fails', async () => {
    const response = buildResponse({ status: 404 });
    const deferred = createDeferred<Response>();
    const fetchMock = vi.fn(() => deferred.promise);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    vi.stubGlobal('fetch', fetchMock);

    const first = fetchUrlImage('https://example.test/images', 'cam1/photo.jpg');
    const second = fetchUrlImage('https://example.test/images', 'cam1/photo.jpg');

    expect(fetchMock).toHaveBeenCalledTimes(1);

    deferred.resolve(response);

    await expect(Promise.all([first, second])).resolves.toEqual([null, null]);

    warn.mockRestore();
  });

  it('dedupes concurrent ZIP image extraction and caches the result', async () => {
    vi.mocked(hasActiveZipArchive).mockReturnValue(true);

    const extractedFile = buildReadableFile({ name: 'photo.jpg', contents: '123' });
    const deferred = createDeferred<File | null>();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    vi.mocked(extractZipImage).mockReturnValue(deferred.promise);

    const first = fetchZipImage('cam1/photo.jpg');
    const second = fetchZipImage('cam1/photo.jpg');

    expect(extractZipImage).toHaveBeenCalledTimes(1);

    deferred.resolve(extractedFile);

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe(secondResult);
    expect(firstResult?.name).toBe('photo.jpg');
    expect(getZipImageCacheStats().count).toBe(1);

    await expect(fetchZipImage('cam1/photo.jpg')).resolves.toBe(firstResult);
    expect(extractZipImage).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });
});

describe('removeZipMaskCacheEntries', () => {
  it('removes cached mask entries by image name', async () => {
    // Set up mocks so fetchZipMask can find and cache masks
    vi.mocked(hasActiveZipArchive).mockReturnValue(true);
    vi.mocked(getActiveZipImageIndex).mockReturnValue(new Map());

    const maskFile = buildFile('mask.png', '123', 'image/png');

    // findZipEntry returns an extractable entry for any mask path
    vi.mocked(findZipEntry).mockImplementation((path: string) => {
      if (path.startsWith('masks/')) {
        return buildArchiveEntry({ name: path, extract: () => Promise.resolve(maskFile) });
      }
      return null;
    });

    // Populate the cache by fetching masks
    await fetchZipMask('cam1/photo1.jpg');
    await fetchZipMask('cam1/photo2.jpg');
    await fetchZipMask('cam1/photo3.jpg');

    expect(console.log).toHaveBeenCalledWith('[ZIP Mask] Found mask for cam1/photo1.jpg');
    expect(console.log).toHaveBeenCalledWith('[ZIP Mask] Found mask for cam1/photo2.jpg');
    expect(console.log).toHaveBeenCalledWith('[ZIP Mask] Found mask for cam1/photo3.jpg');

    expect(getZipMaskCacheStats().count).toBe(3);

    // Remove two entries
    removeZipMaskCacheEntries(['cam1/photo1.jpg', 'cam1/photo3.jpg']);

    expect(getZipMaskCacheStats().count).toBe(1);

    // The remaining entry should still be cached (fetching again should be instant)
    vi.mocked(findZipEntry).mockClear();
    const result = await fetchZipMask('cam1/photo2.jpg');
    expect(result).toBe(maskFile);
    // Should not have called findZipEntry again (served from cache)
    expect(findZipEntry).not.toHaveBeenCalled();
  });

  it('is a no-op for names not in cache', async () => {
    vi.mocked(hasActiveZipArchive).mockReturnValue(true);
    vi.mocked(getActiveZipImageIndex).mockReturnValue(new Map());

    const maskFile = buildFile('mask.png', '1', 'image/png');
    vi.mocked(findZipEntry).mockImplementation((path: string) => {
      if (path.startsWith('masks/')) {
        return buildArchiveEntry({ name: path, extract: () => Promise.resolve(maskFile) });
      }
      return null;
    });

    await fetchZipMask('existing.jpg');
    expect(console.log).toHaveBeenCalledWith('[ZIP Mask] Found mask for existing.jpg');
    expect(getZipMaskCacheStats().count).toBe(1);

    // Remove a name that was never cached
    removeZipMaskCacheEntries(['nonexistent.jpg']);

    expect(getZipMaskCacheStats().count).toBe(1);
  });

  it('handles empty array', () => {
    removeZipMaskCacheEntries([]);
    expect(getZipMaskCacheStats().count).toBe(0);
  });
});

describe('getMaskPathVariants', () => {
  it('generates variants for plain image name', () => {
    const variants = getMaskPathVariants('photo.jpg');
    expect(variants).toContain('masks/photo.jpg');
    expect(variants).toContain('masks/photo.jpg.png');
  });

  it('strips images/ prefix', () => {
    const variants = getMaskPathVariants('images/cam1/photo.jpg');
    expect(variants).toContain('masks/cam1/photo.jpg');
    expect(variants).toContain('masks/cam1/photo.jpg.png');
    // Should not contain double images/ path
    expect(variants.some(v => v.includes('images/'))).toBe(false);
  });

  it('handles backslash paths', () => {
    const variants = getMaskPathVariants('images\\cam1\\photo.jpg');
    expect(variants).toContain('masks/cam1/photo.jpg');
    expect(variants).toContain('masks/cam1/photo.jpg.png');
  });

  it('includes filename-only variants', () => {
    const variants = getMaskPathVariants('images/cam1/photo.jpg');
    expect(variants).toContain('masks/photo.jpg');
    expect(variants).toContain('masks/photo.jpg.png');
  });
});

describe('local image lookup', () => {
  it('prefers the canonical images folder over duplicate basename suffixes', () => {
    const downscaled = buildFile('photo.jpg', 'small');
    const fullResolution = buildFile('photo.jpg', 'full');
    const imageFiles = collectImageFiles(new Map([
      ['dataset/images_4/photo.jpg', downscaled],
      ['dataset/images/photo.jpg', fullResolution],
    ]));

    expect(getImageFile(imageFiles, 'photo.jpg')).toBe(fullResolution);
  });

  it('falls back to a plain filename when no images folder key exists', () => {
    const image = buildFile('photo.jpg', 'root');
    const imageFiles = collectImageFiles(new Map([
      ['photo.jpg', image],
    ]));

    expect(getImageFile(imageFiles, 'photo.jpg')).toBe(image);
  });

  it('does not let masks satisfy plain image filename lookups', () => {
    const mask = buildFile('photo.jpg', 'mask');
    const image = buildFile('photo.jpg', 'image');
    const imageFiles = collectImageFiles(new Map([
      ['dataset/masks/photo.jpg', mask],
      ['photo.jpg', image],
    ]));

    expect(getImageFile(imageFiles, 'photo.jpg')).toBe(image);
  });

  it('does not let auxiliary images satisfy camera image lookups', () => {
    const depth = buildFile('photo.jpg', 'depth');
    const segmentation = buildFile('photo.jpg', 'segmentation');
    const imageFiles = collectImageFiles(new Map([
      ['dataset/depth/cam1/photo.jpg', depth],
      ['dataset/segmentation/photo.jpg', segmentation],
    ]));

    expect(getImageFile(imageFiles, 'cam1/photo.jpg')).toBeUndefined();
    expect(getImageFile(imageFiles, 'photo.jpg')).toBeUndefined();
  });

  it('keeps real image folders aliasable even when a camera folder has an auxiliary name', () => {
    const image = buildFile('photo.jpg', 'image');
    const imageFiles = collectImageFiles(new Map([
      ['dataset/images_4/depth/photo.jpg', image],
    ]));

    expect(getImageFile(imageFiles, 'depth/photo.jpg')).toBe(image);
    expect(getImageFile(imageFiles, 'photo.jpg')).toBe(image);
  });

  it('keeps masks available through mask-specific lookups', () => {
    const mask = buildFile('photo.jpg', 'mask');
    const imageFiles = collectImageFiles(new Map([
      ['dataset/masks/photo.jpg', mask],
    ]));

    expect(getImageFile(imageFiles, 'photo.jpg')).toBeUndefined();
    expect(getMaskFile(imageFiles, 'photo.jpg')).toBe(mask);
  });
});
