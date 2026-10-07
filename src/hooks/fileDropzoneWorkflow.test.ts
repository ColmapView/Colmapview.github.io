import { describe, expect, it, vi } from 'vitest';
import type { LoadedFiles, Reconstruction } from '../types/colmap';
import { noopLogger, type AppLogger } from '../utils/logger';
import type { FileDropzoneWorkflowDeps } from './fileDropzoneWorkflow';
import { processFileDropzoneFiles } from './fileDropzoneWorkflow';
import { ReconstructionService, ReconstructionSnapshot } from '../wasm/reconstructionService';
import { cancelPendingReconstructionLoad } from '../wasm/reconstructionLoadLifecycle';
import {
  applyDeletionsToData, applyTransformToData, confirmReload, hasUnsavedReloadState,
  useDeletionStore, useReconstructionStore, useTransformStore, useUIStore, usePointCloudStore,
} from '../store';
import { applySavedViewerState, applyShareConfig } from './useUrlState';
import { registerConfirmationHandler } from '../utils/confirmation';
import { createIdentityEuler } from '../utils/sim3dTransforms';
import { serializeDatasetViewerSettings } from '../utils/datasetViewerSettings';
import { getShareActiveSplatSourceId } from '../utils/splatFileSourcePolicy';
import { buildImage, buildPoint3D, buildReconstruction as buildTestReconstruction, buildWasmReconstructionWrapper } from '../test/builders';
import type { PublishedViewerState } from '../utils/publishedViewerState';

function file(name: string): File {
  return new File([''], name);
}

function genericPointCloudPly(name = 'points.ply'): File {
  return new File([[
    'ply',
    'format ascii 1.0',
    'element vertex 1',
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    'end_header',
    '1 2 3 10 20 30',
    '',
  ].join('\n')], name);
}

function loadedFiles(overrides: Partial<NonNullable<ReturnType<FileDropzoneWorkflowDeps['getLoadedFiles']>>> = {}) {
  return {
    camerasFile: file('cameras.bin'),
    imagesFile: file('images.bin'),
    points3DFile: file('points3D.bin'),
    splatFile: undefined,
    rigsFile: undefined,
    framesFile: undefined,
    imageFiles: new Map<string, File>(),
    hasMasks: false,
    ...overrides,
  };
}

