import { stubbedParsing } from '../test/workflowStubs';
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
import type { PublishedViewerState } from '../utils/publishedViewerState';
import { serializeDatasetViewerSettings } from '../utils/datasetViewerSettings';
import { buildPendingFetch, buildLoadedFiles, buildPoint3D, buildReconstruction } from '../test/builders';
import { createDefaultManifest } from './urlLoaderPolicy';
import { getActiveSplatSourceId, getShareActiveSplatSourceId } from '../utils/splatFileSourcePolicy';
import { hfAuth, type HfAuthState } from '../features/huggingface/auth';
import * as archiveSource from './urlLoaderZipSource';
import { processFileDropzoneFiles } from './fileDropzoneWorkflow';
import { appLogger, noopLogger } from '../utils/logger';
import { useNotificationStore } from '../store/stores/notificationStore';
import { OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS, SKIPPED_SETTINGS_WARNING } from './urlLoaderViewerState';
import { OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE, SPLAT_LIST_TIMEOUT_MESSAGE, splatListTimeoutWarning } from './datasetTimeoutWarnings';
import { notificationsWithMessage } from '../test/notifications';
import { SPLAT_DISCOVERY_TIMEOUT_MS } from './urlLoaderManifestSource';
import { URL_LOAD_GUARD_MESSAGE } from './urlLoaderLoadGuard';
import { isReconstructionLoadPending } from '../wasm/reconstructionLoadLifecycle';
import { getSplatLoadingProgress } from '../utils/splatLoadingProgressPolicy';
import { startupLinkRetry } from '../appStartupRetry';
import { bucketConnection } from '../features/bucketStorage/connection';
import { webcrypto } from 'node:crypto';

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

/** Timeout warnings on screen. */
const settingsTimeoutWarnings = () => notificationsWithMessage(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE);
const splatListTimeoutWarnings = () => notificationsWithMessage(SPLAT_LIST_TIMEOUT_MESSAGE);

function hubEntries(splats: Array<{ path: string; size: number }>) {
  return [
    ...['cameras', 'images', 'points3D'].map(name => ({ type: 'file', path: `sparse/0/${name}.bin`, size: 10 })),
    ...splats.map(splat => ({ type: 'file', ...splat })),
  ];
}

/** What processFiles does for a URL load: the real workflow over the real store, with parsing stubbed. */
function processWithStore(files: Map<string, File>, options?: Parameters<typeof processFileDropzoneFiles>[2],
  sourceType: 'url' | 'zip' = 'url') {
  const state = useReconstructionStore.getState();
  return processFileDropzoneFiles(files, {
    addNotification: vi.fn(), getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
    getSplatSelectionState: () => ({ revision: useReconstructionStore.getState().splatSelectionRevision,
      sourceId: getShareActiveSplatSourceId(useReconstructionStore.getState().loadedFiles,
        useReconstructionStore.getState().splatNoneChosen) ?? undefined }),
    getMinTrackLength: () => 1, getSourceInfo: () => ({ sourceType, imageUrlBase: null }),
    getUrlLoading: () => useReconstructionStore.getState().urlLoading,
    ...stubbedParsing(), resetView: vi.fn(),
    setDroppedFiles: state.setDroppedFiles, setLoadedFiles: state.setLoadedFiles,
    setWasmReconstruction: state.setWasmReconstruction, setReconstruction: state.setReconstruction,
    setUrlProgress: state.setUrlProgress, setUrlLoading: state.setUrlLoading, setError: state.setError,
  }, options);
}

