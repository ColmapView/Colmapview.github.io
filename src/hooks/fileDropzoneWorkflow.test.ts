import { describe, expect, it, vi } from 'vitest';
import type { Reconstruction } from '../types/colmap';
import { noopLogger, type AppLogger } from '../utils/logger';
import type { FileDropzoneWorkflowDeps } from './fileDropzoneWorkflow';
import { processFileDropzoneFiles } from './fileDropzoneWorkflow';
import { ReconstructionService, ReconstructionSnapshot } from '../wasm/reconstructionService';
import { cancelPendingReconstructionLoad } from '../wasm/reconstructionLoadLifecycle';
import { useReconstructionStore, useTransformStore, useUIStore, usePointCloudStore } from '../store';
import { applyShareConfig } from './useUrlState';
import { createIdentityEuler } from '../utils/sim3dTransforms';
import { serializeDatasetViewerSettings } from '../utils/datasetViewerSettings';
import { getShareActiveSplatSourceId } from '../utils/splatFileSourcePolicy';
import { buildWasmReconstructionWrapper } from '../test/builders';

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
    getSourceInfo: vi.fn(() => ({ imageUrlBase: null, sourceType: 'local' })),
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
      classifyPlyFile: vi.fn(async () => 'point-cloud'),
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
      getSourceInfo: vi.fn(() => ({ imageUrlBase: null, sourceType: 'local' })),
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
      getLoadedFiles: vi.fn(() => currentLoadedFiles),
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
});