function createLogger(): AppLogger {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

function createReconstruction(): Reconstruction {
  return {
    cameras: new Map(),
    images: new Map([
      [1, {
        imageId: 1,
        cameraId: 1,
        name: 'image.jpg',
        qvec: [1, 0, 0, 0],
        tvec: [0, 0, 0],
        points2D: [],
      }],
    ]),
    imageStats: new Map(),
    connectedImagesIndex: new Map(),
    globalStats: {
      avgError: 0,
      avgTrackLength: 0,
      maxError: 0,
      maxTrackLength: 0,
      minError: 0,
      minTrackLength: 0,
      totalObservations: 0,
      totalPoints: 0,
    },
    imageToPoint3DIds: new Map(),
  };
}

function createDeps(overrides: Partial<FileDropzoneWorkflowDeps> = {}): FileDropzoneWorkflowDeps {
  return {
    addNotification: vi.fn(),
    clearSplatPsnr: vi.fn(),
    clearCaches: vi.fn(),
    delay: vi.fn(async () => undefined),
    getFailedImageCount: vi.fn(() => 0),
    getLoadedFiles: vi.fn(() => null),
    getMinTrackLength: vi.fn(() => 1),
    getSourceInfo: vi.fn(() => ({ imageUrlBase: null, sourceType: 'local' as const })),
    getUrlLoading: vi.fn(() => false),
    logger: noopLogger,
    resetView: vi.fn(),
    preloadSplatRuntime: vi.fn(async () => undefined),
    setDroppedFiles: vi.fn(),
    setError: vi.fn(),
    setLoadedFiles: vi.fn(),
    setReconstruction: vi.fn(),
    setUrlLoading: vi.fn(),
    setUrlProgress: vi.fn(),
    setWasmReconstruction: vi.fn(),
    ...overrides,
  };
}

/** A loaded-files store that, like the real one, reads back what the workflow committed. */
function loadedFilesStore(initial: LoadedFiles | null) {
  let current = initial;
  return {
    getLoadedFiles: vi.fn(() => current),
    setLoadedFiles: vi.fn((files: LoadedFiles) => { current = files; }),
  };
}

function workerLoadFixture() {
  const files = {
    camerasFile: file('cameras.bin'), imagesFile: file('images.bin'), points3DFile: file('points3D.bin'),
  };
  const service = new ReconstructionService(files);
  const reconstruction = createReconstruction();
  const snapshot = new ReconstructionSnapshot({
    revision: 1, reconstruction, positions: new Float32Array(), colors: new Float32Array(), errors: new Float32Array(),
    trackLengths: new Uint32Array(), point3DIds: new BigUint64Array(), boundingBox: null, warnings: [],
    diagnostics: { parser: 'wasm', parseMs: 0, statisticsMs: 0, snapshotMs: 0, renderBytes: 0, wasmHeapBytes: null, retainedImageBufferBytes: 0 },
  }, service);
  return {
    service, reconstruction, snapshot,
    files: new Map(Object.values(files).map(value => [value.name, value])),
    parseResult: {
      cameras: reconstruction.cameras, images: reconstruction.images,
      wasmWrapper: snapshot, reconstructionSnapshot: snapshot, usedWasmPath: true,
    },
  };
}

describe('file dropzone workflow', () => {
  it('restores the selected splat and alignment from a wrapped project folder', async () => {
    const fixture = workerLoadFixture();
    const preferred = new File(['a'.repeat(20)], 'default.spz');
    const active = new File(['b'.repeat(10)], 'active.spz');
    const alignment = { ...createIdentityEuler(), translationX: 7, rotationZ: 1 };
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'splats/active.spz', transform: alignment } } });
    const files = new Map([...fixture.files].map(([path, value]) => ['project/' + path, value]));
    files.set('project/splats/default.spz', preferred);
    files.set('project/splats/active.spz', active);
    files.set('project/colmapview.yaml', Object.assign(file('colmapview.yaml'), { text: async () => yaml }));
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    try {
      const deps = createDeps({ parseFiles: async () => fixture.parseResult,
        setLoadedFiles: useReconstructionStore.getState().setLoadedFiles,
        onViewerState: state => applyShareConfig(state.config) });
      expect(await processFileDropzoneFiles(files, deps)).toBe(true);
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(active);
      expect(useTransformStore.getState().splatTransform).toEqual(alignment);
    } finally {
      fixture.service.dispose();
      useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
      useTransformStore.setState(useTransformStore.getInitialState(), true);
      useUIStore.setState(useUIStore.getInitialState(), true);
      usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    }
  });
  it.each(['colmap', 'splats', 'images', 'settings-only'] as const)('restores project YAML after a successful %s load', async mode => {
    const fixture = workerLoadFixture();
    const files = mode === 'colmap' ? fixture.files : new Map<string, File>();
    if (mode === 'splats') files.set('scene.spz', file('scene.spz'));
    if (mode === 'images') files.set('photo.jpg', file('photo.jpg'));
    const settings = Object.assign(file('colmapview.yaml'), { text: async () => 'ui:\n  background_color: "#123456"\nview_state:\n  position: [1, 2, 3]\n  target: [0, 0, 0]\n  quaternion: [0, 0, 0, 1]\n  distance: 4\n' });
    files.set('project/colmapview.yaml', settings);
    const sequence: string[] = [];
    const onViewerState = vi.fn(() => { sequence.push('settings'); });
    const importConfig = vi.fn();
    const deps = createDeps({ parseFiles: async () => fixture.parseResult, importConfig,
      resetView: () => { sequence.push('reset'); }, onViewerState });
    expect(await processFileDropzoneFiles(files, deps)).toBe(true);
    expect(onViewerState).toHaveBeenCalledWith(expect.objectContaining({ config: { ui: { backgroundColor: '#123456' } },
      viewState: { position: [1, 2, 3], target: [0, 0, 0], quaternion: [0, 0, 0, 1], distance: 4 } }));
    expect(sequence).toEqual(mode === 'settings-only' ? ['settings'] : ['reset', 'settings']);
    expect(importConfig).not.toHaveBeenCalled();
    fixture.service.dispose();
  });

  it.each(['invalid', 'oversized', 'unreadable'] as const)('skips %s project YAML without failing dataset loading', async mode => {
    const fixture = workerLoadFixture();
    const text = vi.fn(async () => { if (mode === 'unreadable') throw new Error('Read failed'); return 'version: 99'; });
    const settings = Object.assign(new File([mode === 'oversized' ? 'x'.repeat(256 * 1024 + 1) : ''], 'colmapview.yaml'), { text });
    fixture.files.set('colmapview.yaml', settings);
    const onViewerState = vi.fn();
    const deps = createDeps({ parseFiles: async () => fixture.parseResult, onViewerState });
    expect(await processFileDropzoneFiles(fixture.files, deps)).toBe(true);
    expect(deps.setReconstruction).toHaveBeenCalled();
    expect(deps.setError).not.toHaveBeenCalled();
    expect(onViewerState).not.toHaveBeenCalled();
    if (mode === 'oversized') expect(text).not.toHaveBeenCalled();
    fixture.service.dispose();
  });

  it.each(['invalid', 'oversized', 'unreadable'] as const)('falls back past %s project YAML to the settings from its source, warning once', async mode => {
    const fixture = workerLoadFixture();
    // Read in full, the oversized file would be valid settings of its own.
    const text = vi.fn(async () => {
      if (mode === 'unreadable') throw new Error('Read failed');
      return mode === 'invalid' ? 'version: 99' : 'ui:\n  background_color: "#222222"\n';
    });
    fixture.files.set('colmapview.yaml', Object.assign(new File([mode === 'oversized' ? 'x'.repeat(256 * 1024 + 1) : ''], 'colmapview.yaml'), { text }));
    const fromSource: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null, config: { ui: { backgroundColor: '#111111' } } };
    const logger = createLogger();
    const onViewerState = vi.fn();
    const deps = createDeps({ parseFiles: async () => fixture.parseResult, logger, onViewerState });
    expect(await processFileDropzoneFiles(fixture.files, deps, { viewerState: fromSource })).toBe(true);
    expect(onViewerState).toHaveBeenCalledExactlyOnceWith(fromSource);
    expect(vi.mocked(logger.warn).mock.calls.filter(([message]) => String(message).includes('colmapview.yaml')))
      .toEqual([['[Dataset Loader] Skipping unavailable or invalid colmapview.yaml settings.']]);
    fixture.service.dispose();
  });

  it('does not restore project settings when their load is cancelled', async () => {
    let finish!: (text: string) => void;
    const text = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    const settings = Object.assign(file('colmapview.yaml'), { text });
    const deps = createDeps({ onViewerState: vi.fn() });
    const running = processFileDropzoneFiles(new Map([['colmapview.yaml', settings]]), deps);
    await vi.waitFor(() => expect(text).toHaveBeenCalled());
    cancelPendingReconstructionLoad();
    finish('ui:\n  background_color: "#123456"');
    expect(await running).toBe(false);
    expect(deps.onViewerState).not.toHaveBeenCalled();
  });

  it.each(['worker', 'main-thread-fallback'] as const)('installs %s snapshots with only the required current-thread paint delay', async mode => {
    const fixture = workerLoadFixture();
    fixture.service.mode = mode;
    const calls: string[] = [];
    const deps = createDeps({
      parseFiles: vi.fn(async () => fixture.parseResult),
      clearCaches: vi.fn(() => calls.push('clear')),
      setWasmReconstruction: vi.fn(() => calls.push('source')),
      setReconstruction: vi.fn(() => calls.push('reconstruction')),
    });
    expect(await processFileDropzoneFiles(fixture.files, deps)).toBe(true);
    if (mode === 'worker') expect(deps.delay).not.toHaveBeenCalled();
    else expect(deps.delay).toHaveBeenCalledWith(200);
    expect(calls).toEqual(['clear', 'source', 'reconstruction']);
    fixture.service.dispose();
  });

  it('checks generation before clearing caches or installing a worker snapshot even without a paint delay', async () => {
    const fixture = workerLoadFixture();
    let finishBuild!: (value: { reconstruction: Reconstruction; pointCount: number }) => void;
    const buildReconstruction = vi.fn(() => new Promise<{ reconstruction: Reconstruction; pointCount: number }>(resolve => {
      finishBuild = resolve;
    }));
    const deps = createDeps({ parseFiles: vi.fn(async () => fixture.parseResult), buildReconstruction });
    const loading = processFileDropzoneFiles(fixture.files, deps);
    await vi.waitFor(() => expect(buildReconstruction).toHaveBeenCalledOnce());
    cancelPendingReconstructionLoad();
    finishBuild({ reconstruction: fixture.reconstruction, pointCount: 0 });
    expect(await loading).toBe(false);
    expect(deps.delay).not.toHaveBeenCalled();
    expect(deps.clearCaches).not.toHaveBeenCalled();
    expect(deps.setWasmReconstruction).not.toHaveBeenCalled();
    expect(deps.setReconstruction).not.toHaveBeenCalled();
    expect(fixture.service.isDisposed).toBe(true);
  });

  it.each(['parse', 'build', 'abort'] as const)('preserves an edited worker scene when replacement ends during %s', async phase => {
    useReconstructionStore.getState().clear();
    const previous = workerLoadFixture();
    const staged = workerLoadFixture();
    const state = useReconstructionStore.getState();
    const previousFiles = loadedFiles({
      camerasFile: previous.files.get('cameras.bin'), imagesFile: previous.files.get('images.bin'),
      points3DFile: previous.files.get('points3D.bin'),
    });
    state.setLoadedFiles(previousFiles);
    state.setWasmReconstruction(previous.snapshot);
    state.setReconstruction(previous.reconstruction, { edited: true });
    state.setSourceInfo('url', 'https://example.com/old/', 'https://example.com/old/images/');
    const editRevision = useReconstructionStore.getState().reconstructionEditRevision;
    const controller = new AbortController();
    let nativeSignal: AbortSignal | undefined;
    const parseFiles = vi.fn(async ({ signal }) => {
      nativeSignal = signal;
      if (phase === 'parse') throw new Error('invalid replacement');
      if (phase === 'abort') controller.abort();
      return staged.parseResult;
    });
    const onSceneReplaced = vi.fn(() => state.setSourceInfo('url', 'https://example.com/new/'));
    const deps = createDeps({
      parseFiles, buildReconstruction: vi.fn(async () => { throw new Error('invalid statistics'); }),
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      setDroppedFiles: state.setDroppedFiles, setLoadedFiles: state.setLoadedFiles,
      setWasmReconstruction: state.setWasmReconstruction, setReconstruction: state.setReconstruction,
    });
    try {
      expect(await processFileDropzoneFiles(staged.files, deps, { signal: controller.signal, onSceneReplaced })).toBe(false);
      expect(useReconstructionStore.getState()).toMatchObject({
        loadedFiles: previousFiles, wasmReconstruction: previous.snapshot, reconstruction: previous.reconstruction,
        sourceUrl: 'https://example.com/old/', imageUrlBase: 'https://example.com/old/images/', reconstructionEditRevision: editRevision,
      });
      expect(previous.service.isDisposed).toBe(false);
      expect(onSceneReplaced).not.toHaveBeenCalled();
      expect(deps.clearCaches).not.toHaveBeenCalled();
      expect(deps.clearSplatPsnr).not.toHaveBeenCalled();
      if (phase === 'abort') expect(nativeSignal?.aborted).toBe(true);
      if (phase !== 'parse') expect(staged.service.isDisposed).toBe(true);
    } finally {
      useReconstructionStore.getState().clear();
      staged.service.dispose();
    }
  });

  it('commits a completed replacement and disposes the previous snapshot only after building succeeds', async () => {
    useReconstructionStore.getState().clear();
    const previous = workerLoadFixture();
    const staged = workerLoadFixture();
    const state = useReconstructionStore.getState();
    const previousFiles = loadedFiles({ camerasFile: previous.files.get('cameras.bin'),
      imagesFile: previous.files.get('images.bin'), points3DFile: previous.files.get('points3D.bin') });
    state.setLoadedFiles(previousFiles);
    state.setWasmReconstruction(previous.snapshot);
    state.setReconstruction(previous.reconstruction, { edited: true });
    const disposePrevious = vi.spyOn(previous.snapshot, 'dispose');
    let finishBuild!: (result: { reconstruction: Reconstruction; pointCount: number }) => void;
    const buildReconstruction = vi.fn(() => new Promise<{ reconstruction: Reconstruction; pointCount: number }>(resolve => { finishBuild = resolve; }));
    const onSceneReplaced = vi.fn(() => state.setSourceInfo('url', 'https://example.com/new/'));
    const deps = createDeps({
      parseFiles: vi.fn(async () => staged.parseResult), buildReconstruction,
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      setDroppedFiles: state.setDroppedFiles, setLoadedFiles: state.setLoadedFiles,
      setWasmReconstruction: state.setWasmReconstruction, setReconstruction: state.setReconstruction,
    });
    try {
      const loading = processFileDropzoneFiles(staged.files, deps, { onSceneReplaced });
      await vi.waitFor(() => expect(buildReconstruction).toHaveBeenCalledOnce());
      expect(useReconstructionStore.getState().loadedFiles).toBe(previousFiles);
      expect(disposePrevious).not.toHaveBeenCalled();
      expect(onSceneReplaced).not.toHaveBeenCalled();
      finishBuild({ reconstruction: staged.reconstruction, pointCount: 0 });
      expect(await loading).toBe(true);
      expect(disposePrevious).toHaveBeenCalledOnce();
      expect(useReconstructionStore.getState().wasmReconstruction).toBe(staged.snapshot);
      expect(useReconstructionStore.getState().loadedFiles?.camerasFile).toBe(staged.files.get('cameras.bin'));
      expect(useReconstructionStore.getState().sourceUrl).toBe('https://example.com/new/');
      expect(useReconstructionStore.getState().reconstructionEditRevision).toBe(0);
    } finally { useReconstructionStore.getState().clear(); }
  });

  it.each(['None', 'alternate'] as const)('retains a user %s choice when COLMAP parsing finishes with a default splat', async choice => {
    useReconstructionStore.getState().clear();
    const fixture = workerLoadFixture();
    const state = useReconstructionStore.getState();
    const alternate = new File(['alt'], 'alternate.spz');
    state.setLoadedFiles(loadedFiles({ splatFile: alternate, splatFiles: [alternate],
      splatFileSources: [{ id: 'splats/alternate.spz', path: 'splats/alternate.spz', file: alternate }] }));
    const incomingAlternate = new File(['new-alt'], 'alternate.spz');
    fixture.files.set('splats/default.spz', new File(['much-larger-default'], 'default.spz'));
    fixture.files.set('splats/alternate.spz', incomingAlternate);
    let finishBuild!: (result: { reconstruction: Reconstruction; pointCount: number }) => void;
    const buildReconstruction = vi.fn(() => new Promise<{ reconstruction: Reconstruction; pointCount: number }>(resolve => { finishBuild = resolve; }));
    const deps = createDeps({
      parseFiles: vi.fn(async () => fixture.parseResult), buildReconstruction,
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      getSplatSelectionState: () => ({ revision: useReconstructionStore.getState().splatSelectionRevision,
        sourceId: getShareActiveSplatSourceId(useReconstructionStore.getState().loadedFiles) ?? undefined }),
      setLoadedFiles: state.setLoadedFiles, setWasmReconstruction: state.setWasmReconstruction,
      setReconstruction: state.setReconstruction,
    });
    try {
      const pending = processFileDropzoneFiles(fixture.files, deps);
      await vi.waitFor(() => expect(buildReconstruction).toHaveBeenCalledOnce());
      await state.selectSplatSource(choice === 'None' ? '' : 'splats/alternate.spz');
      finishBuild({ reconstruction: fixture.reconstruction, pointCount: 0 });
      expect(await pending).toBe(true);
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(choice === 'None' ? undefined : incomingAlternate);
      if (choice === 'None') expect(deps.setUrlProgress).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'Preparing splat renderer...' }));
    } finally { useReconstructionStore.getState().clear(); }
  });

  it('keeps the default splat when parsing ends after a tile of the replaced scene was chosen', async () => {
    useReconstructionStore.getState().clear();
    const fixture = workerLoadFixture();
    const state = useReconstructionStore.getState();
    const replacedA = new File(['old-a'], 'a.spz');
    const replacedB = new File(['old-b'], 'b.spz');
    state.setLoadedFiles(loadedFiles({ splatFile: replacedA, splatFiles: [replacedA, replacedB], splatFileSources: [
      { id: 'old/a.spz', path: 'old/a.spz', file: replacedA }, { id: 'old/b.spz', path: 'old/b.spz', file: replacedB }] }));
    const incomingDefault = new File(['incoming-default'], 'default.spz');
    fixture.files.set('splats/default.spz', incomingDefault);
    let finishBuild!: (result: { reconstruction: Reconstruction; pointCount: number }) => void;
    const buildReconstruction = vi.fn(() => new Promise<{ reconstruction: Reconstruction; pointCount: number }>(resolve => { finishBuild = resolve; }));
    const deps = createDeps({
      parseFiles: vi.fn(async () => fixture.parseResult), buildReconstruction,
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      getSplatSelectionState: () => ({ revision: useReconstructionStore.getState().splatSelectionRevision,
        sourceId: getShareActiveSplatSourceId(useReconstructionStore.getState().loadedFiles) ?? undefined }),
      setLoadedFiles: state.setLoadedFiles, setWasmReconstruction: state.setWasmReconstruction,
      setReconstruction: state.setReconstruction,
    });
    try {
      const pending = processFileDropzoneFiles(fixture.files, deps);
      await vi.waitFor(() => expect(buildReconstruction).toHaveBeenCalledOnce());
      // Only a splat picker left open can choose during a load (`n` is ignored then): it picks another tile on screen.
      await state.selectSplatSource('old/b.spz');
      finishBuild({ reconstruction: fixture.reconstruction, pointCount: 0 });
      expect(await pending).toBe(true);
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(incomingDefault);
      expect(useReconstructionStore.getState().requestedSplatSourceId).toBeNull();
      expect(deps.setUrlProgress).toHaveBeenCalledWith(expect.objectContaining({ message: 'Preparing splat renderer...' }));
    } finally {
      fixture.service.dispose();
      useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
      useTransformStore.setState(useTransformStore.getInitialState(), true);
      useUIStore.setState(useUIStore.getInitialState(), true);
      usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    }
  });

  /**
   * Replaces a scene showing old/a.spz with files whose own colmapview.yaml selects saved.spz rather than their
   * default, making `choice` on the scene on screen while they parse. Of its other tiles, old/c.spz names no
   * incoming file, b.spz shares its file name with the incoming splats/b.spz, and splats/alternate.spz is an
   * incoming id. Returns the splat the load leaves showing.
   */
  async function replaceSceneWhileChoosing(choice: string) {
    useReconstructionStore.getState().clear();
    const fixture = workerLoadFixture();
    const state = useReconstructionStore.getState();
    const replaced = ['old/a.spz', 'old/c.spz', 'b.spz', 'splats/alternate.spz'].map(path =>
      ({ id: path, path, file: new File([`old ${path}`], path.slice(path.lastIndexOf('/') + 1)) }));
    state.setLoadedFiles(loadedFiles({ splatFile: replaced[0].file, splatFiles: replaced.map(source => source.file),
      splatFileSources: replaced }));
    const incoming = { saved: new File(['saved'], 'saved.spz'), alternate: new File(['new-alt'], 'alternate.spz'),
      b: new File(['new-b'], 'b.spz') };
    fixture.files.set('splats/default.spz', new File(['much-larger-default'], 'default.spz'));
    fixture.files.set('splats/saved.spz', incoming.saved);
    fixture.files.set('splats/alternate.spz', incoming.alternate);
    fixture.files.set('splats/b.spz', incoming.b);
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'splats/saved.spz' } } });
    fixture.files.set('colmapview.yaml', Object.assign(file('colmapview.yaml'), { text: async () => yaml }));
    const startRevision = useReconstructionStore.getState().splatSelectionRevision;
    let finishBuild!: (result: { reconstruction: Reconstruction; pointCount: number }) => void;
    const buildReconstruction = vi.fn(() => new Promise<{ reconstruction: Reconstruction; pointCount: number }>(resolve => { finishBuild = resolve; }));
    const deps = createDeps({
      parseFiles: vi.fn(async () => fixture.parseResult), buildReconstruction,
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      getSplatSelectionState: () => ({ revision: useReconstructionStore.getState().splatSelectionRevision,
        sourceId: getShareActiveSplatSourceId(useReconstructionStore.getState().loadedFiles) ?? undefined }),
      setLoadedFiles: state.setLoadedFiles, setWasmReconstruction: state.setWasmReconstruction,
      setReconstruction: state.setReconstruction,
      // Restores like a local drop: against the revision the load started at, unless the workflow passes another.
      onViewerState: (viewerState, revision = startRevision) => applySavedViewerState(viewerState, null, undefined, revision),
    });
    try {
      const pending = processFileDropzoneFiles(fixture.files, deps);
      await vi.waitFor(() => expect(buildReconstruction).toHaveBeenCalledOnce());
      await state.selectSplatSource(choice);
      finishBuild({ reconstruction: fixture.reconstruction, pointCount: 0 });
      expect(await pending).toBe(true);
      return { incoming, shown: useReconstructionStore.getState().loadedFiles?.splatFile };
    } finally {
      fixture.service.dispose();
      useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
      useTransformStore.setState(useTransformStore.getInitialState(), true);
      useUIStore.setState(useUIStore.getInitialState(), true);
      usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    }
  }

  it('restores the splat the incoming colmapview.yaml selects after a tile of the replaced scene was chosen', async () => {
    // A splat picker left open over the load picks a tile of the scene being replaced.
    const { incoming, shown } = await replaceSceneWhileChoosing('old/c.spz');
    expect(shown).toBe(incoming.saved);
  });

  it('keeps the incoming splat named like the picked tile over the incoming colmapview.yaml', async () => {
    // The pick names splats/b.spz by its file name, so the store shows that splat at commit.
    const { incoming, shown } = await replaceSceneWhileChoosing('b.spz');
    expect(shown).toBe(incoming.b);
  });

  it.each(['None', 'an incoming splat'] as const)('lets %s chosen during the load win over the incoming colmapview.yaml', async choice => {
    const { incoming, shown } = await replaceSceneWhileChoosing(choice === 'None' ? '' : 'splats/alternate.spz');
    expect(shown).toBe(choice === 'None' ? undefined : incoming.alternate);
  });

  it('replaces the scene only once beforeSceneCommit settles after parsing', async () => {
    const fixture = workerLoadFixture();
    const order: string[] = [];
    let settle!: () => void;
    const deps = createDeps({
      parseFiles: vi.fn(async () => { order.push('parse'); return fixture.parseResult; }),
      buildReconstruction: vi.fn(async () => ({ reconstruction: fixture.reconstruction, pointCount: 0 })),
      setLoadedFiles: vi.fn(() => { order.push('commit'); }),
    });
    try {
      const pending = processFileDropzoneFiles(fixture.files, deps, {
        beforeSceneCommit: () => new Promise<void>(resolve => { order.push('settle'); settle = resolve; }),
      });
      await vi.waitFor(() => expect(order).toEqual(['parse', 'settle']));
      // The overlay stays up meanwhile: nothing has ended the loading state.
      expect(deps.setUrlLoading).not.toHaveBeenCalledWith(false);
      settle();
      expect(await pending).toBe(true);
      expect(order).toEqual(['parse', 'settle', 'commit']);
    } finally {
      fixture.service.dispose();
    }
  });

  it('keeps the previous scene when the load is cancelled while the new one settles', async () => {
    const fixture = workerLoadFixture();
    const controller = new AbortController();
    const deps = createDeps({
      parseFiles: vi.fn(async () => fixture.parseResult),
      buildReconstruction: vi.fn(async () => ({ reconstruction: fixture.reconstruction, pointCount: 0 })),
    });
    const dispose = vi.spyOn(fixture.snapshot, 'dispose');
    try {
      const pending = processFileDropzoneFiles(fixture.files, deps, {
        signal: controller.signal,
        beforeSceneCommit: () => new Promise<void>((_resolve, reject) => {
          controller.signal.addEventListener('abort', () => reject(controller.signal.reason));
          controller.abort();
        }),
      });
      expect(await pending).toBe(false);
      expect(deps.setLoadedFiles).not.toHaveBeenCalled();
      expect(deps.setReconstruction).not.toHaveBeenCalled();
      expect(dispose).toHaveBeenCalled();
    } finally {
      fixture.service.dispose();
    }
  });

  it('preserves the previous files, source and snapshot after a malformed point-cloud-only replacement', async () => {
    useReconstructionStore.getState().clear();
    const previous = workerLoadFixture();
    const state = useReconstructionStore.getState();
    const previousFiles = loadedFiles({ camerasFile: previous.files.get('cameras.bin'),
      imagesFile: previous.files.get('images.bin'), points3DFile: previous.files.get('points3D.bin') });
    state.setLoadedFiles(previousFiles);
    state.setWasmReconstruction(previous.snapshot);
    state.setDroppedFiles(previous.files);
    state.setSourceInfo('url', 'https://example.com/old/');
    const onSceneReplaced = vi.fn(() => state.setSourceInfo('url', 'https://example.com/new/'));
    const deps = createDeps({
      classifyPlyFile: vi.fn(async () => 'point-cloud' as const),
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      setLoadedFiles: state.setLoadedFiles, setDroppedFiles: state.setDroppedFiles,
      setWasmReconstruction: state.setWasmReconstruction, setReconstruction: state.setReconstruction,
    });
    const malformed = new File(['ply\nformat unsupported 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n'], 'invalid.ply');
    try {
      expect(await processFileDropzoneFiles(new Map([['invalid.ply', malformed]]), deps, { onSceneReplaced })).toBe(false);
      expect(useReconstructionStore.getState()).toMatchObject({ loadedFiles: previousFiles,
        droppedFiles: previous.files, wasmReconstruction: previous.snapshot, sourceUrl: 'https://example.com/old/' });
      expect(previous.service.isDisposed).toBe(false);
      expect(onSceneReplaced).not.toHaveBeenCalled();
      expect(deps.clearCaches).not.toHaveBeenCalled();
    } finally { useReconstructionStore.getState().clear(); }
  });

  it.each(['splat', 'point cloud', 'images'] as const)('disposes a previous legacy WASM wrapper only when a new %s scene commits', async kind => {
    useReconstructionStore.getState().clear();
    const state = useReconstructionStore.getState();
    const previousWasm = buildWasmReconstructionWrapper();
    const dispose = vi.spyOn(previousWasm, 'dispose');
    state.setLoadedFiles(loadedFiles());
    state.setWasmReconstruction(previousWasm);
    const incoming = kind === 'splat' ? new File(['splat'], 'new.spz')
      : kind === 'point cloud' ? genericPointCloudPly() : file('image.jpg');
    const deps = createDeps({
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      setLoadedFiles: state.setLoadedFiles, setWasmReconstruction: state.setWasmReconstruction,
      setReconstruction: state.setReconstruction,
    });
    try {
      expect(await processFileDropzoneFiles(new Map([[incoming.name, incoming]]), deps, { replaceSplatScene: true })).toBe(true);
      expect(useReconstructionStore.getState().wasmReconstruction).toBeNull();
      expect(dispose).toHaveBeenCalledOnce();
    } finally { useReconstructionStore.getState().clear(); }
  });

  it('applies config-only drops without entering reconstruction parsing', async () => {
    const importConfig = vi.fn(async () => ({ applied: false, errorMessage: 'Config error: invalid' }));
    const parseFiles = vi.fn();
    const deps = createDeps({ importConfig, parseFiles });

    const result = await processFileDropzoneFiles(new Map([['viewer.yaml', file('viewer.yaml')]]), deps);

    expect(result).toBe(false);
    expect(importConfig).toHaveBeenCalledWith(expect.any(File), {
      logErrors: true,
      signal: expect.any(AbortSignal),
    });
    expect(deps.setError).toHaveBeenCalledWith('Config error: invalid');
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
    expect(deps.setDroppedFiles).not.toHaveBeenCalled();
    expect(parseFiles).not.toHaveBeenCalled();
  });

  it('does not install files or clear a newer load after a stale config read completes', async () => {
    let finishConfig!: (result: { applied: boolean }) => void;
    const importConfig = vi.fn(() => new Promise<{ applied: boolean }>(resolve => {
      finishConfig = resolve;
    }));
    const staleDeps = createDeps({ importConfig });
    const staleFiles = new Map([
      ['viewer.yaml', file('viewer.yaml')],
      ['cameras.bin', file('cameras.bin')],
      ['images.bin', file('images.bin')],
      ['points3D.bin', file('points3D.bin')],
    ]);
    const staleLoad = processFileDropzoneFiles(staleFiles, staleDeps);
    await vi.waitFor(() => expect(importConfig).toHaveBeenCalledOnce());

    const currentDeps = createDeps();
    const currentFile = file('current.jpg');
    expect(await processFileDropzoneFiles(new Map([['images/current.jpg', currentFile]]), currentDeps)).toBe(true);
    finishConfig({ applied: true });

    expect(await staleLoad).toBe(false);
    expect(staleDeps.setDroppedFiles).not.toHaveBeenCalled();
    expect(staleDeps.setLoadedFiles).not.toHaveBeenCalled();
    expect(staleDeps.setReconstruction).not.toHaveBeenCalled();
    expect(staleDeps.clearCaches).not.toHaveBeenCalled();
    expect(staleDeps.setUrlLoading).not.toHaveBeenCalledWith(false);
    expect(currentDeps.setLoadedFiles).toHaveBeenCalledOnce();
  });

  it('runs COLMAP parsing through injected workflow dependencies', async () => {
    const logger = createLogger();
    const reconstruction = createReconstruction();
    const parseResult = {
      cameras: new Map(),
      images: reconstruction.images,
      points3D: new Map(),
      wasmWrapper: null,
      usedWasmPath: false,
    };
    const parseFiles = vi.fn(async () => parseResult);
    const buildReconstruction = vi.fn(async ({ afterStatsComputed }) => {
      afterStatsComputed?.();
      return { reconstruction, pointCount: 1 };
    });
    const deps = createDeps({
      buildReconstruction,
      getSourceInfo: vi.fn(() => ({ imageUrlBase: null, sourceType: 'local' as const })),
      logger,
      parseFiles,
    });
    const files = new Map([
      ['sparse/0/cameras.bin', file('cameras.bin')],
      ['sparse/0/images.bin', file('images.bin')],
      ['sparse/0/points3D.bin', file('points3D.bin')],
      ['splats/small.ply', new File(['x'], 'small.ply')],
      ['splats/large.ply', new File(['xxxx'], 'large.ply')],
      ['splats/model.spz', new File(['xx'], 'model.spz')],
      ['images/image.jpg', file('image.jpg')],
    ]);

    const result = await processFileDropzoneFiles(files, deps, { start: 80, end: 100 });

    expect(result).toBe(true);
    expect(parseFiles).toHaveBeenCalledWith(expect.objectContaining({
      camerasFile: expect.any(File),
      imagesFile: expect.any(File),
      points3DFile: expect.any(File),
      addNotification: deps.addNotification,
      log: logger.info,
    }));
    expect(buildReconstruction).toHaveBeenCalledWith(expect.objectContaining({
      parseResult,
    }));
    expect(deps.preloadSplatRuntime).toHaveBeenCalledTimes(1);
    expect(deps.clearSplatPsnr).toHaveBeenCalledTimes(1);
    expect(deps.setLoadedFiles).toHaveBeenCalledWith(expect.objectContaining({
      splatFile: expect.objectContaining({ name: 'model.spz' }),
      splatFiles: [
        expect.objectContaining({ name: 'model.spz' }),
        expect.objectContaining({ name: 'large.ply' }),
        expect.objectContaining({ name: 'small.ply' }),
      ],
      splatFileSources: [
        expect.objectContaining({ id: 'splats/model.spz', file: expect.objectContaining({ name: 'model.spz' }) }),
        expect.objectContaining({ id: 'splats/large.ply', file: expect.objectContaining({ name: 'large.ply' }) }),
        expect.objectContaining({ id: 'splats/small.ply', file: expect.objectContaining({ name: 'small.ply' }) }),
      ],
    }));
    expect(deps.clearCaches).toHaveBeenCalledWith({ preserveZip: true });
    expect(deps.setReconstruction).toHaveBeenCalledWith(reconstruction);
    expect(deps.resetView).toHaveBeenCalled();
    expect(deps.setUrlProgress).toHaveBeenCalledWith({
      percent: 92,
      message: 'Preparing splat renderer...',
      currentFile: 'model.spz',
    });
    expect(deps.setUrlLoading).toHaveBeenCalledWith(true);
    expect(deps.setUrlLoading).not.toHaveBeenCalledWith(false);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('updates the current splat file for PLY-only drops after reconstruction load', async () => {
    const logger = createLogger();
    const oldSplat = new File(['x'], 'old.ply');
    const smallSplat = new File(['xx'], 'small.ply');
    const largestSplat = new File(['xxxx'], 'replacement.ply');
    const currentLoadedFiles = loadedFiles({ splatFile: oldSplat });
    const parseFiles = vi.fn();
    const onSceneReplaced = vi.fn();
    const deps = createDeps({
      getLoadedFiles: vi.fn(() => currentLoadedFiles),
      logger,
      parseFiles,
    });
    const files = new Map([
      ['output/small.ply', smallSplat],
      ['folder/folder/folder/replacement.ply', largestSplat],
    ]);

    const result = await processFileDropzoneFiles(files, deps, { onSceneReplaced });

    expect(result).toBe(true);
    expect(deps.preloadSplatRuntime).toHaveBeenCalledTimes(1);
    expect(deps.clearSplatPsnr).toHaveBeenCalledTimes(1);
    expect(deps.setLoadedFiles).toHaveBeenCalledWith({
      ...currentLoadedFiles,
      splatFile: largestSplat,
      splatFiles: [largestSplat, smallSplat],
      splatFileSources: [
        { id: 'folder/folder/folder/replacement.ply', path: 'folder/folder/folder/replacement.ply', file: largestSplat },
        { id: 'output/small.ply', path: 'output/small.ply', file: smallSplat },
      ],
    });
    expect(deps.setUrlProgress).toHaveBeenCalledWith({
      percent: 100,
      message: 'Splat file updated',
      currentFile: 'replacement.ply',
    });
    expect(deps.addNotification).toHaveBeenCalledWith(
      'info',
      'Updated splat file: replacement.ply',
      4000
    );
    expect(deps.setDroppedFiles).not.toHaveBeenCalled();
    expect(parseFiles).not.toHaveBeenCalled();
    expect(deps.setReconstruction).not.toHaveBeenCalled();
    expect(deps.resetView).not.toHaveBeenCalled();
    expect(onSceneReplaced).not.toHaveBeenCalled();
    expect(deps.setError).not.toHaveBeenCalled();
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
    expect(logger.info).toHaveBeenCalledWith('[Splats] Updated splat file: replacement.ply');
  });

  it('replaces the scene for direct splat URL loads even when a dataset is already loaded', async () => {
    const logger = createLogger();
    const oldSplat = new File(['x'], 'old.ply');
    const directSplat = new File(['xxxx'], 'replacement.spz');
    const currentLoadedFiles = loadedFiles({ splatFile: oldSplat });
    const parseFiles = vi.fn();
    const onSceneReplaced = vi.fn();
    const deps = createDeps({
      // The renderer is handed the splat that the store reads back as committed.
      ...loadedFilesStore(currentLoadedFiles),
      logger,
      parseFiles,
    });
    const files = new Map([
      ['replacement.spz', directSplat],
    ]);

    const result = await processFileDropzoneFiles(files, deps, {
      progressRange: { start: 80, end: 100 },
      onSceneReplaced,
      replaceSplatScene: true,
      throwOnError: true,
    });

    expect(result).toBe(true);
    expect(onSceneReplaced).toHaveBeenCalledTimes(1);
    expect(deps.clearSplatPsnr).toHaveBeenCalledTimes(1);
    expect(deps.setLoadedFiles).toHaveBeenCalledWith({
      camerasFile: undefined,
      imagesFile: undefined,
      points3DFile: undefined,
      splatFile: directSplat,
      splatFiles: [directSplat],
      splatFileSources: [{ id: 'replacement.spz', path: 'replacement.spz', file: directSplat }],
      rigsFile: undefined,
      framesFile: undefined,
      imageFiles: new Map(),
      hasMasks: false,
    });
    expect(deps.setDroppedFiles).toHaveBeenCalledWith(files);
    expect(deps.setReconstruction).toHaveBeenCalledWith(expect.objectContaining({
      cameras: new Map(),
      images: new Map(),
    }));
    expect(deps.addNotification).not.toHaveBeenCalledWith(
      'info',
      'Updated splat file: replacement.spz',
      expect.any(Number)
    );
    expect(parseFiles).not.toHaveBeenCalled();
    expect(deps.resetView).toHaveBeenCalledTimes(1);
    expect(deps.setUrlLoading).not.toHaveBeenCalledWith(false);
    expect(logger.info).toHaveBeenCalledWith('[Splats] Creating splat-only scene from replacement.spz');
  });

  it('loads a splat-only scene when no dataset is loaded', async () => {
    const logger = createLogger();
    const parseFiles = vi.fn();
    const spz = new File(['xx'], 'backup.spz');
    const ignored = new File(['xxxx'], 'notes.txt');
    const deps = createDeps({
      getLoadedFiles: vi.fn(() => null),
      logger,
      parseFiles,
    });

    const result = await processFileDropzoneFiles(new Map([
      ['backup.spz', spz],
      ['notes.txt', ignored],
    ]), deps);

    expect(result).toBe(true);
    expect(deps.preloadSplatRuntime).toHaveBeenCalledTimes(1);
    expect(deps.clearSplatPsnr).toHaveBeenCalledTimes(1);
    expect(deps.setLoadedFiles).toHaveBeenCalledWith({
      camerasFile: undefined,
      imagesFile: undefined,
      points3DFile: undefined,
      splatFile: spz,
      splatFiles: [spz],
      splatFileSources: [{ id: 'backup.spz', path: 'backup.spz', file: spz }],
      rigsFile: undefined,
      framesFile: undefined,
      imageFiles: new Map(),
      hasMasks: false,
    });
    expect(deps.setDroppedFiles).toHaveBeenCalledWith(new Map([
      ['backup.spz', spz],
      ['notes.txt', ignored],
    ]));
    expect(deps.clearCaches).toHaveBeenCalledWith({ preserveZip: true });
    expect(deps.setReconstruction).toHaveBeenCalledWith(expect.objectContaining({
      cameras: new Map(),
      images: new Map(),
    }));
    expect(deps.resetView).toHaveBeenCalledTimes(1);
    expect(deps.addNotification).not.toHaveBeenCalled();
    expect(parseFiles).not.toHaveBeenCalled();
    expect(deps.setError).not.toHaveBeenCalled();
    expect(deps.setUrlProgress).toHaveBeenCalledWith({
      percent: 60,
      message: 'Preparing splat renderer...',
      currentFile: 'backup.spz',
    });
    expect(deps.setUrlLoading).toHaveBeenCalledWith(true);
    expect(deps.setUrlLoading).not.toHaveBeenCalledWith(false);
  });

  it('reports a failed spark runtime preload instead of only logging it', async () => {
    // Chronologically the FIRST of the app's three preload attempts. Logging
    // alone left the backend store believing a download was still coming.
    const spz = new File(['xx'], 'scene.spz');
    const logger = createLogger();
    const deps = createDeps({
      getLoadedFiles: vi.fn(() => null),
      parseFiles: vi.fn(),
      logger,
      onSplatRuntimePreloadFailed: vi.fn(),
      preloadSplatRuntime: vi.fn(async () => {
        throw new Error('spark unavailable');
      }),
    });

    await processFileDropzoneFiles(new Map([['scene.spz', spz]]), deps);

    expect(deps.onSplatRuntimePreloadFailed).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('spark unavailable'));
  });

  it('asks the preload gate about the incoming splat and skips the download when it says no', async () => {
    const parseFiles = vi.fn();
    const spz = new File(['xx'], 'webgpu.spz');
    const deps = createDeps({
      getLoadedFiles: vi.fn(() => null),
      parseFiles,
      shouldPreloadSplatRuntime: vi.fn(() => false),
    });

    const result = await processFileDropzoneFiles(new Map([['webgpu.spz', spz]]), deps);

    expect(result).toBe(true);
    expect(deps.shouldPreloadSplatRuntime).toHaveBeenCalledExactlyOnceWith(spz);
    expect(deps.preloadSplatRuntime).not.toHaveBeenCalled();
    // Only the runtime download is skipped: the splat itself loads on exactly the
    // same schedule, with the same handoff to the renderer's own progress.
    expect(deps.setLoadedFiles).toHaveBeenCalledWith(expect.objectContaining({
      splatFile: spz,
      splatFiles: [spz],
      splatFileSources: [{ id: 'webgpu.spz', path: 'webgpu.spz', file: spz }],
    }));
    expect(deps.setUrlProgress).toHaveBeenCalledWith({
      percent: 60,
      message: 'Preparing splat renderer...',
      currentFile: 'webgpu.spz',
    });
    expect(deps.setUrlLoading).toHaveBeenCalledWith(true);
    expect(deps.setUrlLoading).not.toHaveBeenCalledWith(false);
  });

  it('loads a generic PLY point cloud as points3D instead of a splat', async () => {
    const logger = createLogger();
    const parseFiles = vi.fn();
    const pointsPly = genericPointCloudPly();
    const deps = createDeps({
      getLoadedFiles: vi.fn(() => null),
      logger,
      parseFiles,
    });

    const result = await processFileDropzoneFiles(new Map([
      ['points.ply', pointsPly],
    ]), deps);

    expect(result).toBe(true);
    expect(deps.preloadSplatRuntime).not.toHaveBeenCalled();
    expect(deps.clearSplatPsnr).toHaveBeenCalledTimes(1);
    expect(deps.setLoadedFiles).toHaveBeenCalledWith({
      camerasFile: undefined,
      imagesFile: undefined,
      points3DFile: pointsPly,
      splatFile: undefined,
      splatFiles: [],
      splatFileSources: [],
      rigsFile: undefined,
      framesFile: undefined,
      imageFiles: new Map(),
      hasMasks: false,
    });
    expect(deps.setDroppedFiles).toHaveBeenCalledWith(new Map([
      ['points.ply', pointsPly],
    ]));
    expect(deps.setReconstruction).toHaveBeenCalledWith(expect.objectContaining({
      points3D: expect.any(Map),
      cameras: new Map(),
      images: new Map(),
    }));
    const reconstruction = vi.mocked(deps.setReconstruction).mock.calls[0][0] as Reconstruction;
    expect(reconstruction.points3D?.get(1n)).toMatchObject({
      xyz: [1, 2, 3],
      rgb: [10, 20, 30],
      track: [],
    });
    expect(parseFiles).not.toHaveBeenCalled();
    expect(deps.addNotification).toHaveBeenCalledWith('info', 'Loaded 1 points', 5000);
    expect(deps.setUrlProgress).not.toHaveBeenCalledWith(expect.objectContaining({
      message: 'Preparing splat renderer...',
    }));
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
    expect(logger.info).toHaveBeenCalledWith('[PointCloud] Loaded 1 points from points.ply');
  });

  it('uses a generic PLY point cloud as points3D when COLMAP cameras and images are present', async () => {
    const logger = createLogger();
    const reconstruction = createReconstruction();
    const camerasFile = file('cameras.bin');
    const imagesFile = file('images.bin');
    const pointsPly = genericPointCloudPly();
    const parseResult = {
      cameras: new Map(),
      images: reconstruction.images,
      points3D: new Map(),
      wasmWrapper: null,
      usedWasmPath: false,
    };
    const parseFiles = vi.fn(async () => parseResult);
    const buildReconstruction = vi.fn(async ({ afterStatsComputed }) => {
      afterStatsComputed?.();
      return { reconstruction, pointCount: 1 };
    });
    const deps = createDeps({
      buildReconstruction,
      logger,
      parseFiles,
    });
    const files = new Map([
      ['sparse/0/cameras.bin', camerasFile],
      ['sparse/0/images.bin', imagesFile],
      ['points.ply', pointsPly],
    ]);

    const result = await processFileDropzoneFiles(files, deps);

    expect(result).toBe(true);
    expect(deps.preloadSplatRuntime).not.toHaveBeenCalled();
    expect(deps.clearSplatPsnr).toHaveBeenCalledTimes(1);
    expect(deps.setLoadedFiles).toHaveBeenCalledWith(expect.objectContaining({
      camerasFile,
      imagesFile,
      points3DFile: pointsPly,
      splatFile: undefined,
      splatFiles: [],
      splatFileSources: [],
    }));
    expect(parseFiles).toHaveBeenCalledWith(expect.objectContaining({
      camerasFile,
      imagesFile,
      points3DFile: pointsPly,
      addNotification: deps.addNotification,
      log: logger.info,
    }));
    expect(buildReconstruction).toHaveBeenCalledWith(expect.objectContaining({
      parseResult,
    }));
    expect(deps.setReconstruction).toHaveBeenCalledWith(reconstruction);
    expect(deps.resetView).toHaveBeenCalledTimes(1);
    expect(deps.setUrlProgress).not.toHaveBeenCalledWith(expect.objectContaining({
      message: 'Preparing splat renderer...',
    }));
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('applies config with a new splat-only scene and hands loading to the splat renderer', async () => {
    const logger = createLogger();
    const importConfig = vi.fn(async () => ({ applied: true }));
    const parseFiles = vi.fn();
    const config = file('viewer.yaml');
    const spz = new File(['xx'], 'scene.spz');
    const deps = createDeps({
      getLoadedFiles: vi.fn(() => null),
      importConfig,
      logger,
      parseFiles,
    });
    const files = new Map([
      ['viewer.yaml', config],
      ['scene.spz', spz],
    ]);

    const result = await processFileDropzoneFiles(files, deps);

    expect(result).toBe(true);
    expect(importConfig).toHaveBeenCalledWith(config, {
      logErrors: true,
      signal: expect.any(AbortSignal),
    });
    expect(deps.preloadSplatRuntime).toHaveBeenCalledTimes(1);
    expect(deps.clearSplatPsnr).toHaveBeenCalledTimes(1);
    expect(deps.setLoadedFiles).toHaveBeenCalledWith({
      camerasFile: undefined,
      imagesFile: undefined,
      points3DFile: undefined,
      splatFile: spz,
      splatFiles: [spz],
      splatFileSources: [{ id: 'scene.spz', path: 'scene.spz', file: spz }],
      rigsFile: undefined,
      framesFile: undefined,
      imageFiles: new Map(),
      hasMasks: false,
    });
    expect(deps.setDroppedFiles).toHaveBeenCalledWith(files);
    expect(deps.clearCaches).toHaveBeenCalledWith({ preserveZip: true });
    expect(deps.resetView).toHaveBeenCalledTimes(1);
    expect(parseFiles).not.toHaveBeenCalled();
    expect(deps.addNotification).not.toHaveBeenCalled();
    expect(deps.setUrlProgress).toHaveBeenCalledWith({
      percent: 60,
      message: 'Preparing splat renderer...',
      currentFile: 'scene.spz',
    });
    expect(deps.setUrlLoading).toHaveBeenCalledWith(true);
    expect(deps.setUrlLoading).not.toHaveBeenCalledWith(false);
  });

  it('throws processing errors for URL-loader style calls that request propagation', async () => {
    const error = new Error('parse failed');
    const deps = createDeps({
      parseFiles: vi.fn(async () => {
        throw error;
      }),
    });
    const files = new Map([
      ['sparse/0/cameras.bin', file('cameras.bin')],
      ['sparse/0/images.bin', file('images.bin')],
      ['sparse/0/points3D.bin', file('points3D.bin')],
    ]);

    await expect(processFileDropzoneFiles(files, deps, {
      progressRange: { start: 80, end: 100 },
      throwOnError: true,
    })).rejects.toBe(error);

    expect(deps.setError).toHaveBeenCalledWith('parse failed');
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
  });

  it('throws config-only failures when propagation is requested', async () => {
    const importConfig = vi.fn(async () => ({ applied: false, errorMessage: 'Config error: invalid' }));
    const deps = createDeps({ importConfig });

    await expect(processFileDropzoneFiles(new Map([['viewer.yaml', file('viewer.yaml')]]), deps, {
      throwOnError: true,
    })).rejects.toThrow('Config error: invalid');

    expect(deps.setError).toHaveBeenCalledWith('Config error: invalid');
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
  });

  it.each([true, false])('carries remote splat tiles across a reload only when asked (%s)', async preserve => {
    const remoteFile = new File(['remote'], 'scene.spz');
    const store = loadedFilesStore(loadedFiles({
      splatFile: remoteFile, splatFiles: [remoteFile],
      splatFileSources: [{ id: 'splats/scene.spz', path: 'splats/scene.spz', url: 'https://x/splats/scene.spz', size: 6, file: remoteFile }],
    }));
    const deps = createDeps({
      ...store,
      parseFiles: vi.fn(async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false })),
      buildReconstruction: vi.fn(async () => ({ reconstruction: createReconstruction(), pointCount: 0 })),
    });
    const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin'].map(name => [name, file(name)]));

    await expect(processFileDropzoneFiles(files, deps, { reload: preserve })).resolves.toBe(true);

    expect(deps.setLoadedFiles).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(preserve
      ? { splatFile: remoteFile, splatFileSources: [expect.objectContaining({ id: 'splats/scene.spz', file: remoteFile })] }
      : { splatFile: undefined, splatFileSources: [] }));
    expect(store.getLoadedFiles()?.splatFile).toBe(preserve ? remoteFile : undefined);
    // Kept: the renderer already shows it. Dropped: nothing is left to render. Either way, no wait.
    expect(deps.setUrlProgress).not.toHaveBeenCalledWith(expect.objectContaining({ currentFile: 'scene.spz' }));
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
  });

  it('does not wait on the renderer when a reload re-reads the local splat it already shows', async () => {
    const local = new File(['local'], 'scene.spz');
    const store = loadedFilesStore(loadedFiles({
      splatFile: local, splatFiles: [local], splatFileSources: [{ id: 'scene.spz', path: 'scene.spz', file: local }],
    }));
    const deps = createDeps({
      ...store,
      parseFiles: vi.fn(async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false })),
      buildReconstruction: vi.fn(async () => ({ reconstruction: createReconstruction(), pointCount: 0 })),
    });
    // Reload passes the same dropped files back, so the splat is the very File on screen.
    const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin'].map(name => [name, file(name)]));
    files.set('scene.spz', local);

    await expect(processFileDropzoneFiles(files, deps, { reload: true })).resolves.toBe(true);

    expect(store.getLoadedFiles()?.splatFile).toBe(local);
    expect(deps.setUrlProgress).not.toHaveBeenCalledWith(expect.objectContaining({ currentFile: 'scene.spz' }));
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
  });

  it('does not wait on the renderer when the store re-picks the splat already on screen', async () => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    // a.spz is larger, so it is the workflow's own default pick; the user has picked b.spz.
    const a = new File(['aa'], 'a.spz');
    const b = new File(['b'], 'b.spz');
    useReconstructionStore.getState().setLoadedFiles(loadedFiles({ splatFile: a, splatFiles: [a, b],
      splatFileSources: [{ id: 'a.spz', path: 'a.spz', file: a }, { id: 'b.spz', path: 'b.spz', file: b }] }));
    await useReconstructionStore.getState().selectSplatSource('b.spz');
    const deps = createDeps({
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      setLoadedFiles: useReconstructionStore.getState().setLoadedFiles,
      parseFiles: vi.fn(async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false })),
      buildReconstruction: vi.fn(async () => ({ reconstruction: createReconstruction(), pointCount: 0 })),
    });
    const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin'].map(name => [name, file(name)]));
    files.set('a.spz', a);
    files.set('b.spz', b);
    try {
      await expect(processFileDropzoneFiles(files, deps, { reload: true })).resolves.toBe(true);

      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(b);
      expect(deps.setUrlProgress).not.toHaveBeenCalledWith(expect.objectContaining({ currentFile: 'a.spz' }));
      expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
    } finally { useReconstructionStore.getState().clear(); }
  });

  function reloadFixture() {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    const a = new File(['aa'], 'a.spz');   // larger: the files' default pick
    const b = new File(['b'], 'b.spz');
    const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin'].map(name => [name, file(name)]));
    files.set('a.spz', a);
    files.set('b.spz', b);
    useReconstructionStore.getState().setLoadedFiles(loadedFiles({ splatFile: a, splatFiles: [a, b],
      splatFileSources: [{ id: 'a.spz', path: 'a.spz', file: a }, { id: 'b.spz', path: 'b.spz', file: b }] }));
    const deps = createDeps({
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      setLoadedFiles: useReconstructionStore.getState().setLoadedFiles,
      parseFiles: vi.fn(async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false })),
      buildReconstruction: vi.fn(async () => ({ reconstruction: createReconstruction(), pointCount: 0 })),
    });
    return { a, b, files, deps };
  }

  it.each(['b.spz', ''])('keeps the splat state on screen (%j) across repeated reloads', async choice => {
    const { b, files, deps } = reloadFixture();
    try {
      await useReconstructionStore.getState().selectSplatSource(choice);
      for (let reload = 0; reload < 2; reload += 1) {
        await expect(processFileDropzoneFiles(files, deps, { reload: true })).resolves.toBe(true);
      }
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(choice ? b : undefined);
      expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(2);
      // Nothing new to load: the renderer is never handed the default splat.
      expect(deps.setUrlProgress).not.toHaveBeenCalledWith(expect.objectContaining({ currentFile: 'a.spz' }));
      expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
    } finally { useReconstructionStore.getState().clear(); }
  });

  it("does not let the dataset's own settings switch the splat on reload", async () => {
    const { b, files, deps } = reloadFixture();
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'a.spz' }, ui: { backgroundColor: '#345678' } } });
    files.set('colmapview.yaml', Object.assign(file('colmapview.yaml'), { text: async () => yaml }));
    try {
      await useReconstructionStore.getState().selectSplatSource('b.spz');
      await expect(processFileDropzoneFiles(files, deps, { reload: true,
        onViewerState: viewerState => applySavedViewerState(viewerState, null) })).resolves.toBe(true);
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(b);
      expect(useUIStore.getState().backgroundColor).toBe('#345678');   // the rest still applies
    } finally { useReconstructionStore.getState().clear(); }
  });

  it('re-applies the saved alignment on reload but not the saved splat choice', async () => {
    const { b, files, deps } = reloadFixture();
    const transform = { ...createIdentityEuler(), translationX: 5 };
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'a.spz', transform } } };
    try {
      await useReconstructionStore.getState().selectSplatSource('b.spz');
      await expect(processFileDropzoneFiles(files, deps, { reload: true, viewerState: saved,
        onViewerState: viewerState => applySavedViewerState(viewerState, null) })).resolves.toBe(true);
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(b);
      expect(useTransformStore.getState().splatTransform).toEqual(transform);
    } finally { useReconstructionStore.getState().clear(); }
  });

  it('shows the points normally when Reload re-applies splat-tuned display with no splat on screen', async () => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    const a = new File(['aa'], 'a.spz');
    const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin'].map(name => [name, file(name)]));
    files.set('a.spz', a);
    useReconstructionStore.getState().setLoadedFiles(loadedFiles({ splatFile: a, splatFiles: [a],
      splatFileSources: [{ id: 'a.spz', path: 'a.spz', file: a }] }));
    await useReconstructionStore.getState().selectSplatSource('');
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null,
      config: { pointCloud: { colorMode: 'splatPoints', pointSize: 1, pointOpacity: 0.2 } } };
    const deps = createDeps({
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      setLoadedFiles: useReconstructionStore.getState().setLoadedFiles,
      parseFiles: vi.fn(async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false })),
      buildReconstruction: vi.fn(async () => ({ reconstruction: createReconstruction(), pointCount: 0 })),
    });
    try {
      await expect(processFileDropzoneFiles(files, deps, { reload: true, viewerState: saved,
        onViewerState: viewerState => applySavedViewerState(viewerState, null) })).resolves.toBe(true);
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
      expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'rgb', pointSize: 2, pointOpacity: 1 });
    } finally { useReconstructionStore.getState().clear(); }
  });

  /** A scene without COLMAP files whose own files hold the splats a (their default) and b. */
  function reloadWithoutColmapFixture(scene: 'splat-only' | 'images-only') {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    const a = new File(['aa'], 'a.spz');   // larger: the files' default pick
    const b = new File(['b'], 'b.spz');
    const photo = file('photo.jpg');
    const files = new Map([['a.spz', a], ['b.spz', b]]);
    if (scene === 'images-only') files.set('images/photo.jpg', photo);
    useReconstructionStore.getState().setLoadedFiles(loadedFiles({ camerasFile: undefined, imagesFile: undefined,
      points3DFile: undefined, imageFiles: new Map(scene === 'images-only' ? [['photo.jpg', photo]] : []),
      splatFile: a, splatFiles: [a, b],
      splatFileSources: [{ id: 'a.spz', path: 'a.spz', file: a }, { id: 'b.spz', path: 'b.spz', file: b }] }));
    const deps = createDeps({
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      setLoadedFiles: useReconstructionStore.getState().setLoadedFiles,
    });
    return { b, files, deps };
  }

  it.each([
    ['splat-only', 'b.spz'], ['splat-only', ''], ['images-only', 'b.spz'], ['images-only', ''],
  ] as const)('keeps the splat state on screen across repeated reloads (%s scene, %j)', async (scene, choice) => {
    const { b, files, deps } = reloadWithoutColmapFixture(scene);
    try {
      await useReconstructionStore.getState().selectSplatSource(choice);
      for (let reload = 0; reload < 2; reload += 1) {
        await expect(processFileDropzoneFiles(files, deps, { reload: true })).resolves.toBe(true);
      }
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(choice ? b : undefined);
      expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(2);
      // The files' default splat is never put on screen.
      expect(deps.setUrlProgress).not.toHaveBeenCalledWith(expect.objectContaining({ currentFile: 'a.spz' }));
      expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
    } finally { useReconstructionStore.getState().clear(); }
  });

  it("does not let a splat-only project's own settings switch the splat on reload", async () => {
    const { b, files, deps } = reloadWithoutColmapFixture('splat-only');
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'a.spz' }, ui: { backgroundColor: '#345678' } } });
    files.set('colmapview.yaml', Object.assign(file('colmapview.yaml'), { text: async () => yaml }));
    try {
      await useReconstructionStore.getState().selectSplatSource('b.spz');
      for (let reload = 0; reload < 2; reload += 1) {
        await expect(processFileDropzoneFiles(files, deps, { reload: true,
          onViewerState: viewerState => applySavedViewerState(viewerState, null) })).resolves.toBe(true);
      }
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(b);
      expect(useUIStore.getState().backgroundColor).toBe('#345678');
    } finally { useReconstructionStore.getState().clear(); }
  });

  it.each(['splats/scene.spz', ''])("keeps an images-only scene's remote splat tiles and its splat state (%j) across reloads", async choice => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    const remoteFile = new File(['remote'], 'scene.spz');
    const photo = file('photo.jpg');
    // The files hold only the images: remote tiles are never among them.
    const files = new Map([['images/photo.jpg', photo]]);
    useReconstructionStore.getState().setLoadedFiles(loadedFiles({ camerasFile: undefined, imagesFile: undefined,
      points3DFile: undefined, imageFiles: new Map([['photo.jpg', photo]]), splatFile: remoteFile, splatFiles: [remoteFile],
      splatFileSources: [
        { id: 'splats/scene.spz', path: 'splats/scene.spz', url: 'https://x/splats/scene.spz', size: 6, file: remoteFile },
        { id: 'splats/other.spz', path: 'splats/other.spz', url: 'https://x/splats/other.spz', size: 9 },
      ] }));
    const deps = createDeps({
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      setLoadedFiles: useReconstructionStore.getState().setLoadedFiles,
    });
    try {
      await useReconstructionStore.getState().selectSplatSource(choice);
      for (let reload = 0; reload < 2; reload += 1) {
        await expect(processFileDropzoneFiles(files, deps, { reload: true })).resolves.toBe(true);
      }
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(choice ? remoteFile : undefined);
      expect(useReconstructionStore.getState().loadedFiles?.splatFileSources?.map(source => source.id))
        .toEqual(['splats/scene.spz', 'splats/other.spz']);
      // The renderer already shows the kept splat: no splat load is left waiting on it.
      expect(deps.setUrlProgress).toHaveBeenLastCalledWith({ percent: 95, message: 'Finalizing...' });
      expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
    } finally { useReconstructionStore.getState().clear(); }
  });

  type ReloadScene = 'COLMAP' | 'splat-only' | 'images+splats' | 'images' | 'point cloud';

  /** A freshly parsed scene with the images 1 and 2. */
  const parsedScene = () => buildTestReconstruction({
    images: [buildImage({ imageId: 1, name: 'one.jpg' }), buildImage({ imageId: 2, name: 'two.jpg' })],
  });

  /** Workflow deps that commit to the real stores. */
  function realStoreDeps(overrides: Partial<FileDropzoneWorkflowDeps> = {}) {
    const store = useReconstructionStore.getState();
    return createDeps({
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      setDroppedFiles: store.setDroppedFiles, setLoadedFiles: store.setLoadedFiles,
      setReconstruction: store.setReconstruction, setWasmReconstruction: store.setWasmReconstruction,
      ...overrides,
    });
  }

  /**
   * Real stores and a scene's own files. The COLMAP, splat-only and images+splats scenes hold the
   * splats a (their default) and b; the COLMAP and gallery scenes show the images 1 and 2.
   */
  function reloadSceneFixture(scene: ReloadScene, settings?: string) {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
    const a = new File(['aa'], 'a.spz');   // larger: the files' default pick
    const b = new File(['b'], 'b.spz');
    const files = new Map<string, File>(scene === 'images' || scene === 'point cloud' ? [] : [['a.spz', a], ['b.spz', b]]);
    if (scene === 'COLMAP') for (const name of ['cameras.bin', 'images.bin', 'points3D.bin']) files.set(name, file(name));
    if (scene === 'images+splats' || scene === 'images') for (const name of ['one.jpg', 'two.jpg']) files.set(`images/${name}`, file(name));
    if (scene === 'point cloud') files.set('points.ply', genericPointCloudPly());
    if (settings) files.set('colmapview.yaml', Object.assign(file('colmapview.yaml'), { text: async () => settings }));
    const deps = realStoreDeps({
      onViewerState: viewerState => applySavedViewerState(viewerState, null),
      // Announces like the real parser: the points it loaded, then its warnings.
      parseFiles: vi.fn(async ({ addNotification }) => {
        addNotification('info', 'Loaded 0 points', 5000);
        addNotification('warning', 'Skipped 1 unreadable track');
        return { cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false };
      }),
      buildReconstruction: vi.fn(async () => ({ reconstruction: parsedScene(), pointCount: 0 })),
    });
    return { b, files, deps };
  }

  async function loadReloadScene(scene: ReloadScene, settings?: string) {
    const fixture = reloadSceneFixture(scene, settings);
    await expect(processFileDropzoneFiles(fixture.files, fixture.deps)).resolves.toBe(true);
    return fixture;
  }

  /** What a Reload discards: an applied deletion (where the scene has images), an applied transform and a mark. */
  async function editReloadScene(scene: ReloadScene) {
    if (scene !== 'splat-only') {
      useDeletionStore.getState().markForDeletion(1);
      expect(await applyDeletionsToData()).toBe(true);
    }
    useDeletionStore.getState().markForDeletion(2);
    useTransformStore.getState().setTransform({ translationX: 3 });
    expect(await applyTransformToData()).toBe(true);
    // The applied transform moved the splat with the scene, and the mark outlived that edit.
    expect(useTransformStore.getState().splatTransform.translationX).toBe(3);
    expect(useDeletionStore.getState().pendingDeletions).toEqual(new Set([2]));
    expect(useReconstructionStore.getState().reconstructionEditRevision).toBeGreaterThan(0);
  }

  it.each(['COLMAP', 'splat-only', 'images+splats'] as const)('hands the renderer the splat the store committed (%s scene)', async scene => {
    const { b, files, deps } = reloadSceneFixture(scene);
    try {
      // A choice waiting for the dataset, such as a shared link's, is the splat the store commits.
      useReconstructionStore.getState().setRequestedSplatSourceId('b.spz');

      await expect(processFileDropzoneFiles(files, deps)).resolves.toBe(true);

      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(b);
      expect(deps.setUrlProgress).toHaveBeenLastCalledWith(
        expect.objectContaining({ message: 'Preparing splat renderer...', currentFile: 'b.spz' }));
      expect(deps.setUrlLoading).not.toHaveBeenCalledWith(false);
    } finally { useReconstructionStore.getState().clear(); }
  });

  it('reads a committed None as None, not as the splat the store was given', async () => {
    let committed: LoadedFiles | null = null;
    const deps = createDeps({
      getLoadedFiles: () => committed,
      // A store that shows no splat, whatever it is given.
      setLoadedFiles: files => { committed = { ...files, splatFile: undefined }; },
    });

    await expect(processFileDropzoneFiles(new Map([['scene.spz', new File(['s'], 'scene.spz')]]), deps)).resolves.toBe(true);

    expect(deps.setUrlProgress).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'Preparing splat renderer...' }));
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
  });

  it.each([
    ['COLMAP', 'b.spz'], ['COLMAP', ''], ['splat-only', 'b.spz'], ['splat-only', ''],
    ['images+splats', 'b.spz'], ['images+splats', ''],
  ] as const)('discards edits on Reload but keeps the splat state on screen (%s scene, %j)', async (scene, choice) => {
    const { b, files, deps } = await loadReloadScene(scene);
    try {
      await useReconstructionStore.getState().selectSplatSource(choice);
      await editReloadScene(scene);
      vi.mocked(deps.addNotification).mockClear();
      vi.mocked(deps.setUrlProgress).mockClear();

      await expect(processFileDropzoneFiles(files, deps, { reload: true })).resolves.toBe(true);

      const { reconstruction, reconstructionEditRevision, loadedFiles } = useReconstructionStore.getState();
      expect(reconstruction?.images.size).toBe(scene === 'splat-only' ? 0 : 2);
      expect(reconstructionEditRevision).toBe(0);
      expect(useTransformStore.getState()).toMatchObject({ transform: createIdentityEuler(), splatTransform: createIdentityEuler() });
      expect(useDeletionStore.getState().pendingDeletions.size).toBe(0);
      expect(hasUnsavedReloadState()).toBe(false);
      expect(loadedFiles?.splatFile).toBe(choice ? b : undefined);
      expect(loadedFiles?.splatFileSources).toHaveLength(2);
      // Nothing claims an updated splat, and the renderer is never handed the splat it already shows.
      expect(deps.addNotification).not.toHaveBeenCalledWith('info', expect.stringContaining('Updated splat file'), expect.anything());
      expect(deps.setUrlProgress).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'Splat file updated' }));
      expect(deps.setUrlProgress).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'Preparing splat renderer...' }));
      expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
    } finally { useReconstructionStore.getState().clear(); }
  });

  it.each([
    ['COLMAP', false, [['info', 'Loaded 0 points', 5000], ['warning', 'Skipped 1 unreadable track']]],
    ['point cloud', false, [['info', 'Loaded 1 points', 5000]]],
    ['point cloud', true, [['info', 'Loaded 1 points', 5000]]],
    ['images', false, [['info', 'Loaded 2 images (gallery only, no 3D data)', 5000]]],
    ['images+splats', false, [['info', 'Loaded 2 images (gallery only, no 3D data)', 5000]]],
    ['splat-only', false, []],
    ['splat-only', true, []],
  ] as const)('announces a Reload exactly as its first load (%s scene, own colmapview.yaml: %s)', async (scene, ownSettings, announcements) => {
    const { files, deps } = reloadSceneFixture(scene, ownSettings ? 'ui:\n  background_color: "#123456"\n' : undefined);
    try {
      await expect(processFileDropzoneFiles(files, deps)).resolves.toBe(true);
      expect(vi.mocked(deps.addNotification).mock.calls).toEqual(announcements);
      vi.mocked(deps.addNotification).mockClear();

      await expect(processFileDropzoneFiles(files, deps, { reload: true })).resolves.toBe(true);

      expect(vi.mocked(deps.addNotification).mock.calls).toEqual(announcements);
      expect(deps.addNotification).not.toHaveBeenCalledWith('info', expect.stringContaining('Updated splat file'), expect.anything());
    } finally { useReconstructionStore.getState().clear(); }
  });

  it('warns about the points a minimum track length hides on a Reload exactly as on its first load', async () => {
    const { files, deps } = reloadSceneFixture('COLMAP');
    // Of two parsed points, the one seen by a single image is under a minimum track length of 2.
    const points3D = new Map([
      [1n, buildPoint3D({ point3DId: 1n, track: [{ imageId: 1, point2DIdx: 0 }] })],
      [2n, buildPoint3D({ point3DId: 2n, track: [{ imageId: 1, point2DIdx: 1 }, { imageId: 2, point2DIdx: 0 }] })],
    ]);
    const hiding = { ...deps, getMinTrackLength: () => 2,
      parseFiles: vi.fn(async () => ({ cameras: new Map(), images: new Map(), points3D, wasmWrapper: null, usedWasmPath: false })),
      buildReconstruction: vi.fn(async () => ({ reconstruction: parsedScene(), pointCount: 2 })) };
    const announcements = [['warning', '1 points (50.0%) hidden due to min track length filter (2). Adjust in Point Cloud settings.']];
    try {
      await expect(processFileDropzoneFiles(files, hiding)).resolves.toBe(true);
      expect(vi.mocked(deps.addNotification).mock.calls).toEqual(announcements);
      vi.mocked(deps.addNotification).mockClear();

      await expect(processFileDropzoneFiles(files, hiding, { reload: true })).resolves.toBe(true);

      expect(vi.mocked(deps.addNotification).mock.calls).toEqual(announcements);
    } finally { useReconstructionStore.getState().clear(); }
  });

  it.each(['COLMAP', 'splat-only', 'images+splats'] as const)('still updates the splat of an open %s scene for a plain splat drop', async scene => {
    const { deps } = await loadReloadScene(scene);
    try {
      await editReloadScene(scene);
      const edited = useReconstructionStore.getState();
      const dropped = new File(['c'], 'c.spz');

      await expect(processFileDropzoneFiles(new Map([['c.spz', dropped]]), deps)).resolves.toBe(true);

      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(dropped);
      expect(deps.addNotification).toHaveBeenCalledWith('info', 'Updated splat file: c.spz', 4000);
      // Not a Reload: the scene and its edits stay.
      expect(useReconstructionStore.getState().reconstruction).toBe(edited.reconstruction);
      expect(useReconstructionStore.getState().reconstructionEditRevision).toBe(edited.reconstructionEditRevision);
      expect(useTransformStore.getState().splatTransform.translationX).toBe(3);
      expect(useDeletionStore.getState().pendingDeletions).toEqual(new Set([2]));
    } finally { useReconstructionStore.getState().clear(); }
  });

  it.each(['COLMAP', 'splat-only', 'images+splats'] as const)("keeps None on Reload over the %s project's own colmapview.yaml, back at its alignment", async scene => {
    const alignment = { ...createIdentityEuler(), translationX: 4, rotationZ: 0.5 };
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'b.spz', transform: alignment }, ui: { backgroundColor: '#345678' } } });
    const { b, files, deps } = await loadReloadScene(scene, yaml);
    const prompts: string[] = [];
    registerConfirmationHandler(async request => { prompts.push(request.title); return false; });
    try {
      // A first load shows the project's own choice.
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(b);
      await useReconstructionStore.getState().selectSplatSource('');
      useUIStore.getState().setBackgroundColor('#000000');
      // Reload would undo a splat moved off its saved alignment, so it asks first.
      useTransformStore.getState().setSplatTransform({ ...alignment, translationX: 9 });
      await expect(confirmReload()).resolves.toBe(false);
      expect(prompts).toHaveLength(1);

      for (let reload = 0; reload < 2; reload += 1) {
        await expect(processFileDropzoneFiles(files, deps, { reload: true })).resolves.toBe(true);
      }

      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
      expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(2);
      expect(useUIStore.getState().backgroundColor).toBe('#345678');   // the rest of the file comes back
      expect(useTransformStore.getState().splatTransform).toEqual(alignment);
      // Reload restored what the prompt compares against, so nothing is left to lose.
      await expect(confirmReload()).resolves.toBe(true);
      expect(prompts).toHaveLength(1);
    } finally {
      registerConfirmationHandler(null);
      useReconstructionStore.getState().clear();
    }
  });

  it.each(['cancelled', 'failed'] as const)('keeps the pending marks and the edited scene when a Reload is %s', async outcome => {
    const { files, deps } = await loadReloadScene('COLMAP');
    try {
      await editReloadScene('COLMAP');
      const edited = useReconstructionStore.getState();
      let finishBuild!: (result: { reconstruction: Reconstruction; pointCount: number }) => void;
      const building = vi.fn(() => new Promise<{ reconstruction: Reconstruction; pointCount: number }>(resolve => { finishBuild = resolve; }));
      const parseFiles = outcome === 'failed' ? vi.fn(async () => { throw new Error('unreadable'); }) : deps.parseFiles;
      const reloading = processFileDropzoneFiles(files, { ...deps, parseFiles, buildReconstruction: building }, { reload: true });
      if (outcome === 'cancelled') {
        await vi.waitFor(() => expect(building).toHaveBeenCalledOnce());
        useReconstructionStore.getState().cancelLoading();
        finishBuild({ reconstruction: parsedScene(), pointCount: 0 });
      }

      await expect(reloading).resolves.toBe(false);

      expect(useReconstructionStore.getState().reconstruction).toBe(edited.reconstruction);
      expect(useReconstructionStore.getState().reconstructionEditRevision).toBe(edited.reconstructionEditRevision);
      expect(useDeletionStore.getState().pendingDeletions).toEqual(new Set([2]));
    } finally { useReconstructionStore.getState().clear(); }
  });

  it.each(['COLMAP', 'splat', 'point cloud', 'images'] as const)('drops the pending marks of the scene a new %s dataset replaces', async kind => {
    const { deps } = await loadReloadScene('COLMAP');
    try {
      useDeletionStore.getState().markForDeletion(2);
      const single = kind === 'splat' ? new File(['c'], 'c.spz') : kind === 'point cloud' ? genericPointCloudPly() : file('three.jpg');
      const incoming = kind === 'COLMAP'
        ? new Map(['cameras.bin', 'images.bin', 'points3D.bin'].map((name): [string, File] => [`other/${name}`, file(name)]))
        : new Map([[single.name, single]]);

      await expect(processFileDropzoneFiles(incoming, deps, { replaceSplatScene: true })).resolves.toBe(true);

      expect(useDeletionStore.getState().pendingDeletions.size).toBe(0);
    } finally { useReconstructionStore.getState().clear(); }
  });

  it('restores the saved alignment that came with a reloaded URL dataset', async () => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { transform: { ...createIdentityEuler(), translationX: 5 } } } };
    // An applied transform moved the splat; Reload must return it to the saved alignment.
    useTransformStore.getState().setSplatTransform({ ...createIdentityEuler(), translationX: 9 });
    const deps = createDeps({
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      setLoadedFiles: useReconstructionStore.getState().setLoadedFiles,
      parseFiles: vi.fn(async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false })),
      buildReconstruction: vi.fn(async () => ({ reconstruction: createReconstruction(), pointCount: 0 })),
    });
    const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin'].map(name => [name, file(name)]));

    try {
      await expect(processFileDropzoneFiles(files, deps, {
        viewerState: saved,
        onViewerState: viewerState => applySavedViewerState(viewerState, null),
      })).resolves.toBe(true);

      expect(useTransformStore.getState().splatTransform.translationX).toBe(5);
    } finally {
      useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
      useTransformStore.setState(useTransformStore.getInitialState(), true);
      useUIStore.setState(useUIStore.getInitialState(), true);
      usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    }
  });

  it('lets a settings file inside the files win over settings from their source', async () => {
    const fromSource: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null,
      config: { ui: { backgroundColor: '#111111' } } };
    const inFiles = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null,
      config: { ui: { backgroundColor: '#222222' } } });
    const onViewerState = vi.fn();
    const deps = createDeps({
      parseFiles: vi.fn(async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false })),
      buildReconstruction: vi.fn(async () => ({ reconstruction: createReconstruction(), pointCount: 0 })),
    });
    const files = new Map<string, File>(['cameras.bin', 'images.bin', 'points3D.bin'].map(name => [name, file(name)]));
    files.set('colmapview.yaml', Object.assign(file('colmapview.yaml'), { text: async () => inFiles }));

    await processFileDropzoneFiles(files, deps, { viewerState: fromSource, onViewerState });

    // The file inside replaces the source's settings; they are not applied as well.
    expect(onViewerState).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ config: { ui: { backgroundColor: '#222222' } } }));
  });
});
