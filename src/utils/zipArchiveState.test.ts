import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildArchiveEntry, buildArchiveReader } from '../test/builders';
import type { ArchiveEntry } from '../archive/types';
import {
  clearActiveZipArchive,
  closeZipArchive,
  extractZipImage,
  findZipEntry,
  getActiveZipImageIndex,
  getActiveZipStats,
  hasActiveZipArchive,
  setActiveZipArchive,
} from './zipArchiveState';
import { buildArchiveImageIndex } from './zipLoaderPolicy';

function makeEntry(name: string, file = new File([new Uint8Array([1, 2, 3])], name)): ArchiveEntry {
  return buildArchiveEntry({
    name,
    size: file.size,
    lastModified: 0,
    extract: vi.fn().mockResolvedValue(file),
  });
}

function indexArchiveImages(entries: Array<{ path: string; entry: ArchiveEntry }>): Map<string, ArchiveEntry> {
  return buildArchiveImageIndex(new Map(entries.map(({ path, entry }) => [path, entry])));
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

  it('keeps every close caller waiting for the same pending cleanup', async () => {
    let finishCleanup!: () => void;
    const cleanup = new Promise<void>(resolve => { finishCleanup = resolve; });
    const close = vi.fn(() => cleanup);
    const archive = buildArchiveReader({ close });
    const finished: string[] = [];
    const first = closeZipArchive(archive).then(() => { finished.push('first'); });
    const second = closeZipArchive(archive).then(() => { finished.push('second'); });
    await Promise.resolve();
    expect(finished).toEqual([]);
    expect(close).toHaveBeenCalledOnce();
    finishCleanup();
    await Promise.all([first, second]);
    expect(finished).toEqual(['first', 'second']);
  });

  it.each(['synchronous', 'asynchronous'] as const)('preserves %s cleanup failures for repeated close callers', async mode => {
    const error = new Error('cleanup failed');
    const close = vi.fn(() => {
      if (mode === 'synchronous') throw error;
      return Promise.reject(error);
    });
    const archive = buildArchiveReader({ close });
    await expect(closeZipArchive(archive)).rejects.toBe(error);
    await expect(closeZipArchive(archive)).rejects.toBe(error);
    expect(close).toHaveBeenCalledOnce();
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

  it.each([false, true])('does not guess between case-distinct photos, reverse order: %s', reverse => {
    const upper = makeEntry('Palacio.JPG'), lower = makeEntry('Palacio.jpg');
    const entries: Array<[string, ArchiveEntry]> = [['images/Palacio.JPG', upper], ['images/Palacio.jpg', lower]];
    const index = new Map(reverse ? entries.reverse() : entries);
    expect(findZipEntry('Palacio.Jpg', index)).toBeNull();
    expect(findZipEntry('Palacio.JPG', index)).toBe(upper);
    expect(findZipEntry('Palacio.jpg', index)).toBe(lower);
  });

  it('keeps a unique case-insensitive match when several aliases identify the same photo', () => {
    const photo = makeEntry('PHOTO.JPG');
    expect(findZipEntry('photo.jpg', new Map([['PHOTO.JPG', photo], ['images/PHOTO.JPG', photo]]))).toBe(photo);
  });

  it.each(['cam/photo.jpg', 'cam/PHOTO.JPG'])('prefers a qualified photo match over another camera basename for %s', requested => {
    const other = makeEntry('photo.jpg'), wanted = makeEntry('photo.jpg');
    const index = new Map([['photo.jpg', other], ['images/cam/photo.jpg', wanted]]);
    expect(findZipEntry(requested, index)).toBe(wanted);
  });

  it.each([false, true])('does not retain a first-file-wins basename alias, reverse order: %s', reverse => {
    const left = makeEntry('photo.jpg'), right = makeEntry('photo.jpg');
    const entries = [{ path: 'images/left/photo.jpg', entry: left }, { path: 'images/right/photo.jpg', entry: right }];
    const index = indexArchiveImages(reverse ? entries.reverse() : entries);
    expect(findZipEntry('photo.jpg', index)).toBeNull();
    expect(findZipEntry('left/photo.jpg', index)).toBe(left);
    expect(findZipEntry('right/photo.jpg', index)).toBe(right);
  });

  it.each([false, true])('preserves an actual full path when another file has the same suffix, reverse order: %s', reverse => {
    const nested = makeEntry('photo.jpg'), root = makeEntry('photo.jpg');
    const entries = [{ path: 'images/camera/photo.jpg', entry: nested }, { path: 'photo.jpg', entry: root }];
    const index = indexArchiveImages(reverse ? entries.reverse() : entries);
    expect(findZipEntry('photo.jpg', index)).toBe(root);
    expect(findZipEntry('camera/photo.jpg', index)).toBe(nested);
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

  it('routes bounded display requests to previews and raw requests to original extraction', async () => {
    const original = new File(['original'], 'photo.png');
    const preview = new File(['preview'], 'photo.jpg');
    const extract = vi.fn(async () => original);
    const extractPreview = vi.fn(async () => preview);
    const entry = buildArchiveEntry({ name: 'photo.png', extract, extractPreview });
    setActiveZipArchive(buildArchiveReader(), new Map([['photo.png', entry]]));
    const signal = new AbortController().signal;
    const options = { signal, bounds: { maxWidth: 800, maxHeight: 600 } };

    await expect(extractZipImage('photo.png', options)).resolves.toBe(preview);
    expect(extractPreview).toHaveBeenCalledExactlyOnceWith(options);
    expect(extract).not.toHaveBeenCalled();
    await expect(extractZipImage('photo.png', { signal })).resolves.toBe(original);
    expect(extract).toHaveBeenCalledExactlyOnceWith({ signal });
    expect(extractPreview).toHaveBeenCalledOnce();
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
