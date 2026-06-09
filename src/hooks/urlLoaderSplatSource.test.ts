import { describe, expect, it, vi } from 'vitest';
import { buildFile } from '../test/builders';
import {
  fetchSplatUrlFile,
  isSplatUrl,
  loadSplatUrlSource,
} from './urlLoaderSplatSource';

describe('URL loader splat source helpers', () => {
  it('detects direct splat URLs by path extension', () => {
    expect(isSplatUrl('https://example.com/model.spz#viewer')).toBe(true);
    expect(isSplatUrl('https://example.com/model.ply')).toBe(true);
    expect(isSplatUrl('https://example.com/model.zip')).toBe(false);
    expect(isSplatUrl('model.txt')).toBe(false);
    expect(isSplatUrl('model.spz')).toBe(true);
  });

  it('fetches a direct splat URL as a named File', async () => {
    const response = new Response(new Blob(['splat'], { type: 'application/octet-stream' }), {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    const fetchImpl = vi.fn(async () => response);

    const file = await fetchSplatUrlFile('https://example.com/assets/scene.spz', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/assets/scene.spz');
    expect(file.name).toBe('scene.spz');
    expect(file.type).toBe('application/octet-stream');
  });

  it('loads a direct splat URL through the file processing workflow', async () => {
    const splatFile = buildFile('scene.spz', 'splat');
    const deps = {
      fetchSplatFile: vi.fn(async () => splatFile),
      log: vi.fn(),
      processFiles: vi.fn(async () => {}),
      setSourceInfo: vi.fn(),
      setUrlProgress: vi.fn(),
    };

    await expect(loadSplatUrlSource('https://example.com/scene.spz', deps)).resolves.toBe(true);

    expect(deps.log).toHaveBeenNthCalledWith(1, '[URL Loader] Loading splat from URL: https://example.com/scene.spz');
    expect(deps.fetchSplatFile).toHaveBeenCalledWith('https://example.com/scene.spz');
    expect(deps.setUrlProgress).toHaveBeenNthCalledWith(1, {
      percent: 5,
      message: 'Downloading splat file...',
    });
    expect(deps.setUrlProgress).toHaveBeenNthCalledWith(2, {
      percent: 80,
      message: 'Parsing splat scene...',
      currentFile: 'scene.spz',
    });
    expect(deps.setSourceInfo).toHaveBeenCalledWith('url', 'https://example.com/scene.spz', null, null);
    expect(deps.processFiles).toHaveBeenCalledWith(
      new Map([['scene.spz', splatFile]]),
      { start: 80, end: 100 },
      { throwOnError: true }
    );
    expect(deps.setUrlProgress).not.toHaveBeenCalledWith({ percent: 100, message: 'Complete' });
    expect(deps.log).toHaveBeenCalledWith('[URL Loader] Successfully loaded splat from URL: scene.spz');
  });

  it('propagates direct splat fetch failures before processing files', async () => {
    const error = { type: 'not_found' as const, message: 'Missing', failedFile: 'scene.spz' };
    const deps = {
      fetchSplatFile: vi.fn(async () => {
        throw error;
      }),
      log: vi.fn(),
      processFiles: vi.fn(),
      setSourceInfo: vi.fn(),
      setUrlProgress: vi.fn(),
    };

    await expect(loadSplatUrlSource('https://example.com/scene.spz', deps)).rejects.toBe(error);

    expect(deps.setSourceInfo).not.toHaveBeenCalled();
    expect(deps.processFiles).not.toHaveBeenCalled();
  });
});
