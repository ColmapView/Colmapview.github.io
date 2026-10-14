import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPendingFetch, buildFile } from '../test/builders';
import type { ColmapManifest } from '../types/manifest';
import {
  loadManifestSource, OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS, SPLAT_DISCOVERY_LIMIT_MS, SPLAT_DISCOVERY_TIMEOUT_MS,
} from './urlLoaderManifestSource';
import type { RemoteSplatCandidate } from '../splat/loadingPolicy';
import { useNotificationStore } from '../store/stores/notificationStore';
import { SPLAT_LIST_TIMEOUT_MESSAGE, splatListTimeoutWarning } from './datasetTimeoutWarnings';
import { notificationsWithMessage } from '../test/notifications';

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

type ProcessOptions = { onSceneReplaced?: () => void; beforeSceneCommit?: () => Promise<void> };

function makeDeps(files = makeFiles()) {
  return {
    fetchImpl: vi.fn(async (_url: string, _init?: RequestInit): Promise<Response> => new Response('', { status: 404 })),
    fetchColmapFiles: vi.fn(async () => files),
    discoverSplatCatalog: vi.fn(async (): Promise<RemoteSplatCandidate[]> => []),
    log: vi.fn(),
    // Like processFiles: parse, settle what the scene restores, then report the scene it replaced.
    processFiles: vi.fn(async (_files: Map<string, File>, _range?: unknown, options?: ProcessOptions): Promise<void | boolean> => {
      await options?.beforeSceneCommit?.();
      options?.onSceneReplaced?.();
    }),
    setSourceInfo: vi.fn(),
    setUrlProgress: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  splatListTimeoutWarning.dismiss();
  useNotificationStore.setState(useNotificationStore.getInitialState(), true);
});

