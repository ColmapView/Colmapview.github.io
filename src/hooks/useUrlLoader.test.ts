import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCameraStore, useReconstructionStore, useTransformStore, useUIStore, usePointCloudStore } from '../store';
import type { LoadedFiles } from '../types/colmap';
import { useUrlLoader } from './useUrlLoader';
import { encodeCameraState } from '../utils/urlCameraStateCodec';
import { encodeShareData } from '../utils/shareDataCodec';
import { createIdentityEuler } from '../utils/sim3dTransforms';
import type { CameraViewState } from '../store/types';
import type { ColmapManifest } from '../types/manifest';
import { serializeDatasetViewerSettings } from '../utils/datasetViewerSettings';
import { buildLoadedFiles, buildReconstruction } from '../test/builders';
import { createDefaultManifest } from './urlLoaderPolicy';
import { getActiveSplatSourceId, getShareActiveSplatSourceId } from '../utils/splatFileSourcePolicy';
import { hfAuth, type HfAuthState } from '../features/huggingface/auth';
import * as archiveSource from './urlLoaderZipSource';
import { processFileDropzoneFiles } from './fileDropzoneWorkflow';
import { noopLogger } from '../utils/logger';
import { OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS } from './urlLoaderViewerState';

const { clearAllCachesMock, processFilesMock, detectTouchDeviceMock } = vi.hoisted(() => ({
  clearAllCachesMock: vi.fn(),
  detectTouchDeviceMock: vi.fn(() => false),
  processFilesMock: vi.fn<(
    files: Map<string, File>,
    progressRange?: { start: number; end: number },
    options?: { replaceSplatScene?: boolean; throwOnError?: boolean; onSceneReplaced?: () => void;
      signal?: AbortSignal; initialSplatSelectionRevision?: number }
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

vi.mock('./useIsTouchDevice', async importOriginal => ({
  ...await importOriginal<typeof import('./useIsTouchDevice')>(),
  detectTouchDevice: detectTouchDeviceMock,
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
    detectTouchDeviceMock.mockReturnValue(false);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
  });

  afterEach(() => {
    cleanup();
    useReconstructionStore.getState().clear();
    vi.unstubAllGlobals();
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    window.history.replaceState(null, '', '/');
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([401, 403, 404])('preserves the existing dataset when private Hugging Face access returns %s', async status => {
    const loadedFiles = buildLoadedFiles();
    useReconstructionStore.setState({ loadedFiles });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status })));
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    await act(async () => { expect(await result.current.loadFromUrl('https://huggingface.co/datasets/owner/private')).toBe(false); });
    expect(useReconstructionStore.getState().loadedFiles).toBe(loadedFiles);
    expect(clearAllCachesMock).not.toHaveBeenCalled();
    expect(processFilesMock).not.toHaveBeenCalled();
    expect(useReconstructionStore.getState().urlError?.message).toContain('Sign in with Hugging Face');
  });

  it.each(['directory', 'manifest'] as const)('loads a private Hugging Face %s with the current account and clean source URLs', async mode => {
    vi.stubGlobal('Blob', NodeBlob);
    const repo = 'https://huggingface.co/datasets/owner/private';
    const base = repo + '/resolve/main/';
    const connection: HfAuthState = { status: 'connected', identity: { username: 'owner' }, error: null };
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue(connection);
    vi.spyOn(hfAuth, 'getReadAccessToken').mockReturnValue('private-loader-token');
    const request = vi.fn(async (url: string, init?: RequestInit) => {
      if (new Headers(init?.headers).get('Authorization') !== 'Bearer private-loader-token') return new Response(null, { status: 401 });
      if (url === 'https://huggingface.co/api/datasets/owner/private?expand=private') return Response.json({ id: 'owner/private', private: true });
      if (url.includes('/tree/')) return Response.json(['cameras', 'images', 'points3D'].map(name => ({ type: 'file', path: `sparse/0/${name}.bin` })));
      if (url.endsWith('colmapview.json')) return Response.json(createDefaultManifest(base));
      if (/(cameras|images|points3D)\.bin$/.test(url)) return new Response(new Uint8Array([1, 2, 3]));
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', request);
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    await act(async () => { expect(await result.current.loadFromUrl(mode === 'manifest' ? base + 'colmapview.json' : repo)).toBe(true); });
    expect(processFilesMock).toHaveBeenCalledOnce();
    const files = processFilesMock.mock.calls[0][0];
    expect([...files.keys()]).toEqual(['sparse/0/cameras.bin', 'sparse/0/images.bin', 'sparse/0/points3D.bin']);
    expect(request.mock.calls.slice(1).every(([, init]) => new Headers(init?.headers).get('Authorization') === 'Bearer private-loader-token')).toBe(true);
    const source = useReconstructionStore.getState();
    expect(source.sourceUrl).toBe(mode === 'manifest' ? base + 'colmapview.json' : base);
    expect(source.imageUrlBase).toBe(base + 'images/');
    expect(JSON.stringify([source.sourceUrl, source.sourceManifest, source.imageUrlBase])).not.toContain('private-loader-token');
  });

  it('cancels a private repository check without clearing or replacing the current scene', async () => {
    const loadedFiles = buildLoadedFiles();
    useReconstructionStore.setState({ loadedFiles });
    const request = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    }));
    vi.stubGlobal('fetch', request);
    const { result } = renderHook(() => useUrlLoader());
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromUrl('https://huggingface.co/datasets/owner/private'); });
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    act(() => {
      const state = useReconstructionStore.getState();
      state.finishUrlLoad(state.urlLoadController!.signal);
    });
    await act(async () => { expect(await pending).toBe(false); });
    expect(clearAllCachesMock).not.toHaveBeenCalled();
    expect(processFilesMock).not.toHaveBeenCalled();
    expect(useReconstructionStore.getState().loadedFiles).toBe(loadedFiles);
  });

  it.each(['url', 'inline'] as const)('reports discovery after public HF access succeeds for %s loading', async mode => {
    const repo = 'https://huggingface.co/datasets/owner/public';
    const base = `${repo}/resolve/main/`;
    let allowAccess!: (response: Response) => void;
    const request = vi.fn((url: string, init?: RequestInit): Promise<Response> => {
      if (url === 'https://huggingface.co/api/datasets/owner/public?expand=private') {
        return new Promise(resolve => { allowAccess = resolve; });
      }
      if (url.includes('/tree/')) {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        });
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', request);
    const messages: string[] = [];
    const unsubscribe = useReconstructionStore.subscribe(state => {
      if (state.urlProgress) messages.push(state.urlProgress.message);
    });
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    try {
      let pending!: Promise<boolean>;
      act(() => {
        pending = mode === 'inline' ? result.current.loadFromManifest(createDefaultManifest(base))
          : result.current.loadFromUrl(repo);
      });
      await waitFor(() => expect(request).toHaveBeenCalledOnce());
      expect(useReconstructionStore.getState().urlProgress?.message).toBe('Checking Hugging Face dataset access...');
      await act(async () => { allowAccess(Response.json({ id: 'owner/public', private: false })); });
      await waitFor(() => expect(request.mock.calls.some(([url]) => url.includes('/tree/'))).toBe(true));
      expect(messages).toContain(mode === 'inline' ? 'Loading dataset files...' : 'Discovering dataset files...');
      expect(useReconstructionStore.getState().urlProgress?.message).toBe(mode === 'inline'
        ? 'Downloading COLMAP files...' : 'Discovering dataset files...');
      expect(processFilesMock).not.toHaveBeenCalled();
      act(() => useReconstructionStore.getState().clear());
      await act(async () => { expect(await pending).toBe(false); });
      expect(useReconstructionStore.getState().urlProgress).toBeNull();
    } finally { unsubscribe(); }
  });

  it.each([
    { filename: 'scene.tar', message: 'Loading archive...' },
    { filename: 'scene.spz', message: 'Loading 3D file...' },
    { filename: 'colmapview.json', message: 'Fetching manifest...' },
  ])('leaves the access-check status before downloading a public HF $filename', async ({ filename, message }) => {
    const request = vi.fn((url: string, init?: RequestInit): Promise<Response> => {
      if (url === 'https://huggingface.co/api/datasets/owner/public?expand=private') {
        return Promise.resolve(Response.json({ id: 'owner/public', private: false }));
      }
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      });
    });
    vi.stubGlobal('fetch', request);
    const messages: string[] = [];
    const unsubscribe = useReconstructionStore.subscribe(state => {
      if (state.urlProgress) messages.push(state.urlProgress.message);
    });
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    try {
      let pending!: Promise<boolean>;
      act(() => { pending = result.current.loadFromUrl(`https://huggingface.co/datasets/owner/public/resolve/main/${filename}`); });
      await waitFor(() => expect(request.mock.calls.some(([url]) => url.includes('/resolve/main/'))).toBe(true));
      expect(messages).toContain(message);
      expect(useReconstructionStore.getState().urlProgress?.message).not.toBe('Checking Hugging Face dataset access...');
      act(() => useReconstructionStore.getState().clear());
      await act(async () => { expect(await pending).toBe(false); });
    } finally { unsubscribe(); }
  });

  it.each([false, true])('rejects Drive links on a disabled host without network or scene changes (startup=%s)', async startup => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_ENABLED', 'false');
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-key');
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const loadedFiles = buildLoadedFiles();
    const reconstruction = buildReconstruction();
    useReconstructionStore.setState({ loadedFiles, reconstruction });
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger, applyUrlOverrides: startup }));

    await act(async () => {
      expect(await result.current.loadFromUrl('https://drive.google.com/file/d/archive123/view')).toBe(false);
    });

    expect(request).not.toHaveBeenCalled();
    expect(processFilesMock).not.toHaveBeenCalled();
    expect(clearAllCachesMock).not.toHaveBeenCalled();
    expect(useReconstructionStore.getState().loadedFiles).toBe(loadedFiles);
    expect(useReconstructionStore.getState().reconstruction).toBe(reconstruction);
    expect(useReconstructionStore.getState().urlError?.message).toContain('https://colmapview.opsiclear.com');
    expect(useReconstructionStore.getState().urlLoading).toBe(false);
  });

  it.each(['private', 'folder'] as const)('preserves the existing dataset when a %s Drive link cannot load', async kind => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-key');
    const request = vi.fn(async () => Response.json({ error: { errors: [{ reason: 'notFound' }] } }, { status: 404 }));
    vi.stubGlobal('fetch', request);
    const loadedFiles = buildLoadedFiles();
    useReconstructionStore.setState({ loadedFiles });
    const logger = { info: vi.fn(), error: vi.fn() };
    const { result } = renderHook(() => useUrlLoader({ logger }));

    await act(async () => {
      expect(await result.current.loadFromUrl(kind === 'private'
        ? 'https://drive.google.com/file/d/private123/view' : 'https://drive.google.com/drive/folders/folder123')).toBe(false);
    });

    expect(request).toHaveBeenCalledTimes(kind === 'private' ? 1 : 0);
    expect(processFilesMock).not.toHaveBeenCalled();
    expect(clearAllCachesMock).not.toHaveBeenCalled();
    expect(useReconstructionStore.getState().loadedFiles).toBe(loadedFiles);
    expect(useReconstructionStore.getState().urlError?.message).toContain(kind === 'private' ? 'Google Drive icon' : 'folder link');
    expect(useReconstructionStore.getState().urlLoading).toBe(false);
  });

  it('ignores Drive metadata that arrives after cancellation', async () => {
    vi.stubEnv('VITE_GOOGLE_DRIVE_API_KEY', 'test-key');
    let respond!: (response: Response) => void;
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, init) => {
      requestSignal = init.signal;
      return new Promise<Response>(resolve => { respond = resolve; });
    }));
    const logger = { info: vi.fn(), error: vi.fn() };
    const { result } = renderHook(() => useUrlLoader({ logger }));
    let loading!: Promise<boolean>;
    act(() => { loading = result.current.loadFromUrl('https://drive.google.com/file/d/cancel123/view'); });
    await waitFor(() => expect(requestSignal).toBeDefined());
    act(() => useReconstructionStore.getState().clear());
    expect(requestSignal?.aborted).toBe(true);
    await act(async () => {
      respond(Response.json({ id: 'cancel123', name: 'scene.tar', size: '1024' }));
      expect(await loading).toBe(false);
    });
    expect(processFilesMock).not.toHaveBeenCalled();
    expect(clearAllCachesMock).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: false, urlError: null, sourceUrl: null });
  });

  it.each(['url', 'inline', 'override', 'large-desktop', 'large-touch'] as const)('restores the saved remote splat with %s loading', async mode => {
    vi.stubGlobal('Blob', NodeBlob);
    detectTouchDeviceMock.mockReturnValue(mode === 'large-touch');
    const baseUrl = 'https://huggingface.co/datasets/owner/scene/resolve/main/';
    const alignment = { ...createIdentityEuler(), translationX: 7, rotationZ: 1 };
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null,
      config: { transform: createIdentityEuler(), splat: { activeSourceId: 'splats/active.spz', transform: alignment },
        ui: { backgroundColor: '#123456' }, pointCloud: { pointSize: 2 } } });
    if (mode === 'override') window.history.replaceState(null, '', '/#' + encodeShareData(baseUrl, null,
      { splat: { activeSourceId: 'splats/other.spz' } }));
    const request = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith('colmapview.yaml')) return new Response(yaml);
      if (String(url).includes('/api/datasets/')) return Response.json([
        ...['cameras', 'images', 'points3D'].map(name => ({ type: 'file', path: `sparse/0/${name}.bin`, size: 10 })),
        { type: 'file', path: 'splats/active.spz', size: mode.startsWith('large-') ? 2_000_000_000 : 100 },
        { type: 'file', path: 'splats/other.spz', size: 200 },
      ]);
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal('fetch', request);
    processFilesMock.mockImplementationOnce(async () => { useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles()); });
    const { result } = renderHook(() => useUrlLoader({ applyUrlOverrides: mode === 'override' }));
    await act(async () => {
      const loaded = mode === 'inline' ? await result.current.loadFromManifest(createDefaultManifest(baseUrl))
        : await result.current.loadFromUrl(baseUrl);
      expect(loaded).toBe(true);
    });
    const expected = mode === 'override' ? 'splats/other.spz' : 'splats/active.spz';
    expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(2);
    expect(useTransformStore.getState().splatTransform).toEqual(alignment);
    expect(useUIStore.getState().backgroundColor).toBe('#123456');
    expect(usePointCloudStore.getState().pointSize).toBe(2);
    const splatRequests = request.mock.calls.map(([url]) => String(url)).filter(url => url.endsWith('.spz'));
    expect(splatRequests).toEqual(mode === 'large-touch' ? [] : [baseUrl + expected]);
    if (mode === 'large-touch') {
      expect(useReconstructionStore.getState().requestedSplatSourceId).toBe(expected);
      expect(useReconstructionStore.getState().showSplatPicker).toBe(true);
      await act(async () => { await useReconstructionStore.getState().selectSplatSource(expected); });
      expect(useTransformStore.getState().splatTransform).toEqual(alignment);
    } else {
      expect(useReconstructionStore.getState().showSplatPicker).toBe(false);
    }
    expect(getActiveSplatSourceId(useReconstructionStore.getState().loadedFiles)).toBe(expected);
  });

  it('keeps COLMAP only when the user chooses None before saved and shared source restoration', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const baseUrl = 'https://huggingface.co/datasets/owner/scene/resolve/main/';
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'splats/active.spz' }, ui: { backgroundColor: '#123456' } } });
    window.history.replaceState(null, '', '/#' + encodeShareData(baseUrl, null,
      { splat: { activeSourceId: 'splats/other.spz' }, pointCloud: { pointSize: 4 } }));
    const request = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith('colmapview.yaml')) return new Response(yaml);
      if (String(url).includes('/api/datasets/')) return Response.json([
        ...['cameras', 'images', 'points3D'].map(name => ({ type: 'file', path: `sparse/0/${name}.bin`, size: 10 })),
        { type: 'file', path: 'splats/active.spz', size: 100 },
        { type: 'file', path: 'splats/other.spz', size: 200 },
      ]);
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal('fetch', request);
    processFilesMock.mockImplementationOnce(async () => { useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles()); });
    const unsubscribe = useReconstructionStore.subscribe(state => {
      if (state.showSplatPicker) {
        unsubscribe();
        void state.selectSplatSource('');
      }
    });
    const { result } = renderHook(() => useUrlLoader({ applyUrlOverrides: true }));
    try {
      await act(async () => { expect(await result.current.loadFromUrl(baseUrl)).toBe(true); });
      expect(request.mock.calls.map(([url]) => String(url)).filter(url => url.endsWith('.spz'))).toEqual([]);
      expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(2);
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
      expect(useReconstructionStore.getState().requestedSplatSourceId).toBeNull();
      expect(useUIStore.getState().backgroundColor).toBe('#123456');
      expect(usePointCloudStore.getState().pointSize).toBe(4);
    } finally { unsubscribe(); }
  });

  it.each([
    { choice: 'shared', explicit: false }, { choice: 'saved', explicit: false },
    { choice: 'shared', explicit: true }, { choice: 'saved', explicit: true },
  ] as const)('makes no full splat request for $choice None with explicit manifest=$explicit', async ({ choice, explicit }) => {
    vi.stubGlobal('Blob', NodeBlob);
    const baseUrl = 'https://huggingface.co/datasets/owner/none/resolve/main/';
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: choice === 'saved' ? '' : 'splats/scene.spz' } } });
    if (choice === 'shared') window.history.replaceState(null, '', '/#' + encodeShareData(baseUrl, null,
      { splat: { activeSourceId: '' } }));
    const request = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith('colmapview.yaml')) return new Response(yaml);
      if (init?.method === 'HEAD') return new Response(null, { headers: { 'content-length': '100' } });
      if (String(url).includes('/api/datasets/')) return Response.json([
        ...['cameras', 'images', 'points3D'].map(name => ({ type: 'file', path: `sparse/0/${name}.bin`, size: 10 })),
        { type: 'file', path: 'splats/scene.spz', size: 100 },
      ]);
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal('fetch', request);
    processFilesMock.mockImplementationOnce(async () => { useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles()); });
    const { result } = renderHook(() => useUrlLoader({ applyUrlOverrides: choice === 'shared' }));
    await act(async () => {
      expect(await (explicit ? result.current.loadFromManifest({ ...createDefaultManifest(baseUrl), splats: ['splats/scene.spz'] })
        : result.current.loadFromUrl(baseUrl))).toBe(true);
    });
    expect(request.mock.calls.filter(([url, init]) => String(url).endsWith('.spz') && init?.method !== 'HEAD')).toEqual([]);
    expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(1);
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useReconstructionStore.getState().requestedSplatSourceId).toBeNull();
    expect(useReconstructionStore.getState().showSplatPicker).toBe(false);
  });

  it.each(['archive download', 'outer preparation'] as const)('retains None chosen during %s before an archive default splat reaches parsing', async phase => {
    const state = useReconstructionStore.getState();
    const previousSplat = new File(['old'], 'old.spz');
    state.setLoadedFiles(buildLoadedFiles({ splatFile: previousSplat, splatFiles: [previousSplat],
      splatFileSources: [{ id: 'old.spz', path: 'old.spz', file: previousSplat }] }));
    const initialRevision = useReconstructionStore.getState().splatSelectionRevision;
    const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin', 'default.spz']
      .map(name => [name, new File(['incoming'], name)]));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) => {
      if (phase === 'archive download') await state.selectSplatSource('');
      return (await deps.processFiles(files, undefined, { throwOnError: true })) !== false;
    });
    processFilesMock.mockImplementationOnce(async (incoming, _range, options) => {
      expect(options?.initialSplatSelectionRevision).toBe(initialRevision);
      await processFileDropzoneFiles(incoming, {
        addNotification: vi.fn(), getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
        getSplatSelectionState: () => ({ revision: useReconstructionStore.getState().splatSelectionRevision,
          sourceId: getShareActiveSplatSourceId(useReconstructionStore.getState().loadedFiles) ?? undefined }),
        getMinTrackLength: () => 1, getSourceInfo: () => ({ sourceType: 'zip', imageUrlBase: null }),
        getUrlLoading: () => useReconstructionStore.getState().urlLoading,
        clearCaches: vi.fn(), logger: noopLogger, resetView: vi.fn(), delay: async () => {},
        shouldPreloadSplatRuntime: () => false,
        parseFiles: async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false }),
        buildReconstruction: async () => ({ reconstruction: buildReconstruction(), pointCount: 0 }),
        setDroppedFiles: state.setDroppedFiles, setLoadedFiles: state.setLoadedFiles,
        setWasmReconstruction: state.setWasmReconstruction, setReconstruction: state.setReconstruction,
        setUrlProgress: state.setUrlProgress, setUrlLoading: state.setUrlLoading, setError: state.setError,
      }, options);
    });
    const { result } = renderHook(() => useUrlLoader());
    await act(async () => {
      if (phase === 'outer preparation') await state.selectSplatSource('');
      expect(await result.current.loadFromUrl('https://example.com/scene.tar',
        phase === 'outer preparation' ? { initialSplatSelectionRevision: initialRevision } : undefined)).toBe(true);
    });
    expect(useReconstructionStore.getState().loadedFiles?.points3DFile).toBe(files.get('points3D.bin'));
    expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(1);
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useReconstructionStore.getState().requestedSplatSourceId).toBeNull();
  });

  it('does not reopen the picker when a late catalog follows an explicit None choice', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const baseUrl = 'https://huggingface.co/datasets/owner/catalog/resolve/main/';
    let respond!: (response: Response) => void;
    const request = vi.fn(async (url: string | URL) => {
      if (String(url).includes('/tree/')) return new Promise<Response>(resolve => { respond = resolve; });
      if (String(url).endsWith('colmapview.yaml')) return new Response(null, { status: 404 });
      if (String(url).includes('/api/datasets/')) return Response.json({ id: 'owner/catalog' });
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal('fetch', request);
    processFilesMock.mockImplementationOnce(async () => { useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles()); });
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromManifest(createDefaultManifest(baseUrl)); });
    await waitFor(() => expect(processFilesMock).toHaveBeenCalledOnce());
    await act(async () => {
      await useReconstructionStore.getState().selectSplatSource('');
      useReconstructionStore.getState().setShowSplatPicker(false);
      respond(Response.json([{ type: 'file', path: 'splats/scene.spz', size: 100 }]));
      expect(await pending).toBe(true);
    });
    expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(1);
    expect(useReconstructionStore.getState().showSplatPicker).toBe(false);
    expect(request.mock.calls.filter(([url]) => String(url).endsWith('.spz'))).toEqual([]);
  });

  it('leaves a small splat lazy when optional YAML times out instead of guessing its saved choice', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Blob', NodeBlob);
    const baseUrl = 'https://huggingface.co/datasets/owner/timeout/resolve/main/';
    let respond!: (response: Response) => void;
    const request = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith('colmapview.yaml')) return new Promise<Response>(resolve => { respond = resolve; });
      if (String(url).includes('/api/datasets/')) return Response.json([
        ...['cameras', 'images', 'points3D'].map(name => ({ type: 'file', path: `sparse/0/${name}.bin`, size: 10 })),
        { type: 'file', path: 'splats/scene.spz', size: 100 },
      ]);
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal('fetch', request);
    processFilesMock.mockImplementationOnce(async () => { useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles()); });
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromUrl(baseUrl); });
    await act(async () => { await vi.waitFor(() => expect(processFilesMock).toHaveBeenCalledOnce()); });
    expect(useReconstructionStore.getState().loadedFiles).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS);
      expect(await pending).toBe(true);
    });
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: '' } } });
    await act(async () => { respond(new Response(yaml)); });
    expect(request.mock.calls.filter(([url]) => String(url).endsWith('.spz'))).toEqual([]);
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useReconstructionStore.getState().showSplatPicker).toBe(true);
  });

  it.each(['saved', 'override', 'previous-scene', 'missing', 'invalid'] as const)('loads a Hugging Face project with %s YAML settings', async mode => {
    vi.stubGlobal('Blob', NodeBlob);
    useCameraStore.setState(useCameraStore.getInitialState(), true);
    const repo = 'https://huggingface.co/datasets/owner/scene';
    const view: CameraViewState = { position: [1, 2, 3], target: [0, 0, 0], quaternion: [0, 0, 0, 1], distance: 4 };
    const overrideView: CameraViewState = { ...view, position: [8, 0, 0], distance: 8 };
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: view,
      config: { ui: { backgroundColor: '#123456' }, camera: { cameraScale: 0.4 }, pointCloud: { maxReprojectionError: null } } });
    const originalBackground = useUIStore.getState().backgroundColor;
    const request = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith('/colmapview.yaml')) return mode === 'missing'
        ? new Response('', { status: 404 }) : new Response(mode === 'invalid' ? 'version: 99' : yaml);
      if (String(url).includes('/api/datasets/')) return Response.json([
        { type: 'file', path: 'sparse/0/cameras.bin' }, { type: 'file', path: 'sparse/0/images.bin' }, { type: 'file', path: 'sparse/0/points3D.bin' },
      ]);
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal('fetch', request);
    if (mode === 'override' || mode === 'previous-scene') {
      window.history.replaceState(null, '', '/#' + encodeShareData(repo, overrideView, { ui: { backgroundColor: '#abcdef' } }));
    }
    // A renderer-generated hash during parsing must not override the incoming dataset defaults.
    processFilesMock.mockImplementationOnce(async () => { window.history.replaceState(null, '', '/#' + encodeCameraState(overrideView)); });
    const { result } = renderHook(() => useUrlLoader({
      logger: { info: vi.fn(), error: vi.fn() }, applyUrlOverrides: mode !== 'previous-scene',
    }));
    await act(async () => { expect(await result.current.loadFromUrl(repo)).toBe(true); });
    expect(processFilesMock).toHaveBeenCalledOnce();
    expect(request.mock.calls.map(call => String(call[0]))).toContain(repo + '/resolve/main/colmapview.yaml');
    expect(useUIStore.getState().backgroundColor).toBe(mode === 'override' ? '#abcdef'
      : mode === 'missing' || mode === 'invalid' ? originalBackground : '#123456');
    if (mode === 'saved' || mode === 'override' || mode === 'previous-scene') {
      expect(useCameraStore.getState().cameraScale).toBe(0.4);
      expect(useCameraStore.getState().flyToViewState).toEqual(mode === 'override' ? overrideView : view);
      expect(usePointCloudStore.getState().maxReprojectionError).toBe(Infinity);
    }
  });

  it('does not apply YAML that arrives after its dataset load was cancelled', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const settingsUrl = 'https://huggingface.co/datasets/owner/scene/resolve/main/colmapview.yaml';
    const responders = new Map<string, (response: Response) => void>();
    // Like fetch, pending requests reject when their load is aborted.
    const request = vi.fn((url: string, init?: RequestInit) => {
      if (String(url) === 'https://huggingface.co/api/datasets/owner/scene?expand=private') return Promise.resolve(Response.json({ id: 'owner/scene' }));
      return new Promise<Response>((resolve, reject) => {
        responders.set(String(url), resolve);
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      });
    });
    vi.stubGlobal('fetch', request);
    const manifest: ColmapManifest = { version: 1, baseUrl: 'https://huggingface.co/datasets/owner/scene/resolve/main/',
      files: { cameras: 'cameras.bin', images: 'images.bin', points3D: 'points3D.bin' }, splats: [] };
    const background = useUIStore.getState().backgroundColor;
    const { result } = renderHook(() => useUrlLoader());
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromManifest(manifest); });
    await waitFor(() => expect(responders.has(settingsUrl)).toBe(true));
    act(() => useReconstructionStore.getState().clear());
    await act(async () => { responders.get(settingsUrl)!(new Response('ui:\n  background_color: "#123456"')); expect(await pending).toBe(false); });
    expect(useUIStore.getState().backgroundColor).toBe(background);
    expect(processFilesMock).not.toHaveBeenCalled();
  });

  it('restores settings beside a direct splat file hosted outside Hugging Face', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const request = vi.fn(async (url: string | URL) => new Response(String(url).endsWith('colmapview.yaml')
      ? 'ui:\n  background_color: "#123456"' : 'splat bytes'));
    vi.stubGlobal('fetch', request);
    processFilesMock.mockResolvedValueOnce();
    const { result } = renderHook(() => useUrlLoader());
    await act(async () => { expect(await result.current.loadFromUrl('https://example.com/project/scene.spz')).toBe(true); });
    expect(processFilesMock).toHaveBeenCalledOnce();
    expect(useUIStore.getState().backgroundColor).toBe('#123456');
    expect(request.mock.calls.map(call => String(call[0]))).toEqual([
      'https://example.com/project/scene.spz', 'https://example.com/project/colmapview.yaml',
    ]);
  });

  it.each(['document', 'combined', 'binary', 'legacy'] as const)('restores a published view with %s URL precedence', async format => {
    vi.stubGlobal('Blob', NodeBlob);
    useCameraStore.setState(useCameraStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    const manifest: ColmapManifest = { version: 1, baseUrl: 'https://example.com/scene', viewerStatePath: 'colmapview-state.json',
      files: { cameras: 'cameras.bin', images: 'images.bin', points3D: 'points3D.bin' }, splats: [], skipImages: true };
    const savedView: CameraViewState = { position: [1, 2, 3], target: [0, 0, 0], quaternion: [0, 0, 0, 1], distance: Math.sqrt(14) };
    const overrideView: CameraViewState = { ...savedView, position: [9, 0, 0], distance: 9 };
    const savedTransform = { ...createIdentityEuler(), translationX: 2 };
    const overrideTransform = { ...createIdentityEuler(), translationX: 7 };
    const saved = { version: 1, viewerVersion: 'test', viewState: savedView, config: { transform: savedTransform } };
    const hashes = { document: '', combined: encodeShareData('https://example.com/manifest.json', overrideView, { transform: overrideTransform }),
      binary: encodeCameraState(overrideView), legacy: 'camera=9,0,0,0,0,0,0,0,0,1' };
    window.history.replaceState(null, '', '/#' + hashes[format]);
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => String(url).endsWith('colmapview-state.json')
      ? Response.json(saved) : new Response(new Uint8Array([1, 2, 3]))));
    processFilesMock.mockResolvedValueOnce();
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() }, applyUrlOverrides: true }));
    await act(async () => { expect(await result.current.loadFromManifest(manifest)).toBe(true); });
    expect(useCameraStore.getState().flyToViewState).toEqual(format === 'document' ? savedView : overrideView);
    expect(useTransformStore.getState().transform).toEqual(format === 'combined' ? overrideTransform : savedTransform);
  });

  it('applies shared link settings after a load even when the dataset has no saved settings', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    const overrideTransform = { ...createIdentityEuler(), translationX: 7 };
    window.history.replaceState(null, '', '/#' + encodeShareData('https://example.com/manifest.json', null, { transform: overrideTransform }));
    const manifest: ColmapManifest = { version: 1, baseUrl: 'https://example.com/scene',
      files: { cameras: 'cameras.bin', images: 'images.bin', points3D: 'points3D.bin' }, splats: [], skipImages: true };
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => String(url).endsWith('colmapview.yaml')
      ? new Response('', { status: 404 }) : new Response(new Uint8Array([1, 2, 3]))));
    processFilesMock.mockResolvedValueOnce();
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() }, applyUrlOverrides: true }));
    await act(async () => { expect(await result.current.loadFromManifest(manifest)).toBe(true); });
    expect(useTransformStore.getState().transform).toEqual(overrideTransform);
  });

  it.each(['complete', 'fail'] as const)('ignores a cleared download that later %ss while a new load is active', async (outcome) => {
    const requests: Array<{
      resolve: (response: Response) => void;
      reject: (reason: unknown) => void;
      signal: AbortSignal;
    }> = [];
    vi.stubGlobal('fetch', vi.fn((url, init) => String(url).endsWith('/colmapview.yaml')
      ? Promise.resolve(new Response('', { status: 404 })) : new Promise<Response>((resolve, reject) => {
      requests.push({ resolve, reject, signal: init.signal });
    })));
    const logger = { error: vi.fn(), info: vi.fn() };
    const { result } = renderHook(() => useUrlLoader({ logger }));
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => { first = result.current.loadFromUrl('https://example.com/old.spz'); });
    await waitFor(() => expect(requests).toHaveLength(1));
    act(() => { useReconstructionStore.getState().clear(); });
    expect(requests[0].signal.aborted).toBe(true);
    act(() => { second = result.current.loadFromUrl('https://example.com/new.spz'); });
    await waitFor(() => expect(requests).toHaveLength(2));
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
    processFilesMock.mockImplementation(async (files, _range, options) => {
      options?.onSceneReplaced?.();
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
      expect.objectContaining({
        replaceSplatScene: true,
        throwOnError: true,
        onViewerState: expect.any(Function),
      })
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
