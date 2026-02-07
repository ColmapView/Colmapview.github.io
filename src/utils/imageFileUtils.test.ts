import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the zipLoader module so fetchZipMask can populate the cache
vi.mock('./zipLoader', () => ({
  hasActiveZipArchive: vi.fn(),
  findZipEntry: vi.fn(),
  extractZipImage: vi.fn(),
  getActiveZipImageIndex: vi.fn(),
  clearActiveZipArchive: vi.fn(),
}));

import { hasActiveZipArchive, findZipEntry, getActiveZipImageIndex } from './zipLoader';
import {
  fetchZipMask,
  removeZipMaskCacheEntries,
  getZipMaskCacheStats,
  clearZipCache,
  getMaskPathVariants,
} from './imageFileUtils';

describe('removeZipMaskCacheEntries', () => {
  beforeEach(() => {
    clearZipCache();
    vi.clearAllMocks();
  });

  it('removes cached mask entries by image name', async () => {
    // Set up mocks so fetchZipMask can find and cache masks
    vi.mocked(hasActiveZipArchive).mockReturnValue(true);
    vi.mocked(getActiveZipImageIndex).mockReturnValue(new Map());

    const maskFile = new File([new Uint8Array([1, 2, 3])], 'mask.png', { type: 'image/png' });

    // findZipEntry returns an extractable entry for any mask path
    vi.mocked(findZipEntry).mockImplementation((path: string) => {
      if (path.startsWith('masks/')) {
        return {
          path,
          extract: () => Promise.resolve(maskFile),
        } as any;
      }
      return null;
    });

    // Populate the cache by fetching masks
    await fetchZipMask('cam1/photo1.jpg');
    await fetchZipMask('cam1/photo2.jpg');
    await fetchZipMask('cam1/photo3.jpg');

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

    const maskFile = new File([new Uint8Array([1])], 'mask.png', { type: 'image/png' });
    vi.mocked(findZipEntry).mockImplementation((path: string) => {
      if (path.startsWith('masks/')) {
        return { path, extract: () => Promise.resolve(maskFile) } as any;
      }
      return null;
    });

    await fetchZipMask('existing.jpg');
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
