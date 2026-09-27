import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReconstructionStore } from '../store';
import type { LoadedFiles } from '../types/colmap';
import { useUrlLoader } from './useUrlLoader';

const { clearAllCachesMock, processFilesMock } = vi.hoisted(() => ({
  clearAllCachesMock: vi.fn(),
  processFilesMock: vi.fn<(
    files: Map<string, File>,
    progressRange?: { start: number; end: number },
    options?: { replaceSplatScene?: boolean; throwOnError?: boolean }
  ) => Promise<void>>(),
}));

vi.mock('../cache', () => ({
  clearAllCaches: clearAllCachesMock,
}));

vi.mock('./useFileDropzone', () => ({
  useFileDropzone: () => ({
    processFiles: processFilesMock,
  }),
}));

function createSplatLoadedFiles(splatFile: File): LoadedFiles {
  return {
    camerasFile: undefined,
    imagesFile: undefined,
    points3DFile: undefined,
    splatFile,
    splatFiles: [splatFile],
    splatFileSources: [{ id: splatFile.name, path: splatFile.name, file: splatFile }],
    rigsFile: undefined,
    framesFile: undefined,
    imageFiles: new Map(),
    hasMasks: false,
  };
}

describe('useUrlLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  });

  afterEach(() => {
    cleanup();
    useReconstructionStore.getState().clear();
    vi.unstubAllGlobals();
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  });

  it.each(['complete', 'fail'] as const)('ignores a cleared download that later %ss while a new load is active', async (outcome) => {
    const requests: Array<{
      resolve: (response: Response) => void;
      reject: (reason: unknown) => void;
      signal: AbortSignal;
    }> = [];
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise<Response>((resolve, reject) => {
      requests.push({ resolve, reject, signal: init.signal });
    })));
    const logger = { error: vi.fn(), info: vi.fn() };
    const { result } = renderHook(() => useUrlLoader({ logger }));
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => { first = result.current.loadFromUrl('https://example.com/old.spz'); });
    act(() => { useReconstructionStore.getState().clear(); });
    expect(requests[0].signal.aborted).toBe(true);
    act(() => { second = result.current.loadFromUrl('https://example.com/new.spz'); });
    const currentSignal = useReconstructionStore.getState().urlLoadController?.signal;
    const cacheClears = clearAllCachesMock.mock.calls.length;

    await act(async () => {
      if (outcome === 'complete') requests[0].resolve(new Response('old splat'));
      else requests[0].reject(new Error('late network failure'));
      expect(await first).toBe(false);
    });
    expect(processFilesMock).not.toHaveBeenCalled();
    expect(clearAllCachesMock).toHaveBeenCalledTimes(cacheClears);
    expect(logger.error).not.toHaveBeenCalled();
    expect(useReconstructionStore.getState()).toMatchObject({
      sourceUrl: null, urlLoading: true, urlLoadActive: true, urlError: null,
    });
    expect(useReconstructionStore.getState().urlLoadController?.signal).toBe(currentSignal);

    processFilesMock.mockResolvedValueOnce();
    await act(async () => {
      requests[1].resolve(new Response('new splat'));
      expect(await second).toBe(true);
    });
    expect(processFilesMock).toHaveBeenCalledOnce();
    expect(useReconstructionStore.getState().sourceUrl).toBe('https://example.com/new.spz');
  });

  it.each(['url', 'inline'] as const)('aborts a %s manifest load before it can restore a cleared scene', async (source) => {
    const pending: Array<{ signal: AbortSignal; resolve: (response: Response) => void }> = [];
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise<Response>((resolve) => {
      pending.push({ signal: init.signal, resolve });
    })));
    const manifest = {
      version: 1, baseUrl: 'https://example.com/scene',
      files: { cameras: 'cameras.bin', images: 'images.bin', points3D: 'points3D.bin' },
    };
    const logger = { error: vi.fn(), info: vi.fn() };
    const { result } = renderHook(() => useUrlLoader({ logger }));
    let running!: Promise<boolean>;
    act(() => {
      running = source === 'url'
        ? result.current.loadFromUrl('https://example.com/scene/manifest.json')
        : result.current.loadFromManifest(manifest);
    });
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));

    act(() => { useReconstructionStore.getState().clear(); });
    pending.forEach(({ signal }) => expect(signal.aborted).toBe(true));
    await act(async () => {
      pending.forEach(({ resolve }) => resolve(new Response(JSON.stringify(manifest))));
      expect(await running).toBe(false);
    });

    expect(processFilesMock).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(useReconstructionStore.getState()).toMatchObject({
      sourceUrl: null, sourceManifest: null, urlProgress: null,
      urlLoading: false, urlLoadActive: false, urlError: null,
    });
  });

  it('keeps URL loading active after a direct splat URL hands off to the renderer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      blob: vi.fn(async () => new Blob(['splat'], { type: 'application/octet-stream' })),
    })));
    processFilesMock.mockImplementation(async (files) => {
      const splatFile = files.get('scene.spz');
      expect(splatFile).toBeDefined();
      useReconstructionStore.setState({
        loadedFiles: createSplatLoadedFiles(splatFile as File),
        urlLoading: true,
        urlProgress: {
          percent: 92,
          message: 'Preparing splat renderer...',
          currentFile: 'scene.spz',
        },
      });
    });
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    };
    const { result } = renderHook(() => useUrlLoader({ logger }));

    let loaded = false;
    await act(async () => {
      loaded = await result.current.loadFromUrl('https://example.com/scene.spz');
    });

    expect(loaded).toBe(true);
    expect(processFilesMock).toHaveBeenCalledWith(
      expect.any(Map),
      { start: 80, end: 100 },
      {
        replaceSplatScene: true,
        throwOnError: true,
      }
    );
    expect(processFilesMock.mock.calls[0][0].get('scene.spz')).toBeInstanceOf(File);
    expect(clearAllCachesMock).toHaveBeenCalledTimes(1);
    expect(useReconstructionStore.getState()).toMatchObject({
      urlLoadActive: false,
      urlLoading: true,
      urlProgress: {
        percent: 92,
        message: 'Preparing splat renderer...',
        currentFile: 'scene.spz',
      },
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('preserves existing caches when a direct splat URL fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      blob: vi.fn(),
    })));
    const previousSplatFile = new File(['previous'], 'previous.spz');
    useReconstructionStore.setState({
      loadedFiles: createSplatLoadedFiles(previousSplatFile),
    });
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    };
    const { result } = renderHook(() => useUrlLoader({ logger }));

    let loaded = true;
    await act(async () => {
      loaded = await result.current.loadFromUrl('https://example.com/missing.spz');
    });

    expect(loaded).toBe(false);
    expect(processFilesMock).not.toHaveBeenCalled();
    expect(clearAllCachesMock).not.toHaveBeenCalled();
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(previousSplatFile);
    expect(useReconstructionStore.getState().urlLoading).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      '[URL Loader] Error:',
      expect.objectContaining({ message: 'Failed to fetch splat (404)' })
    );
  });

  it('surfaces a skipped oversized lone splat as a lazy source and opens the picker', async () => {
    const baseUrl = 'https://huggingface.co/datasets/Acme/Scene/resolve/main';
    const treeEntries = [
      { type: 'file', path: 'sparse/0/cameras.bin', size: 48 },
      { type: 'file', path: 'sparse/0/images.bin', size: 1_000 },
      { type: 'file', path: 'sparse/0/points3D.bin', size: 1_000 },
      { type: 'file', path: 'splats/huge.spz', size: 1_040_000_634 },
    ];
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).startsWith('https://huggingface.co/api/datasets/Acme/Scene/tree/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { get: () => null },
          json: async () => treeEntries,
        };
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null },
        blob: async () => new Blob(['bin'], { type: 'application/octet-stream' }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    processFilesMock.mockImplementation(async () => {
      // Real processFiles stores the parsed COLMAP files (no splat was downloaded).
      useReconstructionStore.setState({
        loadedFiles: {
          camerasFile: new File([''], 'cameras.bin'),
          imagesFile: new File([''], 'images.bin'),
          points3DFile: new File([''], 'points3D.bin'),
          imageFiles: new Map(),
          hasMasks: false,
        },
      });
    });
    const logger = { error: vi.fn(), info: vi.fn() };
    const { result } = renderHook(() => useUrlLoader({ logger }));

    let loaded = false;
    await act(async () => {
      loaded = await result.current.loadFromUrl(baseUrl);
    });

    expect(loaded).toBe(true);
    // The oversized splat body is never fetched...
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContainEqual(
      expect.stringContaining('huge.spz')
    );
    // ...but the user can still opt in: it is listed as a lazy source and the picker opens.
    const state = useReconstructionStore.getState();
    const sources = state.loadedFiles?.splatFileSources ?? [];
    expect(sources.map((source) => source.path)).toEqual(['splats/huge.spz']);
    expect(sources[0]?.url).toBe(`${baseUrl}/splats/huge.spz`);
    expect(sources[0]?.file).toBeUndefined();
    expect(state.showSplatPicker).toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
