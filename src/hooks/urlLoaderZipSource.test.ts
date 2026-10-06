import { describe, expect, it, vi } from 'vitest';
import { buildArchiveEntry, buildArchiveReader, buildFile } from '../test/builders';
import {
  loadZipUrlSource,
  mapZipProgressToUrlProgress,
} from './urlLoaderZipSource';

describe('URL loader ZIP source helpers', () => {
  it('keeps provider download credentials out of source state and logs', async () => {
    const archive = buildArchiveReader();
    const sourceUrl = 'https://drive.google.com/file/d/file123/view';
    const url = 'https://www.googleapis.com/drive/v3/files/file123?key=app-key&alt=media';
    const options = { filename: 'archive.tar', size: 1024, fetchImpl: vi.fn() };
    const signal = new AbortController().signal;
    const deps = {
      archiveOptions: options, sourceUrl, signal,
      loadZip: vi.fn(async () => ({ archive, colmapFiles: new Map(), imageIndex: new Map(), fileSize: 1024, imageCount: 0 })),
      log: vi.fn(), processFiles: vi.fn(), setActiveArchive: vi.fn(), setSourceInfo: vi.fn(), setUrlProgress: vi.fn(),
    };
    await loadZipUrlSource(url, deps);
    expect(deps.loadZip).toHaveBeenCalledWith(url, expect.any(Function), signal, options);
    expect(deps.setSourceInfo).toHaveBeenCalledWith('zip', sourceUrl);
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain('app-key');
  });
  it('closes an archive returned after cancellation without restoring the cleared source', async () => {
    const controller = new AbortController();
    const archive = buildArchiveReader();
    const close = vi.spyOn(archive, 'close');
    const deps = {
      signal: controller.signal,
      loadZip: vi.fn(async () => {
        controller.abort();
        return {
          archive, colmapFiles: new Map<string, File>(),
          imageIndex: new Map<string, ReturnType<typeof buildArchiveEntry>>(),
          fileSize: 1024, imageCount: 0,
        };
      }),
      log: vi.fn(),
      processFiles: vi.fn(),
      setActiveArchive: vi.fn(),
      setSourceInfo: vi.fn(),
      setUrlProgress: vi.fn(),
    };

    await expect(loadZipUrlSource('https://example.com/scene.zip', deps))
      .rejects.toMatchObject({ name: 'AbortError' });

    expect(deps.loadZip).toHaveBeenCalledWith(
      'https://example.com/scene.zip', expect.any(Function), controller.signal
    );
    expect(close).toHaveBeenCalledOnce();
    expect(deps.setActiveArchive).not.toHaveBeenCalled();
    expect(deps.setSourceInfo).not.toHaveBeenCalled();
    expect(deps.setUrlProgress).not.toHaveBeenCalled();
    expect(deps.processFiles).not.toHaveBeenCalled();
  });

  it('maps ZIP progress payloads onto URL load progress', () => {
    expect(mapZipProgressToUrlProgress({
      percent: 45,
      message: 'Downloading archive...',
      bytesLoaded: 2048,
      bytesTotal: 4096,
    })).toEqual({
      percent: 45,
      message: 'Downloading archive...',
      bytesLoaded: 2048,
      bytesTotal: 4096,
    });
  });

  it('loads a ZIP URL, activates lazy image extraction, and processes COLMAP files', async () => {
    const archive = buildArchiveReader();
    const imageIndex = new Map([['images/a.jpg', buildArchiveEntry({ name: 'a.jpg' })]]);
    const colmapFiles = new Map([
      ['sparse/0/cameras.bin', buildFile('cameras.bin')],
      ['sparse/0/images.bin', buildFile('images.bin')],
      ['sparse/0/points3D.bin', buildFile('points3D.bin')],
    ]);
    const deps = {
      loadZip: vi.fn(async (_url: string, onProgress: (progress: { percent: number; message: string; bytesLoaded?: number; bytesTotal?: number }) => void) => {
        onProgress({
          percent: 35,
          message: 'Downloading archive...',
          bytesLoaded: 512,
          bytesTotal: 1024,
        });
        return { colmapFiles, imageIndex, archive, fileSize: 1024, imageCount: 1 };
      }),
      log: vi.fn(),
      processFiles: vi.fn(async () => {}),
      setActiveArchive: vi.fn(),
      setSourceInfo: vi.fn(),
      setUrlProgress: vi.fn(),
    };

    await expect(loadZipUrlSource('https://example.com/scene.zip', deps)).resolves.toBe(true);

    expect(deps.log).toHaveBeenNthCalledWith(1, '[URL Loader] Loading ZIP from URL: https://example.com/scene.zip');
    expect(deps.loadZip).toHaveBeenCalledWith('https://example.com/scene.zip', expect.any(Function));
    expect(deps.setUrlProgress).toHaveBeenNthCalledWith(1, {
      percent: 35,
      message: 'Downloading archive...',
      bytesLoaded: 512,
      bytesTotal: 1024,
    });
    expect(deps.setActiveArchive).toHaveBeenCalledWith(archive, imageIndex, 1024, 1);
    expect(deps.setUrlProgress).toHaveBeenNthCalledWith(2, {
      percent: 80,
      message: 'Parsing reconstruction...',
    });
    expect(deps.setSourceInfo).toHaveBeenCalledWith('zip', 'https://example.com/scene.zip');
    expect(deps.processFiles).toHaveBeenCalledWith(colmapFiles, { start: 80, end: 100 }, expect.objectContaining({ throwOnError: true }));
    expect(deps.setUrlProgress).toHaveBeenLastCalledWith({ percent: 100, message: 'Complete' });
    expect(deps.log).toHaveBeenCalledWith('[URL Loader] ZIP contains 3 COLMAP files, 1 indexed images');
    expect(deps.log).toHaveBeenCalledWith('[URL Loader] Calling processFiles...');
    expect(deps.log).toHaveBeenCalledWith('[URL Loader] Successfully loaded reconstruction from ZIP');
  });

  it('leaves completion progress to the renderer when a ZIP contains a splat', async () => {
    const archive = buildArchiveReader();
    const imageIndex = new Map<string, ReturnType<typeof buildArchiveEntry>>();
    const splatFile = buildFile('scene.spz', 'splat');
    const colmapFiles = new Map([
      ['sparse/0/cameras.bin', buildFile('cameras.bin')],
      ['sparse/0/images.bin', buildFile('images.bin')],
      ['sparse/0/points3D.bin', buildFile('points3D.bin')],
      ['splats/scene.spz', splatFile],
    ]);
    const deps = {
      loadZip: vi.fn(async () => ({ colmapFiles, imageIndex, archive, fileSize: 1024, imageCount: 0 })),
      log: vi.fn(),
      processFiles: vi.fn(async () => {}),
      setActiveArchive: vi.fn(),
      setSourceInfo: vi.fn(),
      setUrlProgress: vi.fn(),
    };

    await expect(loadZipUrlSource('https://example.com/scene.zip', deps)).resolves.toBe(true);

    expect(deps.processFiles).toHaveBeenCalledWith(colmapFiles, { start: 80, end: 100 }, expect.objectContaining({ throwOnError: true }));
    expect(deps.setUrlProgress).not.toHaveBeenCalledWith({ percent: 100, message: 'Complete' });
  });

  it('propagates ZIP load failures before activating archive state', async () => {
    const error = new Error('download failed');
    const deps = {
      loadZip: vi.fn(async () => {
        throw error;
      }),
      log: vi.fn(),
      processFiles: vi.fn(),
      setActiveArchive: vi.fn(),
      setSourceInfo: vi.fn(),
      setUrlProgress: vi.fn(),
    };

    await expect(loadZipUrlSource('https://example.com/bad.zip', deps)).rejects.toBe(error);

    expect(deps.setActiveArchive).not.toHaveBeenCalled();
    expect(deps.setSourceInfo).not.toHaveBeenCalled();
    expect(deps.processFiles).not.toHaveBeenCalled();
  });

  it.each(['failure', 'cancelled'] as const)('closes the staged archive and preserves source metadata when processing is %s', async outcome => {
    const archive = buildArchiveReader();
    const close = vi.spyOn(archive, 'close');
    const deps = {
      loadZip: vi.fn(async () => ({ archive, colmapFiles: new Map(), imageIndex: new Map(), fileSize: 1, imageCount: 0 })),
      log: vi.fn(), setActiveArchive: vi.fn(), setSourceInfo: vi.fn(), setUrlProgress: vi.fn(),
      processFiles: vi.fn(async () => { if (outcome === 'failure') throw new Error('invalid COLMAP'); return false; }),
    };
    const loading = loadZipUrlSource('https://example.com/scene.zip', deps);
    if (outcome === 'failure') await expect(loading).rejects.toThrow('invalid COLMAP');
    else await expect(loading).resolves.toBe(false);
    expect(deps.setActiveArchive).not.toHaveBeenCalled();
    expect(deps.setSourceInfo).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