describe('useUrlLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks keeps implementations: one test's processFiles must not run in the next.
    processFilesMock.mockReset();
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
    useCameraStore.setState(useCameraStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    splatListTimeoutWarning.dismiss();
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
    window.history.replaceState(null, '', '/');
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('retains a non-startup private bucket load and retries it after connecting', async () => {
    vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('crypto', webcrypto);
    const root = 'https://account.r2.cloudflarestorage.com/bucket/';
    const url = root + 'dataset/manifest.json';
    const request = vi.fn(async (url: string, init?: RequestInit) => {
      if (!new Headers(init?.headers).has('Authorization')) return new Response(null, { status: 403 });
      if (url.endsWith('/manifest.json')) return Response.json(createDefaultManifest(root + 'dataset/'));
      if (/(cameras|images|points3D)\.bin$/.test(url)) return new Response(new Uint8Array([1, 2, 3]));
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', request);
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    try {
      await act(async () => { expect(await result.current.loadFromUrl(url)).toBe(false); });
      expect(useReconstructionStore.getState().urlError).toMatchObject({ type: 'auth', access: { provider: 'bucket', bucketUrl: root } });
      expect(useReconstructionStore.getState().error).toBeNull();
      expect(request).not.toHaveBeenCalled();
      const retry = startupLinkRetry.getSnapshot(); expect(retry).not.toBeNull();
      bucketConnection.connect({ baseUrl: root, region: 'auto' }, { accessKeyId: 'fixture-access', secretAccessKey: 'fixture-secret' });
      await act(async () => { await retry!(); });
      expect(processFilesMock).toHaveBeenCalledOnce();
      expect(useReconstructionStore.getState().urlError).toBeNull();
      expect(startupLinkRetry.getSnapshot()).toBeNull();
      expect(request.mock.calls.every(([, init]) => new Headers(init?.headers).has('Authorization'))).toBe(true);
    } finally { bucketConnection.disconnect(); }
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
    // Like processFiles, report the scene this load committed.
    processFilesMock.mockImplementationOnce(async (_files, _range, options) => { options?.onSceneReplaced?.(); });
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

  it('loads a public Hugging Face dataset when the access check is rate limited', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const request = vi.fn(async (url: string) => {
      if (url.endsWith('?expand=private')) return new Response(null, { status: 429 });
      if (url.includes('/tree/')) return Response.json(['cameras', 'images', 'points3D'].map(name => ({ type: 'file', path: `sparse/0/${name}.bin` })));
      if (/(cameras|images|points3D)\.bin$/.test(url)) return new Response(new Uint8Array([1, 2, 3]));
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', request);
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    await act(async () => { expect(await result.current.loadFromUrl('https://huggingface.co/datasets/owner/public')).toBe(true); });
    expect(processFilesMock).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledExactlyOnceWith('[Hugging Face] Dataset access check returned 429; continuing with the dataset files.');
  });

  it.each(['url', 'inline'] as const)('keeps loading a public HF dataset (%s) when the stalled access check reports a plain AbortError', async mode => {
    vi.stubGlobal('Blob', NodeBlob);
    const repo = 'https://huggingface.co/datasets/owner/public';
    const request = vi.fn(async (url: string) => {
      // Engines without abort-reason propagation report the transport timeout this way.
      if (url.endsWith('?expand=private')) throw new DOMException('The operation was aborted.', 'AbortError');
      if (url.includes('/tree/')) return Response.json(['cameras', 'images', 'points3D'].map(name => ({ type: 'file', path: `sparse/0/${name}.bin` })));
      if (/(cameras|images|points3D)\.bin$/.test(url)) return new Response(new Uint8Array([1, 2, 3]));
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', request);
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    await act(async () => {
      expect(await (mode === 'url' ? result.current.loadFromUrl(repo)
        : result.current.loadFromManifest(createDefaultManifest(`${repo}/resolve/main/`)))).toBe(true);
    });
    expect(processFilesMock).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Dataset access check failed'), expect.any(DOMException));
  });

  it('cancels a private repository check without clearing or replacing the current scene', async () => {
    const loadedFiles = buildLoadedFiles();
    useReconstructionStore.setState({ loadedFiles });
    const pendingFetch = buildPendingFetch();
    const request = vi.fn((url: string, init?: RequestInit) => pendingFetch.fetch(String(url), init));
    vi.stubGlobal('fetch', request);
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
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
    const pendingFetch = buildPendingFetch();
    const request = vi.fn((url: string, init?: RequestInit): Promise<Response> => {
      if (url === 'https://huggingface.co/api/datasets/owner/public?expand=private') {
        return new Promise(resolve => { allowAccess = resolve; });
      }
      if (url.includes('/tree/')) {
        return pendingFetch.fetch(String(url), init);
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
    const pendingFetch = buildPendingFetch();
    const request = vi.fn((url: string, init?: RequestInit): Promise<Response> => {
      if (url === 'https://huggingface.co/api/datasets/owner/public?expand=private') {
        return Promise.resolve(Response.json({ id: 'owner/public', private: false }));
      }
      return pendingFetch.fetch(String(url), init);
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
    expect(useReconstructionStore.getState().urlError?.message).toContain(kind === 'private' ? 'This Drive link could not be opened' : 'folder link');
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
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger, applyUrlOverrides: mode === 'override' }));
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
      // The picker offers the skipped splat; nothing stays requested for a later dataset to pick up.
      expect(useReconstructionStore.getState().requestedSplatSourceId).toBeNull();
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
      if ((state.loadedFiles?.splatFileSources?.length ?? 0) === 2) {
        unsubscribe();
        void state.selectSplatSource('');
      }
    });
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger, applyUrlOverrides: true }));
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
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger, applyUrlOverrides: choice === 'shared' }));
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
      await processWithStore(incoming, options, 'zip');
    });
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
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
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
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
    expect(settingsTimeoutWarnings()).toEqual([expect.objectContaining({ type: 'warning' })]);
    // The late answer is logged and dropped; it never applies its None.
    expect(warn).toHaveBeenCalledExactlyOnceWith(SKIPPED_SETTINGS_WARNING);
  });

  it('downloads an automatically chosen splat without opening the picker over it', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const baseUrl = 'https://huggingface.co/datasets/owner/auto/resolve/main/';
    let respondSplat!: (response: Response) => void;
    const request = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith('colmapview.yaml')) return new Response(null, { status: 404 });
      if (init?.method === 'HEAD') return new Response(null, { headers: { 'content-length': '100' } });
      if (String(url).endsWith('.spz')) return new Promise<Response>(resolve => { respondSplat = resolve; });
      if (String(url).includes('/api/datasets/')) return Response.json(hubEntries([{ path: 'splats/scene.spz', size: 100 }]));
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal('fetch', request);
    processFilesMock.mockImplementationOnce(async () => { useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles()); });
    const pickerStates: boolean[] = [];
    const unsubscribe = useReconstructionStore.subscribe(state => { pickerStates.push(state.showSplatPicker); });
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    try {
      let pending!: Promise<boolean>;
      act(() => { pending = result.current.loadFromUrl(baseUrl); });
      await waitFor(() => expect(request.mock.calls.some(([url, init]) => String(url).endsWith('.spz') && init?.method !== 'HEAD')).toBe(true));
      expect(useReconstructionStore.getState().showSplatPicker).toBe(false);
      await act(async () => {
        respondSplat(new Response(new Uint8Array([4, 5, 6])));
        expect(await pending).toBe(true);
      });
      expect(getActiveSplatSourceId(useReconstructionStore.getState().loadedFiles)).toBe('splats/scene.spz');
      expect(pickerStates).not.toContain(true);
    } finally { unsubscribe(); }
  });

  it('opens the picker once the load settles when several splats need a choice', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const baseUrl = 'https://huggingface.co/datasets/owner/many/resolve/main/';
    const request = vi.fn(async (url: string | URL, init?: RequestInit) => {
      // Display-only saved settings: they choose no splat, so the settled load still asks.
      if (String(url).endsWith('colmapview.yaml')) return new Response('ui:\n  background_color: "#123456"\n');
      if (init?.method === 'HEAD') return new Response(null, { headers: { 'content-length': '100' } });
      if (String(url).includes('/api/datasets/')) return Response.json(hubEntries([
        { path: 'splats/a.spz', size: 100 }, { path: 'splats/b.spz', size: 200 }]));
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal('fetch', request);
    processFilesMock.mockImplementationOnce(async () => { useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles()); });
    // The saved background is restored after the catalog merge and just before the load decides
    // whether to ask, so an earlier open shows here, whichever store update made it. Only that
    // restore is recorded: other background writes say nothing about the picker.
    const whenRestored: Array<{ listed: number; picker: boolean }> = [];
    const unsubscribe = useUIStore.subscribe((state, previous) => {
      if (state.backgroundColor !== '#123456' || previous.backgroundColor === '#123456') return;
      const { loadedFiles, showSplatPicker } = useReconstructionStore.getState();
      whenRestored.push({ listed: loadedFiles?.splatFileSources?.length ?? 0, picker: showSplatPicker });
    });
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    try {
      await act(async () => { expect(await result.current.loadFromUrl(baseUrl)).toBe(true); });
      // Both splats were listed and the picker was still closed; only the settled load asked.
      expect(whenRestored).toEqual([{ listed: 2, picker: false }]);
      expect(useReconstructionStore.getState().showSplatPicker).toBe(true);
      expect(request.mock.calls.filter(([url, init]) => String(url).endsWith('.spz') && init?.method !== 'HEAD')).toEqual([]);
    } finally { unsubscribe(); }
  });

  it.each([
    ['an archive', 'https://example.com/scene.tar'],
    ['a direct splat', 'https://example.com/scene.spz'],
  ] as const)('does not offer the picker after %s load that listed no remote catalog', async (_kind, url) => {
    vi.stubGlobal('Blob', NodeBlob);
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => String(input).endsWith('colmapview.yaml')
      ? new Response(null, { status: 404 }) : new Response(new Uint8Array([1, 2, 3]))));
    if (url.endsWith('.tar')) {
      vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) =>
        (await deps.processFiles(new Map([['cameras.bin', new File(['c'], 'cameras.bin')]]), undefined, { throwOnError: true })) !== false);
    }
    // The load ends with a splat listed but none showing, and nobody chose None.
    processFilesMock.mockImplementationOnce(async () => {
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFileSources: [
        { id: 'splats/a.spz', path: 'splats/a.spz', url: 'https://example.com/splats/a.spz', size: 100 }] }));
    });
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    await act(async () => { expect(await result.current.loadFromUrl(url)).toBe(true); });
    const state = useReconstructionStore.getState();
    expect(state.loadedFiles?.splatFileSources).toHaveLength(1);
    expect(state.loadedFiles?.splatFile).toBeUndefined();
    // Only a merged remote catalog asks; this load never listed one.
    expect(state.showSplatPicker).toBe(false);
  });

  it('asks again when the automatically chosen splat fails to download', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const baseUrl = 'https://huggingface.co/datasets/owner/flaky/resolve/main/';
    const request = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith('colmapview.yaml')) return new Response(null, { status: 404 });
      if (init?.method === 'HEAD') return new Response(null, { headers: { 'content-length': '100' } });
      if (String(url).endsWith('.spz')) return new Response(null, { status: 404 });
      if (String(url).includes('/api/datasets/')) return Response.json(hubEntries([{ path: 'splats/scene.spz', size: 100 }]));
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal('fetch', request);
    processFilesMock.mockImplementationOnce(async () => { useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles()); });
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    await act(async () => { expect(await result.current.loadFromUrl(baseUrl)).toBe(true); });
    const state = useReconstructionStore.getState();
    expect(state.loadedFiles?.splatFile).toBeUndefined();
    expect(state.urlError?.message).toBe('Failed to load splat');
    expect(state.showSplatPicker).toBe(true);
  });

  it('keeps the saved alignment, navigation, view and Reload settings when the restored splat download is cancelled', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const baseUrl = 'https://huggingface.co/datasets/owner/cancel/resolve/main/';
    const alignment = { ...createIdentityEuler(), translationX: 5 };
    const view: CameraViewState = { position: [1, 2, 3], target: [0, 0, 0], quaternion: [0, 0, 0, 1], distance: 4 };
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: view,
      config: { splat: { transform: alignment }, ui: { backgroundColor: '#123456' },
        camera: { horizonLock: 'on', cameraProjection: 'orthographic', showCameras: false } } });
    const background = useUIStore.getState().backgroundColor;
    const pendingFetch = buildPendingFetch();
    const request = vi.fn((url: string | URL, init?: RequestInit): Promise<Response> => {
      if (String(url).endsWith('colmapview.yaml')) return Promise.resolve(new Response(yaml));
      if (init?.method === 'HEAD') return Promise.resolve(new Response(null, { headers: { 'content-length': '100' } }));
      // Like fetch, the splat download rejects once its signal aborts.
      if (String(url).endsWith('.spz')) return pendingFetch.fetch(String(url), init);
      if (String(url).includes('/api/datasets/')) return Promise.resolve(Response.json(hubEntries([{ path: 'splats/scene.spz', size: 100 }])));
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
    });
    vi.stubGlobal('fetch', request);
    processFilesMock.mockImplementationOnce(async (files, _range, options) => {
      options?.onSceneReplaced?.(); // Like processFiles, report the scene this load committed.
      useReconstructionStore.getState().setDroppedFiles(files);
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles());
    });
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromUrl(baseUrl); });
    await waitFor(() => expect(request.mock.calls.some(([url, init]) => String(url).endsWith('.spz') && init?.method !== 'HEAD')).toBe(true));
    act(() => useReconstructionStore.getState().cancelLoading());
    await act(async () => { expect(await pending).toBe(false); });
    expect(useTransformStore.getState().splatTransform.translationX).toBe(5);
    expect(useCameraStore.getState().flyToViewState).toEqual(view);
    const { sourceViewerState, droppedFiles } = useReconstructionStore.getState();
    expect(sourceViewerState?.files).toBe(droppedFiles);
    expect(sourceViewerState?.state.config).toMatchObject({ splat: { transform: alignment }, ui: { backgroundColor: '#123456' } });
    // Navigation went with the view; frustum and point display waited for the splat.
    expect(useCameraStore.getState()).toMatchObject({ horizonLock: 'on', cameraProjection: 'orthographic', showCameras: true });
    expect(useUIStore.getState().backgroundColor).toBe(background);
  });

  it('shows the points again when the restored splat download is cancelled', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const baseUrl = 'https://huggingface.co/datasets/owner/cancel/resolve/main/';
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'splats/scene.spz' } } });
    const pendingFetch = buildPendingFetch();
    const request = vi.fn((url: string | URL, init?: RequestInit): Promise<Response> => {
      if (String(url).endsWith('colmapview.yaml')) return Promise.resolve(new Response(yaml));
      if (init?.method === 'HEAD') return Promise.resolve(new Response(null, { headers: { 'content-length': '100' } }));
      // Like fetch, the splat download rejects once its signal aborts.
      if (String(url).endsWith('.spz')) return pendingFetch.fetch(String(url), init);
      if (String(url).includes('/api/datasets/')) return Promise.resolve(Response.json(hubEntries([{ path: 'splats/scene.spz', size: 100 }])));
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
    });
    vi.stubGlobal('fetch', request);
    // The visitor's stored splat style survives a commit that lists the splat without showing it.
    const splatDisplay = { colorMode: 'splatPoints', pointSize: 1, pointOpacity: 0.2 } as const;
    usePointCloudStore.setState(splatDisplay);
    processFilesMock.mockImplementationOnce(async () => {
      useReconstructionStore.getState().setReconstruction(buildReconstruction());
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({ splatFileSources: [
        { id: 'splats/scene.spz', path: 'splats/scene.spz', url: baseUrl + 'splats/scene.spz', size: 100 }] }));
    });
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromUrl(baseUrl); });
    await waitFor(() => expect(request.mock.calls.some(([url, init]) => String(url).endsWith('.spz') && init?.method !== 'HEAD')).toBe(true));
    expect(usePointCloudStore.getState()).toMatchObject(splatDisplay);
    act(() => useReconstructionStore.getState().cancelLoading());
    await act(async () => { expect(await pending).toBe(false); });
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'rgb', pointSize: 2, pointOpacity: 1 });
  });

  it('remembers the saved settings that came with a URL dataset for Reload', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const baseUrl = 'https://huggingface.co/datasets/owner/saved/resolve/main/';
    const request = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith('colmapview.yaml')) return new Response('ui:\n  background_color: "#123456"\n');
      if (String(url).includes('/api/datasets/')) return Response.json(hubEntries([]));
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal('fetch', request);
    processFilesMock.mockImplementationOnce(async (files, _range, options) => {
      options?.onSceneReplaced?.();
      useReconstructionStore.getState().setDroppedFiles(files);
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles());
    });
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));
    await act(async () => { expect(await result.current.loadFromUrl(baseUrl)).toBe(true); });
    const { sourceViewerState, droppedFiles } = useReconstructionStore.getState();
    expect(sourceViewerState?.files).toBe(droppedFiles);
    expect(sourceViewerState?.state.config).toEqual({ ui: { backgroundColor: '#123456' } });
  });

  it.each([
    ['its own settings', 'ui:\n  background_color: "#abcdef"\n'],
    ['no settings', null],
  ] as const)("leaves the open dataset's Reload settings alone when a load only merges into its scene (%s)", async (_label, yaml) => {
    vi.stubGlobal('Blob', NodeBlob);
    const openFiles = new Map([['sparse/0/cameras.bin', new File(['c'], 'cameras.bin')]]);
    const openSettings: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null,
      config: { ui: { backgroundColor: '#123456' } } };
    const store = useReconstructionStore.getState();
    store.setDroppedFiles(openFiles);
    store.setLoadedFiles(buildLoadedFiles());
    store.setSourceViewerState(openSettings);
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => yaml && String(url).endsWith('colmapview.yaml')
      ? new Response(yaml) : new Response(null, { status: 404 })));
    vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) =>
      (await deps.processFiles(new Map([['scene.spz', new File(['s'], 'scene.spz')]]), undefined, { throwOnError: true })) !== false);
    // Like updateLoadedSplatFile: the splat joins the open scene; no new file map, no onSceneReplaced.
    processFilesMock.mockImplementationOnce(async files => {
      const splat = files.get('scene.spz')!;
      const loaded = useReconstructionStore.getState().loadedFiles!;
      useReconstructionStore.getState().setLoadedFiles({ ...loaded, splatFile: splat, splatFiles: [splat] });
    });
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));

    await act(async () => { expect(await result.current.loadFromUrl('https://example.com/splats.zip')).toBe(true); });

    expect(useReconstructionStore.getState().droppedFiles).toBe(openFiles);
    expect(useReconstructionStore.getState().sourceViewerState).toEqual({ files: openFiles, state: openSettings });
  });

  it.each(['saved', 'override', 'previous-scene', 'missing', 'invalid'] as const)('loads a Hugging Face project with %s YAML settings', async mode => {
    vi.stubGlobal('Blob', NodeBlob);
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
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
    const { result } = renderHook(() => useUrlLoader({
      logger: { info: vi.fn(), error: vi.fn() }, applyUrlOverrides: mode !== 'previous-scene',
    }));
    await act(async () => { expect(await result.current.loadFromUrl(repo)).toBe(true); });
    expect(processFilesMock).toHaveBeenCalledOnce();
    expect(request.mock.calls.map(call => String(call[0]))).toContain(repo + '/resolve/main/colmapview.yaml');
    // Only unreadable settings are worth a warning; a missing file is normal.
    expect(warn.mock.calls).toEqual(mode === 'invalid' ? [[SKIPPED_SETTINGS_WARNING]] : []);
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
    const pendingFetch = buildPendingFetch();
    const settingsRequest = () => pendingFetch.requests.find(({ url }) => url === settingsUrl);
    // Like fetch, pending requests reject when their load is aborted.
    const request = vi.fn((url: string, init?: RequestInit) => {
      if (String(url) === 'https://huggingface.co/api/datasets/owner/scene?expand=private') return Promise.resolve(Response.json({ id: 'owner/scene' }));
      return pendingFetch.fetch(url, init);
    });
    vi.stubGlobal('fetch', request);
    const manifest: ColmapManifest = { version: 1, baseUrl: 'https://huggingface.co/datasets/owner/scene/resolve/main/',
      files: { cameras: 'cameras.bin', images: 'images.bin', points3D: 'points3D.bin' }, splats: [] };
    const background = useUIStore.getState().backgroundColor;
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromManifest(manifest); });
    await waitFor(() => expect(Boolean(settingsRequest())).toBe(true));
    act(() => useReconstructionStore.getState().clear());
    await act(async () => { settingsRequest()!.respond(new Response('ui:\n  background_color: "#123456"')); expect(await pending).toBe(false); });
    expect(useUIStore.getState().backgroundColor).toBe(background);
    expect(processFilesMock).not.toHaveBeenCalled();
  });

  it.each(['Cancel loading', 'None'] as const)('applies the settings beside a splat archive after %s stops its decode over the open scene', async action => {
    vi.stubGlobal('Blob', NodeBlob);
    const alignment = { ...createIdentityEuler(), translationX: 5 };
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null, config: { transform: alignment } });
    const reconstruction = buildReconstruction();
    useReconstructionStore.setState({ reconstruction, loadedFiles: buildLoadedFiles({ camerasFile: new File(['c'], 'cameras.bin'),
      imagesFile: new File(['i'], 'images.bin'), points3DFile: new File(['p'], 'points3D.bin') }) });
    const splat = new File(['x'], 'scene.spz');
    const pendingFetch = buildPendingFetch();
    vi.stubGlobal('fetch', vi.fn((url: string | URL, init?: RequestInit) => String(url).endsWith('colmapview.yaml')
      ? pendingFetch.fetch(String(url), init)
      : Promise.resolve(new Response(null, { status: 404 }))));
    vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) =>
      (await deps.processFiles(new Map([['scene.spz', splat]]), { start: 80, end: 100 },
        { throwOnError: true, signal: deps.signal, beforeSceneCommit: deps.beforeSceneCommit })) !== false);
    processFilesMock.mockImplementationOnce(async (incoming, _range, options) => { await processWithStore(incoming, options); });
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromUrl('https://example.com/project/splats.zip'); });
    // The archive's splat joined the open scene; the settings beside it are asked for only now.
    await waitFor(() => expect(pendingFetch.requests.at(-1)?.respond).toBeDefined());
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(splat);
    // The renderer takes the splat over with its overlay and Cancel, as SplatLayer does.
    act(() => useReconstructionStore.setState({ urlLoading: true, urlProgress: getSplatLoadingProgress(splat, { startPercent: 60 }) }));

    if (action === 'Cancel loading') act(() => useReconstructionStore.getState().cancelLoading());
    else await act(async () => { await useReconstructionStore.getState().selectSplatSource(''); });
    await act(async () => {
      pendingFetch.requests.at(-1)!.respond(new Response(yaml));
      expect(await pending).toBe(true);
    });

    const state = useReconstructionStore.getState();
    expect(state.reconstruction).toBe(reconstruction);
    expect(state.loadedFiles?.splatFile).toBeUndefined();
    expect(state.urlLoading).toBe(false);
    expect(useTransformStore.getState().transform).toEqual(alignment);
  });

  it('restores settings beside a direct splat file hosted outside Hugging Face', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const request = vi.fn(async (url: string | URL) => new Response(String(url).endsWith('colmapview.yaml')
      ? 'ui:\n  background_color: "#123456"' : 'splat bytes'));
    vi.stubGlobal('fetch', request);
    processFilesMock.mockResolvedValueOnce();
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    await act(async () => { expect(await result.current.loadFromUrl('https://example.com/project/scene.spz')).toBe(true); });
    expect(processFilesMock).toHaveBeenCalledOnce();
    expect(useUIStore.getState().backgroundColor).toBe('#123456');
    // The settings are asked for first, so they arrive during the download.
    expect(request.mock.calls.map(call => String(call[0]))).toEqual([
      'https://example.com/project/colmapview.yaml', 'https://example.com/project/scene.spz',
    ]);
  });

  it('warns when settings beside a direct splat file do not arrive in time', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Blob', NodeBlob);
    const request = vi.fn((url: string | URL) => String(url).endsWith('colmapview.yaml')
      ? new Promise<Response>(() => {}) : Promise.resolve(new Response('splat bytes')));
    vi.stubGlobal('fetch', request);
    processFilesMock.mockResolvedValueOnce();
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromUrl('https://example.com/project/scene.spz'); });
    await act(async () => {
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
      await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS);
      expect(await pending).toBe(true);
    });
    expect(settingsTimeoutWarnings()).toEqual([expect.objectContaining({ type: 'warning' })]);
    // The warning describes that load; the next one removes it as soon as it starts.
    let next!: Promise<boolean>;
    act(() => { next = result.current.loadFromUrl('https://example.com/project/other.spz'); });
    expect(settingsTimeoutWarnings()).toEqual([]);
    act(() => useReconstructionStore.getState().cancelLoading());
    await act(async () => { expect(await next).toBe(false); });
  });

  it('asks for the settings beside a direct splat file during its download, but starts their deadline after parsing', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Blob', NodeBlob);
    let deliver: ((response: Response) => void) | undefined;
    const request = vi.fn((url: string | URL) => String(url).endsWith('colmapview.yaml')
      ? new Promise<Response>(() => {}) : new Promise<Response>(resolve => { deliver = resolve; }));
    vi.stubGlobal('fetch', request);
    processFilesMock.mockResolvedValueOnce();
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    let pending!: Promise<boolean>;
    let finished = false;
    act(() => {
      pending = result.current.loadFromUrl('https://example.com/project/scene.spz');
      void pending.then(() => { finished = true; });
    });
    await act(async () => { await vi.waitFor(() => expect(deliver).toBeDefined()); });
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([
      'https://example.com/project/colmapview.yaml', 'https://example.com/project/scene.spz']);
    // A slow download does not use up the settings' time.
    await act(async () => { await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS * 2); });
    expect(settingsTimeoutWarnings()).toEqual([]);
    await act(async () => {
      deliver!(new Response('splat bytes'));
      await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS - 1);
    });
    expect(finished).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toBe(true);
    });
    expect(settingsTimeoutWarnings()).toEqual([expect.objectContaining({ type: 'warning' })]);
  });

  it('keeps a direct splat file off screen until the settings beside it answer', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    let respond: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn((url: string | URL) => String(url).endsWith('colmapview.yaml')
      ? new Promise<Response>(resolve => { respond = resolve; }) : Promise.resolve(new Response('splat bytes'))));
    // The real loadSplatUrlSource, handing the real workflow the hook the loader gave it.
    processFilesMock.mockImplementationOnce(async (incoming, _range, options) => { await processWithStore(incoming, options); });
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromUrl('https://example.com/project/scene.spz'); });
    await waitFor(() => expect(useReconstructionStore.getState().urlProgress?.message).toBe('Loading saved view settings...'));
    expect(useReconstructionStore.getState()).toMatchObject({ reconstruction: null, loadedFiles: null, urlLoading: true });

    await act(async () => {
      respond!(new Response('ui:\n  background_color: "#123456"\n'));
      expect(await pending).toBe(true);
    });
    expect(useReconstructionStore.getState().loadedFiles?.splatFile?.name).toBe('scene.spz');
    expect(useUIStore.getState().backgroundColor).toBe('#123456');
  });

  it('warns once when the splat list does not load in time, until the next load starts', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Blob', NodeBlob);
    const baseUrl = 'https://example.com/listing/';
    const request = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith('colmapview.yaml')) return new Response(null, { status: 404 });
      if (String(url).includes('/splats/')) return new Promise<Response>(() => {});
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal('fetch', request);
    processFilesMock.mockImplementationOnce(async (files, _range, options) => { await processWithStore(files, options); });
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromManifest({ ...createDefaultManifest(baseUrl), splats: ['splats/scene.ply'] }); });
    await act(async () => { await vi.waitFor(() => expect(processFilesMock).toHaveBeenCalledOnce()); });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SPLAT_DISCOVERY_TIMEOUT_MS);
      expect(await pending).toBe(true);
    });
    expect(useReconstructionStore.getState().reconstruction).not.toBeNull();
    expect(useReconstructionStore.getState().loadedFiles?.splatFileSources ?? []).toEqual([]);
    expect(splatListTimeoutWarnings()).toEqual([expect.objectContaining({ type: 'warning' })]);
    // The warning describes that load; the next one removes it as soon as it starts.
    let next!: Promise<boolean>;
    act(() => { next = result.current.loadFromUrl('https://example.com/project/other.spz'); });
    expect(splatListTimeoutWarnings()).toEqual([]);
    act(() => useReconstructionStore.getState().cancelLoading());
    await act(async () => { expect(await next).toBe(false); });
  });

  it('says nothing about late settings of a dataset cancelled while its splat list still runs', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Blob', NodeBlob);
    const request = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith('colmapview.yaml') || String(url).includes('/splats/')) return new Promise<Response>(() => {});
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal('fetch', request);
    processFilesMock.mockImplementationOnce(async (files, _range, options) => { await processWithStore(files, options); });
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromManifest({ ...createDefaultManifest('https://example.com/slow/'), splats: ['splats/scene.ply'] }); });
    await act(async () => { await vi.waitFor(() => expect(processFilesMock).toHaveBeenCalledOnce()); });
    // The settings' deadline passes while the scene still waits for its splat list.
    await act(async () => { await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS); });
    expect(useReconstructionStore.getState().reconstruction).toBeNull();
    expect(useReconstructionStore.getState().urlProgress?.message).toBe('Looking for splats and saved settings...');

    act(() => useReconstructionStore.getState().cancelLoading());
    await act(async () => { expect(await pending).toBe(false); });
    expect(useReconstructionStore.getState().reconstruction).toBeNull();
    expect(settingsTimeoutWarnings()).toEqual([]);
  });

  it.each([
    { inside: false, requests: ['https://example.com/project/colmapview.yaml'], warnings: 1 },
    { inside: true, requests: [], warnings: 0 },
  ])('warns about settings beside an archive that do not arrive in time (settings inside: $inside)', async ({ inside, requests, warnings }) => {
    vi.useFakeTimers();
    vi.stubGlobal('Blob', NodeBlob);
    const request = vi.fn((_url: string | URL, _init?: RequestInit) => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', request);
    const files = new Map([['cameras.bin', new File(['c'], 'cameras.bin')]]);
    if (inside) files.set('colmapview.yaml', new File(['ui: {}'], 'colmapview.yaml'));
    vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) =>
      (await deps.processFiles(files, undefined, { throwOnError: true })) !== false);
    processFilesMock.mockResolvedValueOnce();
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromUrl('https://example.com/project/scene.tar'); });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS);
      expect(await pending).toBe(true);
    });
    // Settings inside the archive are the dataset's own: an archive holding them asks for none beside it.
    expect(request.mock.calls.map(([url]) => String(url))).toEqual(requests);
    expect(request.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
    expect(settingsTimeoutWarnings()).toHaveLength(warnings);
  });

  it('asks for the settings beside an archive once it is downloaded without its own, while it parses', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const request = vi.fn((_url: string | URL, _init?: RequestInit) => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', request);
    let finishDownload: (() => void) | undefined;
    vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) => {
      await new Promise<void>(resolve => { finishDownload = resolve; });
      return (await deps.processFiles(new Map([['cameras.bin', new File(['c'], 'cameras.bin')]]), undefined,
        { throwOnError: true, beforeSceneCommit: deps.beforeSceneCommit })) !== false;
    });
    let finishParsing: (() => void) | undefined;
    processFilesMock.mockImplementationOnce(() => new Promise<void>(resolve => { finishParsing = resolve; }));
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromUrl('https://example.com/project/scene.zip'); });
    await waitFor(() => expect(finishDownload).toBeDefined());
    // While it downloads, nothing yet says whether the archive holds its own settings.
    expect(request).not.toHaveBeenCalled();
    act(() => finishDownload!());
    await waitFor(() => expect(finishParsing).toBeDefined());
    // Parsing has not finished, and the settings beside the archive are already on their way.
    await waitFor(() => expect(request.mock.calls.map(([url]) => String(url)))
      .toEqual(['https://example.com/project/colmapview.yaml']));
    act(() => useReconstructionStore.getState().cancelLoading());
    await act(async () => { finishParsing!(); expect(await pending).toBe(false); });
  });

  it.each(['document', 'combined', 'binary', 'legacy'] as const)('restores a published view with %s URL precedence', async format => {
    vi.stubGlobal('Blob', NodeBlob);
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

  it.each([false, true])('reports point filtering after saved settings and shared overrides (shared: %s)', async shared => {
    vi.stubGlobal('Blob', NodeBlob);
    const manifest: ColmapManifest = { version: 1, baseUrl: 'https://example.com/scene', viewerStatePath: 'state.json',
      files: { cameras: 'cameras.bin', images: 'images.bin', points3D: 'points3D.ply' }, splats: [], skipImages: true };
    const saved = { version: 1, viewerVersion: 'test', viewState: null, config: { pointCloud: { minTrackLength: 0 } } };
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => String(url).endsWith('state.json')
      ? Response.json(saved) : new Response(new Uint8Array([1, 2, 3]))));
    if (shared) window.history.replaceState(null, '', '/#' + encodeShareData('https://example.com/manifest.json', null,
      { pointCloud: { minTrackLength: 2 } }));
    usePointCloudStore.getState().setMinTrackLength(2);
    processFilesMock.mockImplementationOnce(async (_files, _range, options) => {
      const reconstruction = buildReconstruction({ points3D: [buildPoint3D({ track: [] })] });
      reconstruction.globalStats.totalPoints = 1;
      useReconstructionStore.getState().setReconstruction(reconstruction);
      options?.onSceneReplaced?.();
    });
    const { result } = renderHook(() => useUrlLoader({ applyUrlOverrides: true }));
    await act(async () => { expect(await result.current.loadFromManifest(manifest)).toBe(true); });
    const warnings = useNotificationStore.getState().notifications.filter(item => item.message.includes('hidden due to min track length'));
    expect(warnings).toHaveLength(shared ? 1 : 0);
    expect(usePointCloudStore.getState().minTrackLength).toBe(shared ? 2 : 0);
    expect(processFilesMock.mock.calls[0][2]).toMatchObject({ deferPointFilterWarning: true });
  });

  it('applies shared link settings after a load even when the dataset has no saved settings', async () => {
    vi.stubGlobal('Blob', NodeBlob);
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

  it.each(['url', 'inline'] as const)('turns away a %s load while another holds the guard, saying so and leaving that load alone', async source => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const holder = useReconstructionStore.getState().tryStartUrlLoad()!;
    const progress = { percent: 40, message: 'Downloading...' };
    useReconstructionStore.setState({ urlLoading: true, urlProgress: progress });
    splatListTimeoutWarning.show();
    const logger = { error: vi.fn(), info: vi.fn() };
    const { result } = renderHook(() => useUrlLoader({ logger }));

    await act(async () => {
      expect(await (source === 'url' ? result.current.loadFromUrl('https://example.com/scene.zip')
        : result.current.loadFromManifest(createDefaultManifest('https://example.com/scene')))).toBe(false);
    });

    expect(logger.info).toHaveBeenCalledExactlyOnceWith(URL_LOAD_GUARD_MESSAGE);
    expect(logger.error).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(processFilesMock).not.toHaveBeenCalled();
    // The holder keeps its guard, overlay and progress, and the warning it may still own.
    expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true, urlProgress: progress, urlLoadActive: true });
    expect(useReconstructionStore.getState().urlLoadController?.signal).toBe(holder);
    expect(holder.aborted).toBe(false);
    expect(splatListTimeoutWarnings()).toHaveLength(1);
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

    // Like processFiles, report the scene this load committed.
    processFilesMock.mockImplementationOnce(async (_files, _range, options) => { options?.onSceneReplaced?.(); });
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
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => String(url).endsWith('colmapview.yaml')
      ? new Response(null, { status: 404 }) : ({
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

  it('clears caches again when a URL load fails after it replaced the scene', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => String(url).endsWith('colmapview.yaml')
      ? new Response(null, { status: 404 }) : ({
        ok: true,
        status: 200,
        statusText: 'OK',
        blob: vi.fn(async () => new Blob(['splat'], { type: 'application/octet-stream' })),
      })));
    // Like processFiles reporting its commit, then failing.
    processFilesMock.mockImplementationOnce(async (_files, _range, options) => {
      options?.onSceneReplaced?.();
      throw new Error('Failed after the scene was replaced');
    });
    const logger = { error: vi.fn(), info: vi.fn() };
    const { result } = renderHook(() => useUrlLoader({ logger }));

    let loaded = true;
    await act(async () => {
      loaded = await result.current.loadFromUrl('https://example.com/scene.spz');
    });

    expect(loaded).toBe(false);
    // Once at the commit, and once more for the failure.
    expect(clearAllCachesMock).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith('[URL Loader] Error:',
      expect.objectContaining({ message: 'Failed after the scene was replaced' }));
  });

  describe('a dataset that settles its splat list and saved settings', () => {
    const baseUrl = 'https://huggingface.co/datasets/owner/wait/resolve/main/';
    const view: CameraViewState = { position: [1, 2, 3], target: [0, 0, 0], quaternion: [0, 0, 0, 1], distance: 4 };

    /** Starts a load whose saved settings answer only when `respond` is called. */
    function startLoadWithPendingSettings() {
      vi.stubGlobal('Blob', NodeBlob);
      let respond!: (response: Response) => void;
      vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).endsWith('colmapview.yaml')) return new Promise<Response>(resolve => { respond = resolve; });
        if (init?.method === 'HEAD') return new Response(null, { headers: { 'content-length': '100' } });
        if (String(url).includes('/api/datasets/')) return Response.json(hubEntries([{ path: 'splats/scene.spz', size: 100 }]));
        return new Response(new Uint8Array([1, 2, 3]));
      }));
      processFilesMock.mockImplementationOnce(async (files, _range, options) => { await processWithStore(files, options); });
      const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
      let pending!: Promise<boolean>;
      act(() => { pending = result.current.loadFromUrl(baseUrl); });
      return { pending, respond: (response: Response) => respond(response) };
    }

    it('keeps the overlay, its Cancel and the parsed scene back until they settle', async () => {
      const load = startLoadWithPendingSettings();
      // Parsed: what follows is the wait for the saved settings.
      await waitFor(() => expect(useReconstructionStore.getState().urlProgress?.percent).toBeGreaterThanOrEqual(90));
      // A drop or another load sees a load running, n waits for it, and nothing of the scene shows yet.
      expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true, urlLoadActive: true, reconstruction: null });
      expect(isReconstructionLoadPending()).toBe(true);

      const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: view,
        config: { splat: { activeSourceId: '' }, camera: { selectedImageId: 7 } } });
      await act(async () => {
        load.respond(new Response(yaml));
        expect(await load.pending).toBe(true);
      });
      const state = useReconstructionStore.getState();
      expect(state.reconstruction).not.toBeNull();
      expect(state.loadedFiles?.splatFileSources).toHaveLength(1);
      expect(state.urlLoading).toBe(false);
      expect(useCameraStore.getState().flyToViewState).toEqual(view);
      expect(useCameraStore.getState().selectedImageId).toBe(7);
    });

    it('leaves no half-loaded scene when cancelled while it settles', async () => {
      // A startup link: the landing page it returns to must not load it again.
      window.history.replaceState(null, '', '/?url=' + encodeURIComponent(baseUrl));
      const load = startLoadWithPendingSettings();
      await waitFor(() => expect(useReconstructionStore.getState().urlProgress?.percent).toBeGreaterThanOrEqual(90));
      act(() => useReconstructionStore.getState().cancelLoading());
      await act(async () => { expect(await load.pending).toBe(false); });
      expect(useReconstructionStore.getState()).toMatchObject({ reconstruction: null, loadedFiles: null, urlLoading: false });
      expect(window.location.search).toBe('');
    });
  });

  it('settles the settings beside an archive before handing its bundled splat to the renderer', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const alignment = { ...createIdentityEuler(), translationX: 5 };
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null, config: { transform: alignment } });
    let respond: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn((url: string | URL) => String(url).endsWith('colmapview.yaml')
      ? new Promise<Response>(resolve => { respond = resolve; }) : Promise.resolve(new Response(null, { status: 404 }))));
    const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin', 'scene.spz'].map(name => [name, new File(['x'], name)]));
    // Like loadZipUrlSource, pass processing the hook the loader gave it.
    vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) =>
      (await deps.processFiles(files, undefined, { throwOnError: true, beforeSceneCommit: deps.beforeSceneCommit })) !== false);
    processFilesMock.mockImplementationOnce(async (incoming, _range, options) => { await processWithStore(incoming, options); });
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromUrl('https://example.com/project/scene.zip'); });
    await waitFor(() => expect(useReconstructionStore.getState().urlProgress?.message).toBe('Loading saved view settings...'));
    // Nothing decodes yet: a Cancel now stops the whole load instead of stranding its settings.
    expect(useReconstructionStore.getState()).toMatchObject({ reconstruction: null, urlLoading: true,
      urlProgress: expect.objectContaining({ message: 'Loading saved view settings...' }) });

    await act(async () => { respond!(new Response(yaml)); expect(await pending).toBe(true); });
    expect(useTransformStore.getState().transform.translationX).toBe(5);
    expect(useReconstructionStore.getState().urlProgress?.message).toBe('Preparing splat renderer...');
    // Cancelling the decode now only chooses None: the load and its restore are done.
    act(() => useReconstructionStore.getState().cancelLoading());
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useTransformStore.getState().transform.translationX).toBe(5);
    const { droppedFiles, getBoundSourceViewerState } = useReconstructionStore.getState();
    expect(getBoundSourceViewerState(droppedFiles!)?.config.transform).toEqual(alignment);
  });

  it('starts a URL load with no splat request left by an earlier dataset', async () => {
    // A startup link's choice whose load failed: nothing else is on screen.
    useReconstructionStore.getState().setRequestedSplatSourceId('scene.spz');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    let requested: string | null | undefined;
    vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) => {
      requested = useReconstructionStore.getState().requestedSplatSourceId;
      return (await deps.processFiles(new Map(), undefined, { throwOnError: true })) !== false;
    });
    processFilesMock.mockResolvedValueOnce();
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    await act(async () => { await result.current.loadFromUrl('https://example.com/scene.tar'); });
    expect(requested).toBeNull();
  });

  it("shows a 3DGS dataset's own default after the previous dataset's iteration_7000 was picked", async () => {
    const early = 'point_cloud/iteration_7000/point_cloud.ply';
    const late = 'point_cloud/iteration_30000/point_cloud.ply';
    const picked = new File(['first early'], 'point_cloud.ply');
    const firstDefault = new File(['first late, larger'], 'point_cloud.ply');
    useReconstructionStore.getState().setLoadedFiles({ ...buildLoadedFiles(), splatFile: firstDefault, splatFiles: [firstDefault, picked],
      splatFileSources: [{ id: late, path: late, file: firstDefault }, { id: early, path: early, file: picked }] });
    await act(async () => { await useReconstructionStore.getState().selectSplatSource(early); });
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(picked);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    const nextDefault = new File(['next late, the largest of them all'], 'point_cloud.ply');
    const files = new Map<string, File>([
      ...['cameras.bin', 'images.bin', 'points3D.bin'].map(name => [name, new File(['x'], name)] as const),
      [late, nextDefault], [early, new File(['next early'], 'point_cloud.ply')]]);
    vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) =>
      (await deps.processFiles(files, undefined, { throwOnError: true, beforeSceneCommit: deps.beforeSceneCommit })) !== false);
    processFilesMock.mockImplementationOnce(async (incoming, _range, options) => { await processWithStore(incoming, options); });
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    await act(async () => { expect(await result.current.loadFromUrl('https://example.com/next.zip')).toBe(true); });
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(nextDefault);
  });

  it("commits a startup link's None without handing the archive's default splat to the renderer", async () => {
    window.history.replaceState(null, '', '/#' + encodeShareData('https://example.com/scene.tar', null,
      { splat: { activeSourceId: '' } }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin', 'default.spz']
      .map(name => [name, new File(['incoming'], name)]));
    vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) =>
      (await deps.processFiles(files, undefined, { throwOnError: true })) !== false);
    processFilesMock.mockImplementationOnce(async (incoming, _range, options) => { await processWithStore(incoming, options); });
    const shown: Array<string | undefined> = [];
    const progress: Array<string | undefined> = [];
    const unsubscribe = useReconstructionStore.subscribe(state => {
      shown.push(state.loadedFiles?.splatFile?.name);
      progress.push(state.urlProgress?.message);
    });
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger, applyUrlOverrides: true }));
    try {
      await act(async () => { expect(await result.current.loadFromUrl('https://example.com/scene.tar')).toBe(true); });
    } finally { unsubscribe(); }
    expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(1);
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(shown).not.toContain('default.spz');
    expect(progress).not.toContain('Preparing splat renderer...');
    expect(useReconstructionStore.getState().requestedSplatSourceId).toBeNull();
  });

  it('keeps the overlay and its Cancel for a tile picked while the restored splat downloads', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const baseUrl = 'https://huggingface.co/datasets/owner/pick/resolve/main/';
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'splats/a.spz' } } });
    const pendingFetch = buildPendingFetch();
    const downloadRequest = (path: string) => pendingFetch.requests.find(({ url }) => url === baseUrl + path);
    vi.stubGlobal('fetch', vi.fn((url: string | URL, init?: RequestInit): Promise<Response> => {
      if (String(url).endsWith('colmapview.yaml')) return Promise.resolve(new Response(yaml));
      if (init?.method === 'HEAD') return Promise.resolve(new Response(null, { headers: { 'content-length': '100' } }));
      // Like fetch, a splat download rejects once its signal aborts.
      if (String(url).endsWith('.spz')) return pendingFetch.fetch(String(url), init);
      if (String(url).includes('/api/datasets/')) return Promise.resolve(Response.json(hubEntries([
        { path: 'splats/a.spz', size: 100 }, { path: 'splats/b.spz', size: 100 }])));
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
    }));
    processFilesMock.mockImplementationOnce(async () => { useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles()); });
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromUrl(baseUrl); });
    await waitFor(() => expect(Boolean(downloadRequest('splats/a.spz'))).toBe(true));
    // What n does during the restore: pick the next tile, which cancels the restored download.
    act(() => { void useReconstructionStore.getState().selectSplatSource('splats/b.spz'); });
    await act(async () => { expect(await pending).toBe(true); });

    expect(downloadRequest('splats/a.spz')?.signal?.aborted).toBe(true);
    expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true,
      urlProgress: expect.objectContaining({ currentFile: 'b.spz' }) });
    act(() => useReconstructionStore.getState().cancelLoading());
    expect(downloadRequest('splats/b.spz')?.signal?.aborted).toBe(true);
    expect(useReconstructionStore.getState().urlLoading).toBe(false);
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
      if (String(url).endsWith('colmapview.yaml')) return new Response(null, { status: 404 });
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
