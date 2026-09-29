import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Archive } from 'libarchive.js';
import { buildArchiveEntry, buildArchiveReader, buildFile } from '../test/builders';
import { downloadZip, type ZipProgressCallback } from './zipDownload';
import { isArchiveFile, loadZipFromFile, loadZipFromUrl } from './zipLoader';

vi.mock('libarchive.js', () => ({ Archive: { init: vi.fn(), open: vi.fn() } }));
vi.mock('./zipDownload', async (importOriginal) => ({
  ...await importOriginal<typeof import('./zipDownload')>(),
  downloadZip: vi.fn(),
}));

function colmapEntries() {
  return ['cameras.bin', 'images.bin', 'points3D.bin'].map((name) => ({
    path: 'sparse/0',
    file: buildArchiveEntry({ name }),
  }));
}

describe.each(['local', 'url'] as const)('%s archive reader ownership', (source) => {
  const load = (onProgress: ZipProgressCallback = vi.fn()) => source === 'local'
    ? loadZipFromFile(buildFile('dataset.zip'), onProgress)
    : loadZipFromUrl('https://example.com/dataset.zip', onProgress);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(downloadZip).mockResolvedValue(new Blob(['archive']));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('keeps a successfully loaded reader open for lazy image extraction', async () => {
    const image = buildArchiveEntry({ name: 'photo.jpg' });
    const close = vi.fn(async () => {});
    const archive = buildArchiveReader({
      getFilesArray: async () => [...colmapEntries(), { path: 'images', file: image }],
      close,
    });
    vi.mocked(Archive.open).mockResolvedValue(archive);

    const result = await load();

    expect(result.archive).toBe(archive);
    expect(result.colmapFiles.size).toBe(3);
    expect(result.imageIndex.get('images/photo.jpg')).toBe(image);
    expect(result.imageCount).toBe(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('closes the reader when listing entries fails and preserves the original error', async () => {
    const error = new Error('corrupt directory');
    const close = vi.fn().mockRejectedValue(new Error('close failed'));
    vi.mocked(Archive.open).mockResolvedValue(buildArchiveReader({
      getFilesArray: vi.fn().mockRejectedValue(error),
      close,
    }));

    await expect(load()).rejects.toBe(error);
    expect(close).toHaveBeenCalledOnce();
  });

  it('extracts project settings from a wrapped archive and leaves unrelated YAML alone', async () => {
    const settings = buildFile('colmapview.yaml', 'ui:\n  background_color: "#123456"');
    const unrelated = buildArchiveEntry({ name: 'training.yaml', extract: vi.fn() });
    vi.mocked(Archive.open).mockResolvedValue(buildArchiveReader({ getFilesArray: async () => [
      ...colmapEntries(), { path: 'project', file: buildArchiveEntry({ name: 'colmapview.yaml', extract: async () => settings }) },
      { path: 'project', file: unrelated },
    ] }));
    const result = await load();
    expect(result.colmapFiles.get('project/colmapview.yaml')).toBe(settings);
    expect(unrelated.extract).not.toHaveBeenCalled();
  });

  it.each(['oversized', 'unreadable'] as const)('skips %s optional archive settings', async mode => {
    const extract = vi.fn().mockRejectedValue(new Error('Read failed'));
    vi.mocked(Archive.open).mockResolvedValue(buildArchiveReader({ getFilesArray: async () => [
      ...colmapEntries(), { path: '', file: buildArchiveEntry({ name: 'colmapview.yaml', size: mode === 'oversized' ? 300000 : 4, extract }) },
    ] }));
    const result = await load();
    expect(result.colmapFiles.size).toBe(3);
    if (mode === 'oversized') expect(extract).not.toHaveBeenCalled();
  });

  it('closes the reader when extraction fails', async () => {
    const error = new Error('corrupt entry');
    const entries = colmapEntries();
    entries[0].file.extract = vi.fn().mockRejectedValue(error);
    const close = vi.fn(async () => {});
    vi.mocked(Archive.open).mockResolvedValue(buildArchiveReader({
      getFilesArray: async () => entries,
      close,
    }));

    await expect(load()).rejects.toBe(error);
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes the reader when required COLMAP files are missing', async () => {
    const close = vi.fn(async () => {});
    vi.mocked(Archive.open).mockResolvedValue(buildArchiveReader({ close }));

    await expect(load()).rejects.toThrow('does not contain valid COLMAP files');
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes the reader if extraction progress throws', async () => {
    const close = vi.fn(async () => {});
    vi.mocked(Archive.open).mockResolvedValue(buildArchiveReader({
      getFilesArray: async () => colmapEntries(),
      close,
    }));

    await expect(load((progress) => {
      if (progress.percent >= 60) throw new Error('progress failed');
    })).rejects.toThrow('progress failed');
    expect(close).toHaveBeenCalledOnce();
  });

  if (source === 'url') {
    it('closes a reader opened after its URL load is cancelled', async () => {
      const controller = new AbortController();
      const close = vi.fn(async () => {});
      const getFilesArray = vi.fn(async () => colmapEntries());
      vi.mocked(Archive.open).mockImplementation(async () => {
        controller.abort();
        return buildArchiveReader({ close, getFilesArray });
      });

      await expect(loadZipFromUrl('https://example.com/dataset.zip', vi.fn(), controller.signal))
        .rejects.toMatchObject({ name: 'AbortError' });
      expect(close).toHaveBeenCalledOnce();
      expect(getFilesArray).not.toHaveBeenCalled();
    });
  }
});

describe('isArchiveFile', () => {
  it('treats a dropped SOG as a splat, never as a dataset archive, even with a ZIP MIME type', () => {
    // A SOG bundle is itself a ZIP; routing it to the archive loader would look
    // for COLMAP files inside it instead of rendering it.
    expect(isArchiveFile(new File(['PK'], 'scene.sog', { type: 'application/zip' }))).toBe(false);
    expect(isArchiveFile(new File(['PK'], 'dataset.zip', { type: 'application/zip' }))).toBe(true);
  });
});