const splatListWarnings = () => notificationsWithMessage(SPLAT_LIST_TIMEOUT_MESSAGE);

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

  it('records a URL-loaded manifest\'s name for upload defaults when the scene commits', async () => {
    const deps = { ...makeDeps(), setSourceName: vi.fn() };
    await expect(loadManifestSource(manifest, { type: 'url', sourceUrl: 'https://example.com/manifest.json' }, deps)).resolves.toBe(true);
    expect(deps.setSourceName).toHaveBeenLastCalledWith('test scene');
    expect(deps.setSourceName.mock.invocationCallOrder[0]).toBeGreaterThan(deps.setSourceInfo.mock.invocationCallOrder[0]);
    const unnamed = { ...makeDeps(), setSourceName: vi.fn() };
    await loadManifestSource({ ...manifest, name: undefined }, { type: 'url', sourceUrl: 'https://example.com/manifest.json' }, unnamed);
    expect(unnamed.setSourceName).toHaveBeenLastCalledWith(null);
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

  it('parses COLMAP files while optional settings load, and shows the scene once they settle', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const deps = makeDeps();
    let respond!: (response: Response) => void;
    deps.fetchImpl.mockImplementationOnce(() => new Promise<Response>(resolve => { respond = resolve; }));
    const onViewerState = vi.fn();
    const loading = loadManifestSource(manifest, { type: 'manifest' }, { ...deps, onViewerState });

    await vi.waitFor(() => expect(deps.processFiles).toHaveBeenCalled());
    // Parsed, but the scene waits, behind the overlay, for what it restores.
    expect(deps.setSourceInfo).not.toHaveBeenCalled();
    expect(deps.setUrlProgress).toHaveBeenLastCalledWith({ percent: 90, message: 'Looking for splats and saved settings...' });
    respond(new Response('ui:\n  background_color: "#123456"\n'));

    await expect(loading).resolves.toBe(true);
    expect(deps.setSourceInfo).toHaveBeenCalledOnce();
    expect(onViewerState).toHaveBeenCalledWith(expect.objectContaining({ config: { ui: { backgroundColor: '#123456' } } }));
  });

  it('shows the scene without a splat listing that has not answered for SPLAT_DISCOVERY_TIMEOUT_MS after parsing, and stops it', async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    const listingSignals: AbortSignal[] = [];
    deps.fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('colmapview.yaml')) return new Response('', { status: 404 });
      if (init?.signal) listingSignals.push(init.signal);
      return new Promise<Response>(() => {});
    });
    const onRemoteSplatCatalog = vi.fn();
    const onAutoSplatSource = vi.fn();
    let settled = false;
    // The real discovery: it classifies and sizes the listed splat through fetchImpl.
    const loading = loadManifestSource({ ...manifest, splats: ['splats/scene.ply'] }, { type: 'manifest' },
      { ...deps, discoverSplatCatalog: undefined, onRemoteSplatCatalog, onAutoSplatSource }).finally(() => { settled = true; });

    await vi.waitFor(() => expect(deps.processFiles).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(SPLAT_DISCOVERY_TIMEOUT_MS - 1_000);
    expect(settled).toBe(false);
    expect(deps.setSourceInfo).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(loading).resolves.toBe(true);
    expect(deps.setSourceInfo).toHaveBeenCalledOnce();
    expect(onRemoteSplatCatalog).not.toHaveBeenCalled();
    expect(onAutoSplatSource).not.toHaveBeenCalled();
    expect(listingSignals.length).toBeGreaterThan(0);
    expect(listingSignals.every(signal => signal.aborted)).toBe(true);
  });

  it('keeps waiting for a splat listing that still answers, past SPLAT_DISCOVERY_TIMEOUT_MS after parsing', async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    const tiles = Array.from({ length: 40 }, (_, index) => `tile_${index}.spz`);
    const listings = new Map([['https://example.com/dataset/', ['splats/']], ['https://example.com/dataset/splats/', tiles]]);
    // A slow autoindex host: every request answers a second after it is made, and the crawl makes one at a time.
    deps.fetchImpl.mockImplementation((url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        const entries = listings.get(url);
        resolve(init?.method === 'HEAD' ? new Response(null, { headers: { 'content-length': '100' } })
          : entries ? new Response(entries.map(name => `<a href="${name}">${name}</a>`).join('\n'))
            : new Response('', { status: 404 }));
      }, 1_000);
      init?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(init.signal!.reason); }, { once: true });
    }));
    const onRemoteSplatCatalog = vi.fn();
    const onSplatListTimeout = vi.fn();
    const loading = loadManifestSource(manifest, { type: 'manifest' },
      { ...deps, discoverSplatCatalog: undefined, onRemoteSplatCatalog, onSplatListTimeout, isTouchDevice: false });

    // Two listings and 40 size checks: 42 s of answers, nearly all of them after parsing.
    await vi.advanceTimersByTimeAsync(45_000);
    await expect(loading).resolves.toBe(true);
    expect(onSplatListTimeout).not.toHaveBeenCalled();
    expect(onRemoteSplatCatalog).toHaveBeenCalledOnce();
    expect(onRemoteSplatCatalog.mock.calls[0][0]).toHaveLength(40);
  });

  it('drops a splat listing SPLAT_DISCOVERY_TIMEOUT_MS after its last answer once it stalls partway through a crawl', async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    const listings = new Map([['https://example.com/dataset/', ['a/', 'b/', 'c/', 'stalled/']],
      ['https://example.com/dataset/a/', ['tile.spz']]]);
    const pendingFetch = buildPendingFetch();
    let lastAnswerAt: number | undefined;
    // Every request answers a second after it is made, except the listing of stalled/, which never answers.
    deps.fetchImpl.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('colmapview.yaml')) return Promise.resolve(new Response('', { status: 404 }));
      const response = pendingFetch.fetch(url, init);
      const request = pendingFetch.requests.at(-1)!;
      if (url.endsWith('/stalled/')) return response;
      setTimeout(() => {
        lastAnswerAt = Date.now();
        const entries = listings.get(url);
        request.respond(init?.method === 'HEAD' ? new Response(null, { headers: { 'content-length': '100' } })
          : new Response((entries ?? []).map(name => `<a href="${name}">${name}</a>`).join('\n')));
      }, 1_000);
      return response;
    });
    const onRemoteSplatCatalog = vi.fn();
    const onSplatListTimeout = vi.fn();
    let settled = false;
    const parsedAt = Date.now();
    const loading = loadManifestSource(manifest, { type: 'manifest' },
      { ...deps, discoverSplatCatalog: undefined, onRemoteSplatCatalog, onSplatListTimeout, isTouchDevice: false })
      .finally(() => { settled = true; });

    // The root, a/, tile.spz's size, b/ and c/ answer after parsing; then stalled/ is asked for.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(deps.processFiles).toHaveBeenCalledOnce();
    expect(deps.fetchImpl).toHaveBeenCalledWith('https://example.com/dataset/stalled/', expect.anything());
    expect(lastAnswerAt).toBeGreaterThan(parsedAt + 1_000);
    const lastAnswer = lastAnswerAt!;
    await vi.advanceTimersByTimeAsync(lastAnswer + SPLAT_DISCOVERY_TIMEOUT_MS - 1_000 - Date.now());
    expect(settled).toBe(false);
    expect(onSplatListTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onSplatListTimeout).toHaveBeenCalledOnce();
    expect(Date.now() - parsedAt).toBeLessThan(SPLAT_DISCOVERY_LIMIT_MS);

    await expect(loading).resolves.toBe(true);
    expect(onSplatListTimeout).toHaveBeenCalledOnce();
    expect(onRemoteSplatCatalog).not.toHaveBeenCalled();
    expect(deps.setSourceInfo).toHaveBeenCalledOnce();
    expect(pendingFetch.requests.length).toBeGreaterThan(0);
    expect(pendingFetch.requests.every(({ signal }) => signal?.aborted)).toBe(true);
  });

  it('drops a splat listing still running SPLAT_DISCOVERY_LIMIT_MS after parsing, however steadily it answers', async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    const folders = Array.from({ length: 199 }, (_, index) => `folder_${index}/`);
    deps.fetchImpl.mockImplementation((url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(url === 'https://example.com/dataset/'
        ? new Response(folders.map(name => `<a href="${name}">${name}</a>`).join('\n'))
        : new Response('', { status: url.endsWith('colmapview.yaml') ? 404 : 200 })), 1_000);
      init?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(init.signal!.reason); }, { once: true });
    }));
    const onRemoteSplatCatalog = vi.fn();
    const onSplatListTimeout = vi.fn();
    let settled = false;
    const loading = loadManifestSource(manifest, { type: 'manifest' },
      { ...deps, discoverSplatCatalog: undefined, onRemoteSplatCatalog, onSplatListTimeout }).finally(() => { settled = true; });

    // 200 folders, one listing a second: the crawl would need 200 s.
    await vi.advanceTimersByTimeAsync(SPLAT_DISCOVERY_LIMIT_MS - 1_000);
    expect(settled).toBe(false);
    expect(onSplatListTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onSplatListTimeout).toHaveBeenCalledOnce();
    await expect(loading).resolves.toBe(true);
    expect(deps.setSourceInfo).toHaveBeenCalledOnce();
    expect(onRemoteSplatCatalog).not.toHaveBeenCalled();
  });

  it('says once that a splat listing which never answers was dropped, and commits the scene without it', async () => {
    vi.useFakeTimers();
    const deps = { ...makeDeps(), discoverSplatCatalog: vi.fn(() => new Promise<RemoteSplatCandidate[]>(() => {})) };
    const onRemoteSplatCatalog = vi.fn();
    const loading = loadManifestSource(manifest, { type: 'manifest' },
      { ...deps, onRemoteSplatCatalog, onSplatListTimeout: splatListTimeoutWarning.show });

    await vi.waitFor(() => expect(deps.processFiles).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(SPLAT_DISCOVERY_TIMEOUT_MS - 1_000);
    expect(splatListWarnings()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(loading).resolves.toBe(true);
    expect(deps.setSourceInfo).toHaveBeenCalledOnce();
    expect(onRemoteSplatCatalog).not.toHaveBeenCalled();
    expect(splatListWarnings()).toEqual([expect.objectContaining({ type: 'warning' })]);
  });

  it('leaves out a listed splat the server says is gone, so nothing offers or downloads it', async () => {
    const deps = makeDeps();
    deps.fetchImpl.mockImplementation(async () => new Response('Not Found', { status: 404 }));
    const onRemoteSplatCatalog = vi.fn();
    const onAutoSplatSource = vi.fn();
    await expect(loadManifestSource({ ...manifest, splats: ['tiles/old.spz'] }, { type: 'manifest' },
      { ...deps, discoverSplatCatalog: undefined, onRemoteSplatCatalog, onAutoSplatSource, isTouchDevice: false })).resolves.toBe(true);
    expect(onRemoteSplatCatalog).not.toHaveBeenCalled();
    expect(onAutoSplatSource).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('[URL Loader] Optional file not found: tiles/old.spz');
  });

  it('keeps a failed splat listing quiet: only a timeout warns', async () => {
    const onSplatListTimeout = vi.fn();
    const deps = { ...makeDeps(), discoverSplatCatalog: vi.fn(async (): Promise<RemoteSplatCandidate[]> => {
      throw new Error('listing failed');
    }) };
    await expect(loadManifestSource(manifest, { type: 'manifest' }, { ...deps, onSplatListTimeout })).resolves.toBe(true);
    expect(deps.setSourceInfo).toHaveBeenCalledOnce();
    expect(onSplatListTimeout).not.toHaveBeenCalled();
  });

  it('starts the splat listing deadline after parsing, not with the downloads', async () => {
    vi.useFakeTimers();
    let finishListing!: (catalog: RemoteSplatCandidate[]) => void;
    const deps = { ...makeDeps(), discoverSplatCatalog: vi.fn(() => new Promise<RemoteSplatCandidate[]>(resolve => { finishListing = resolve; })) };
    let finishDownload!: (files: Map<string, File>) => void;
    deps.fetchColmapFiles.mockImplementationOnce(() => new Promise<Map<string, File>>(resolve => { finishDownload = resolve; }));
    const onRemoteSplatCatalog = vi.fn();
    const loading = loadManifestSource(manifest, { type: 'manifest' }, { ...deps, onRemoteSplatCatalog });

    // The downloads alone outlast the deadline; the listing still gets its full time after parsing.
    await vi.advanceTimersByTimeAsync(SPLAT_DISCOVERY_TIMEOUT_MS * 2);
    finishDownload(makeFiles());
    await vi.advanceTimersByTimeAsync(SPLAT_DISCOVERY_TIMEOUT_MS - 1_000);
    finishListing([{ path: 'splats/scene.spz', size: 100 }]);

    await expect(loading).resolves.toBe(true);
    expect(onRemoteSplatCatalog).toHaveBeenCalledWith([{ path: 'splats/scene.spz', size: 100 }]);
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
    const onOptionalSettingsTimeout = vi.fn();
    const loading = loadManifestSource(manifest, { type: 'manifest' }, { ...deps, onViewerState, onAutoSplatSource, onOptionalSettingsTimeout });
    await vi.waitFor(() => expect(deps.processFiles).toHaveBeenCalledOnce());
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS);
    await expect(loading).resolves.toBe(true);
    expect(onOptionalSettingsTimeout).toHaveBeenCalledOnce();
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

  it('leaves source metadata alone when processing keeps the open scene', async () => {
    // A splat merged into the open scene: processing succeeds without reporting a replacement.
    const deps = { ...makeDeps(), processFiles: vi.fn(async () => true) };
    await expect(loadManifestSource(manifest, { type: 'manifest' }, deps)).resolves.toBe(true);
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

  it('waits for optional settings that arrive while slow COLMAP files download', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Blob', NodeBlob);
    const deps = makeDeps();
    let respond!: (response: Response) => void;
    deps.fetchImpl.mockImplementationOnce(() => new Promise<Response>(resolve => { respond = resolve; }));
    let finishDownload!: (files: Map<string, File>) => void;
    deps.fetchColmapFiles.mockImplementationOnce(() => new Promise<Map<string, File>>(resolve => { finishDownload = resolve; }));
    const onViewerState = vi.fn();
    const onOptionalSettingsTimeout = vi.fn();
    const loading = loadManifestSource(manifest, { type: 'manifest' }, { ...deps, onViewerState, onOptionalSettingsTimeout });
    await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS * 2);
    vi.useRealTimers();
    respond(new Response('ui:\n  background_color: "#123456"\n'));
    finishDownload(makeFiles());
    await expect(loading).resolves.toBe(true);
    expect(onViewerState).toHaveBeenCalledWith(expect.objectContaining({ config: { ui: { backgroundColor: '#123456' } } }));
    expect(onOptionalSettingsTimeout).not.toHaveBeenCalled();
  });
});
