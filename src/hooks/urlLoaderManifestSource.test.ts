import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFile } from '../test/builders';
import type { ColmapManifest } from '../types/manifest';
import { loadManifestSource, OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS } from './urlLoaderManifestSource';

const manifest: ColmapManifest = {
  version: 1,
  name: 'test scene',
  baseUrl: 'https://example.com/dataset',
  files: {
    cameras: 'custom/cameras.bin',
    images: 'custom/images.bin',
    points3D: 'custom/points3D.bin',
  },
  imagesPath: 'rgb/',
  masksPath: 'segmentation/',
};

function makeFiles(): Map<string, File> {
  return new Map([
    ['sparse/0/cameras.bin', buildFile('cameras.bin')],
    ['sparse/0/images.bin', buildFile('images.bin')],
    ['sparse/0/points3D.bin', buildFile('points3D.bin')],
  ]);
}

function makeDeps(files = makeFiles()) {
  return {
    fetchImpl: vi.fn(async (_url: string, _init?: RequestInit) => new Response('', { status: 404 })),
    fetchColmapFiles: vi.fn(async () => files),
    discoverSplatCatalog: vi.fn(async () => []),
    log: vi.fn(),
    processFiles: vi.fn(async () => {}),
    setSourceInfo: vi.fn(),
    setUrlProgress: vi.fn(),
  };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('URL loader manifest source helpers', () => {
  it('loads a URL manifest source with lazy image/mask bases and processing progress', async () => {
    const files = makeFiles();
    const deps = makeDeps(files);

    await expect(loadManifestSource(manifest, {
      type: 'url',
      sourceUrl: 'https://example.com/manifest.json',
    }, deps)).resolves.toBe(true);

    expect(deps.fetchColmapFiles).toHaveBeenCalledWith(manifest);
    expect(deps.log).toHaveBeenCalledWith('[URL Loader] Downloaded 3 COLMAP files:', [
      'sparse/0/cameras.bin',
      'sparse/0/images.bin',
      'sparse/0/points3D.bin',
    ]);
    expect(deps.log).toHaveBeenCalledWith('[URL Loader] Skipping image download (images will be loaded lazily)');
    expect(deps.setUrlProgress).toHaveBeenNthCalledWith(1, {
      percent: 80,
      message: 'Parsing reconstruction...',
    });
    expect(deps.setSourceInfo).toHaveBeenCalledWith(
      'url',
      'https://example.com/manifest.json',
      'https://example.com/dataset/rgb/',
      'https://example.com/dataset/segmentation/',
      null,
      null
    );
    expect(deps.log).toHaveBeenCalledWith('[URL Loader] Image URL base for lazy loading: https://example.com/dataset/rgb/');
    expect(deps.log).toHaveBeenCalledWith('[URL Loader] Mask URL base for lazy loading: https://example.com/dataset/segmentation/');
    expect(deps.log).toHaveBeenCalledWith('[URL Loader] Calling processFiles...');
    expect(deps.processFiles).toHaveBeenCalledWith(files, { start: 80, end: 100 }, expect.objectContaining({ throwOnError: true }));
    expect(deps.setUrlProgress).toHaveBeenLastCalledWith({ percent: 100, message: 'Complete' });
    expect(deps.log).toHaveBeenCalledWith('[URL Loader] Successfully loaded 3 files from URL');
  });

  it('loads an inline manifest source and stores the manifest for embedding', async () => {
    const deps = makeDeps();

    await expect(loadManifestSource(manifest, { type: 'manifest' }, deps)).resolves.toBe(true);

    expect(deps.setSourceInfo).toHaveBeenCalledWith(
      'manifest',
      null,
      'https://example.com/dataset/rgb/',
      'https://example.com/dataset/segmentation/',
      manifest,
      null
    );
    expect(deps.log).toHaveBeenCalledWith('[URL Loader] Successfully loaded 3 files from manifest');
  });

  it('leaves completion progress to the renderer when a manifest contains a splat', async () => {
    const files = new Map([
      ...makeFiles(),
      ['splats/scene.spz', buildFile('scene.spz', 'splat')],
    ]);
    const deps = makeDeps(files);

    await expect(loadManifestSource(manifest, { type: 'manifest' }, deps)).resolves.toBe(true);

    expect(deps.processFiles).toHaveBeenCalledWith(files, { start: 80, end: 100 }, expect.objectContaining({ throwOnError: true }));
    expect(deps.setUrlProgress).not.toHaveBeenCalledWith({ percent: 100, message: 'Complete' });
  });

  it('parses and displays COLMAP files while optional viewer settings are still loading', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const deps = makeDeps();
    let respond!: (response: Response) => void;
    deps.fetchImpl.mockImplementationOnce(() => new Promise<Response>(resolve => { respond = resolve; }));
    const onViewerState = vi.fn();
    const loading = loadManifestSource(manifest, { type: 'manifest' }, { ...deps, onViewerState });

    await vi.waitFor(() => expect(deps.processFiles).toHaveBeenCalled());
    expect(deps.setSourceInfo).toHaveBeenCalled();
    respond(new Response('ui:\n  background_color: "#123456"\n'));

    await expect(loading).resolves.toBe(true);
    expect(onViewerState).toHaveBeenCalledWith(expect.objectContaining({ config: { ui: { backgroundColor: '#123456' } } }));
  });

  it('bounds optional settings independently, aborts its request and ignores a late response', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Blob', NodeBlob);
    const deps = { ...makeDeps(), discoverSplatCatalog: vi.fn(async () => [{ path: 'scene.spz', size: 100 }]) };
    let respond!: (response: Response) => void;
    let requestSignal: AbortSignal | null | undefined;
    deps.fetchImpl.mockImplementationOnce((_url, init?: RequestInit) => {
      requestSignal = init?.signal;
      return new Promise<Response>(resolve => { respond = resolve; });
    });
    const onViewerState = vi.fn();
    const onAutoSplatSource = vi.fn();
    const loading = loadManifestSource(manifest, { type: 'manifest' }, { ...deps, onViewerState, onAutoSplatSource });
    await vi.waitFor(() => expect(deps.processFiles).toHaveBeenCalledOnce());
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS);
    await expect(loading).resolves.toBe(true);
    expect(requestSignal?.aborted).toBe(true);
    respond(new Response('ui:\n  background_color: "#123456"\n'));
    await Promise.resolve();
    expect(onViewerState).not.toHaveBeenCalled();
    expect(onAutoSplatSource).not.toHaveBeenCalled();
  });

  it('keeps explicitly referenced settings required before committing a scene', async () => {
    const deps = makeDeps();
    deps.fetchImpl.mockResolvedValueOnce(new Response('invalid'));
    await expect(loadManifestSource({ ...manifest, viewerStatePath: 'state.json' }, { type: 'manifest' }, deps))
      .rejects.toThrow('invalid');
    expect(deps.processFiles).not.toHaveBeenCalled();
    expect(deps.setSourceInfo).not.toHaveBeenCalled();
  });

  it('does not commit metadata when processing reports cancellation', async () => {
    const deps = { ...makeDeps(), processFiles: vi.fn(async () => false) };
    await expect(loadManifestSource(manifest, { type: 'manifest' }, deps)).resolves.toBe(false);
    expect(deps.setSourceInfo).not.toHaveBeenCalled();
  });

  it('propagates COLMAP fetch failures before mutating source state', async () => {
    const error = new Error('missing cameras');
    const deps = makeDeps();
    deps.fetchColmapFiles.mockRejectedValueOnce(error);

    await expect(loadManifestSource(manifest, { type: 'url' }, deps)).rejects.toBe(error);

    expect(deps.setSourceInfo).not.toHaveBeenCalled();
    expect(deps.processFiles).not.toHaveBeenCalled();
    expect(deps.setUrlProgress).not.toHaveBeenCalled();
  });

  it('propagates processing failures without replacing source metadata', async () => {
    const error = new Error('parse failed');
    const deps = makeDeps();
    deps.processFiles.mockRejectedValueOnce(error);

    await expect(loadManifestSource(manifest, { type: 'manifest' }, deps)).rejects.toBe(error);

    expect(deps.setSourceInfo).not.toHaveBeenCalled();
    expect(deps.setUrlProgress).toHaveBeenCalledWith({
      percent: 80,
      message: 'Parsing reconstruction...',
    });
    expect(deps.setUrlProgress).not.toHaveBeenCalledWith({ percent: 100, message: 'Complete' });
  });
});
