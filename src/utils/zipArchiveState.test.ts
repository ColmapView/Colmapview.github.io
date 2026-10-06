import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildArchiveEntry, buildArchiveReader } from '../test/builders';
import type { ArchiveEntry } from '../types/libarchive';
import {
  clearActiveZipArchive,
  extractZipImage,
  findZipEntry,
  getActiveZipImageIndex,
  getActiveZipStats,
  hasActiveZipArchive,
  setActiveZipArchive,
} from './zipArchiveState';
import { getArchiveImageLookupKeys } from './zipLoaderPolicy';

function makeEntry(name: string, file = new File([new Uint8Array([1, 2, 3])], name)): ArchiveEntry {
  return buildArchiveEntry({
    name,
    size: file.size,
    lastModified: 0,
    extract: vi.fn().mockResolvedValue(file),
  });
}

function indexArchiveImages(entries: Array<{ path: string; entry: ArchiveEntry }>): Map<string, ArchiveEntry> {
  const index = new Map<string, ArchiveEntry>();
  for (const { path, entry } of entries) {
    for (const key of getArchiveImageLookupKeys(path)) {
      if (!index.has(key)) {
        index.set(key, entry);
      }
    }
  }
  return index;
}

describe('zip archive state', () => {
  beforeEach(() => {
    clearActiveZipArchive();
  });

  afterEach(() => {
    clearActiveZipArchive();
    vi.restoreAllMocks();
  });

  it('tracks active archive availability, index, and stats', () => {
    const imageIndex = new Map<string, ArchiveEntry>([
      ['images/photo.jpg', makeEntry('photo.jpg')],
    ]);

    expect(hasActiveZipArchive()).toBe(false);
    expect(getActiveZipImageIndex()).toBeNull();
    expect(getActiveZipStats()).toEqual({ fileSize: 0, imageCount: 0 });

    setActiveZipArchive(buildArchiveReader(), imageIndex, 1024, 1);

    expect(hasActiveZipArchive()).toBe(true);
    expect(getActiveZipImageIndex()).toBe(imageIndex);
    expect(getActiveZipStats()).toEqual({ fileSize: 1024, imageCount: 1 });

    clearActiveZipArchive();

    expect(hasActiveZipArchive()).toBe(false);
    expect(getActiveZipImageIndex()).toBeNull();
    expect(getActiveZipStats()).toEqual({ fileSize: 0, imageCount: 0 });
  });

  it('replaces prior active archive state when setting a new archive', () => {
    const firstIndex = new Map<string, ArchiveEntry>([
      ['first.jpg', makeEntry('first.jpg')],
    ]);
    const secondIndex = new Map<string, ArchiveEntry>([
      ['second.jpg', makeEntry('second.jpg')],
    ]);

    setActiveZipArchive(buildArchiveReader(), firstIndex, 100, 1);
    setActiveZipArchive(buildArchiveReader(), secondIndex, 200, 2);

    expect(getActiveZipImageIndex()).toBe(secondIndex);
    expect(getActiveZipStats()).toEqual({ fileSize: 200, imageCount: 2 });
  });

  it('closes readers exactly once on replacement and clear, retaining the current reader for lazy extraction', async () => {
    const firstClose = vi.fn(async () => {});
    const secondClose = vi.fn(async () => {});
    const first = buildArchiveReader({ close: firstClose });
    const second = buildArchiveReader({ close: secondClose });
    const file = new File(['image'], 'photo.jpg');
    const index = new Map([['photo.jpg', makeEntry('photo.jpg', file)]]);
    setActiveZipArchive(first, index);
    setActiveZipArchive(second, index);
    expect(firstClose).toHaveBeenCalledOnce();
    expect(secondClose).not.toHaveBeenCalled();
    setActiveZipArchive(second, index, 10, 1);
    await expect(extractZipImage('photo.jpg')).resolves.toBe(file);
    expect(secondClose).not.toHaveBeenCalled();
    clearActiveZipArchive();
    clearActiveZipArchive();
    expect(secondClose).toHaveBeenCalledOnce();
  });

  it('ignores an image extracted after its archive was replaced', async () => {
    let resolve!: (file: File) => void;
    const entry = makeEntry('photo.jpg');
    vi.mocked(entry.extract).mockImplementation(() => new Promise<File>(done => { resolve = done; }));
    setActiveZipArchive(buildArchiveReader(), new Map([['photo.jpg', entry]]));
    const pending = extractZipImage('photo.jpg');
    setActiveZipArchive(buildArchiveReader(), new Map());
    resolve(new File(['old image'], 'photo.jpg'));
    await expect(pending).resolves.toBeNull();
  });

  it('clears ownership even when reader close rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setActiveZipArchive(buildArchiveReader({ close: vi.fn().mockRejectedValue(new Error('close failed')) }), new Map());
    clearActiveZipArchive();
    expect(hasActiveZipArchive()).toBe(false);
    await Promise.resolve();
    expect(warn).toHaveBeenCalledWith('[ZIP] Failed to close archive:', expect.any(Error));
  });

  it('finds ZIP entries by normalized, prefixed, filename, and case-insensitive candidates', () => {
    const direct = makeEntry('direct.jpg');
    const prefixed = makeEntry('nested.jpg');
    const filename = makeEntry('photo.jpg');
    const mixedCase = makeEntry('CAM2.JPG');
    const index = new Map<string, ArchiveEntry>([
      ['cam1/direct.jpg', direct],
      ['images/cam1/nested.jpg', prefixed],
      ['photo.jpg', filename],
      ['images/CAM2.JPG', mixedCase],
    ]);

    expect(findZipEntry('cam1\\direct.jpg', index)).toBe(direct);
    expect(findZipEntry('cam1/nested.jpg', index)).toBe(prefixed);
    expect(findZipEntry('folder/photo.jpg', index)).toBe(filename);
    expect(findZipEntry('cam2.jpg', index)).toBe(mixedCase);
    expect(findZipEntry('missing.jpg', index)).toBeNull();
  });

  it('does not resolve ZIP image requests to mask entries with the same filename', () => {
    const mask = makeEntry('photo.jpg');
    const photo = makeEntry('photo.jpg');
    const index = indexArchiveImages([
      { path: 'project/masks/photo.jpg', entry: mask },
      { path: 'project/images/photo.jpg', entry: photo },
    ]);

    expect(findZipEntry('photo.jpg', index)).toBe(photo);
    expect(findZipEntry('masks/photo.jpg', index)).toBe(mask);
  });

  it('does not resolve ZIP image requests to auxiliary entries with matching suffixes', () => {
    const depth = makeEntry('photo.jpg');
    const segmentation = makeEntry('photo.jpg');
    const photo = makeEntry('photo.jpg');
    const auxiliaryOnlyIndex = indexArchiveImages([
      { path: 'project/depth/cam1/photo.jpg', entry: depth },
      { path: 'project/segmentation/photo.jpg', entry: segmentation },
    ]);
    const collisionIndex = indexArchiveImages([
      { path: 'project/depth/cam1/photo.jpg', entry: depth },
      { path: 'project/images/cam1/photo.jpg', entry: photo },
    ]);

    expect(findZipEntry('cam1/photo.jpg', auxiliaryOnlyIndex)).toBeNull();
    expect(findZipEntry('photo.jpg', auxiliaryOnlyIndex)).toBeNull();
    expect(findZipEntry('cam1/photo.jpg', collisionIndex)).toBe(photo);
  });

  it('does not resolve missing masks to original images with matching filenames', () => {
    const photo = makeEntry('photo.png');
    const mask = makeEntry('photo.png.png');
    const index = indexArchiveImages([
      { path: 'project/images/nested/photo.png', entry: photo },
      { path: 'project/masks/nested/photo.png.png', entry: mask },
    ]);
    expect(findZipEntry('masks/nested/photo.png', index)).toBeNull();
    expect(findZipEntry('masks/nested/photo.png.png', index)).toBe(mask);
    expect(findZipEntry('nested/photo.png', index)).toBe(photo);
  });

  it('extracts matching images from the active archive', async () => {
    const file = new File([new Uint8Array([9])], 'photo.jpg');
    const entry = makeEntry('photo.jpg', file);
    setActiveZipArchive(buildArchiveReader(), new Map([['images/photo.jpg', entry]]));

    await expect(extractZipImage('photo.jpg')).resolves.toBe(file);
    expect(entry.extract).toHaveBeenCalledOnce();
  });

  it('returns null when extraction is unavailable, missing, or fails', async () => {
    await expect(extractZipImage('photo.jpg')).resolves.toBeNull();

    setActiveZipArchive(buildArchiveReader(), new Map());
    await expect(extractZipImage('photo.jpg')).resolves.toBeNull();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const entry = makeEntry('broken.jpg');
    vi.mocked(entry.extract).mockRejectedValueOnce(new Error('boom'));
    setActiveZipArchive(buildArchiveReader(), new Map([['broken.jpg', entry]]));

    await expect(extractZipImage('broken.jpg')).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      '[ZIP] Failed to extract broken.jpg:',
      expect.any(Error)
    );
  });
});
