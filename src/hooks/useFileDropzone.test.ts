import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotificationStore, useReconstructionStore, useSplatBackendStore, useUIStore } from '../store';
import type { DragEvent } from 'react';
import type { FileDropzoneWorkflowDeps, processFileDropzoneFiles } from './fileDropzoneWorkflow';
import { useFileDropzone } from './useFileDropzone';
import { buildFile, buildFileSystemFileEntry, buildLoadedFiles, buildReconstruction } from '../test/builders';
import { serializeDatasetViewerSettings } from '../utils/datasetViewerSettings';
import type { PublishedViewerState } from '../utils/publishedViewerState';
import { createIdentityEuler } from '../utils/sim3dTransforms';
import { OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE, showOptionalSettingsTimeoutWarning } from './optionalSettingsWarning';
import { appLogger, noopLogger } from '../utils/logger';

const { processFileDropzoneFilesMock } = vi.hoisted(() => ({
  processFileDropzoneFilesMock: vi.fn<typeof processFileDropzoneFiles>(async () => true),
}));

vi.mock('./fileDropzoneWorkflow', () => ({
  processFileDropzoneFiles: processFileDropzoneFilesMock,
}));

// Loaded while the file is collected, where no timeout applies: the real workflow's module graph
// is a cold ~1 s transform that one test's 5 s budget should not absorb under parallel load.
const actualWorkflow = await vi.importActual<typeof import('./fileDropzoneWorkflow')>('./fileDropzoneWorkflow');

async function captureWorkflowDeps(): Promise<FileDropzoneWorkflowDeps> {
  const { result } = renderHook(() => useFileDropzone());
  await result.current.processFiles(new Map());

  const deps = processFileDropzoneFilesMock.mock.calls.at(-1)?.[1] as FileDropzoneWorkflowDeps | undefined;
  if (!deps) throw new Error('processFileDropzoneFiles was not called');
  return deps;
}

const ply = new File(['x'], 'scene.ply');

describe('useFileDropzone', () => {
  afterEach(() => {
    // Unmount first: resetting the store under a mounted hook is an update outside act().
    cleanup();
    useReconstructionStore.getState().clear();
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    // The drop handlers log their scan progress through appLogger directly.
    vi.spyOn(appLogger, 'info').mockImplementation(() => undefined);
    processFileDropzoneFilesMock.mockClear();
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('cancels pending URL settings when local files are dropped', async () => {
    const signal = useReconstructionStore.getState().tryStartUrlLoad()!;
    useReconstructionStore.getState().setUrlLoading(false);
    const { result } = renderHook(() => useFileDropzone());
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: {
      types: ['Files'], items: [], files: [new File(['ui: {}'], 'colmapview.yaml')],
    } } as unknown as DragEvent<HTMLElement>;
    await act(async () => { await result.current.handleDrop(event); });
    expect(signal.aborted).toBe(true);
    expect(useReconstructionStore.getState().urlLoadController).toBeNull();
    expect(processFileDropzoneFilesMock).toHaveBeenCalled();
  });

  it('removes the previous dataset\'s settings timeout warning when local files are dropped', async () => {
    showOptionalSettingsTimeoutWarning();
    const { result } = renderHook(() => useFileDropzone());
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: {
      types: ['Files'], items: [], files: [new File(['x'], 'cameras.bin')],
    } } as unknown as DragEvent<HTMLElement>;
    await act(async () => { await result.current.handleDrop(event); });
    expect(useNotificationStore.getState().notifications).not.toContainEqual(expect.objectContaining({
      message: OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE }));
  });

  it('starts a dropped load with no splat request left by the previous dataset', async () => {
    const shown = buildFile('scene.spz');
    useReconstructionStore.getState().setLoadedFiles({ ...buildLoadedFiles(), splatFile: shown, splatFiles: [shown],
      splatFileSources: [{ id: 'scene.spz', path: 'scene.spz', file: shown }] });
    await act(async () => { await useReconstructionStore.getState().selectSplatSource('scene.spz'); });
    let requestedWhenProcessing: string | null | undefined;
    processFileDropzoneFilesMock.mockImplementationOnce(async () => {
      requestedWhenProcessing = useReconstructionStore.getState().requestedSplatSourceId;
      return true;
    });
    const { result } = renderHook(() => useFileDropzone());
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: {
      types: ['Files'], items: [], files: [buildFile('cameras.bin')],
    } } as unknown as DragEvent<HTMLElement>;
    await act(async () => { await result.current.handleDrop(event); });
    expect(processFileDropzoneFilesMock).toHaveBeenCalledOnce();
    expect(requestedWhenProcessing).toBeNull();
  });

  it("shows the next dropped dataset's own default after a splat was picked on the previous one", async () => {
    // The real workflow over the store this hook wires up, with parsing stubbed.
    const realProcessing: typeof processFileDropzoneFiles = (files, deps, options) => actualWorkflow.processFileDropzoneFiles(files, {
      ...deps, logger: noopLogger, clearCaches: vi.fn(), delay: async () => {}, shouldPreloadSplatRuntime: () => false,
      parseFiles: async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false }),
      buildReconstruction: async () => ({ reconstruction: buildReconstruction(), pointCount: 0 }),
    }, options);
    processFileDropzoneFilesMock.mockImplementationOnce(realProcessing).mockImplementationOnce(realProcessing);
    const drop = (files: File[]) => ({ preventDefault: vi.fn(), stopPropagation: vi.fn(),
      dataTransfer: { types: ['Files'], items: [], files } }) as unknown as DragEvent<HTMLElement>;
    const colmap = () => ['cameras.bin', 'images.bin', 'points3D.bin'].map(name => buildFile(name));
    const { result } = renderHook(() => useFileDropzone());

    const firstScene = buildFile('scene.spz', 'first scene');
    await act(async () => { await result.current.handleDrop(drop([...colmap(), buildFile('other.spz', 'first default, larger'), firstScene])); });
    await act(async () => { await useReconstructionStore.getState().selectSplatSource('scene.spz'); });
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(firstScene);

    const nextDefault = buildFile('big.spz', 'next default, larger again');
    await act(async () => { await result.current.handleDrop(drop([...colmap(), nextDefault, buildFile('scene.spz', 'next scene')])); });
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(nextDefault);
  });

  it('does not preload the spark runtime when webgpu is the resolved splat backend', async () => {
    useSplatBackendStore.setState({
      requestedBackend: 'webgpu',
      availability: { webGpu: 'ready', webGpuFailureReason: null, spark: false },
    });

    const deps = await captureWorkflowDeps();

    expect(deps.shouldPreloadSplatRuntime?.(ply)).toBe(false);
  });

  it('preloads the spark runtime when webgpu cannot work in this browser', async () => {
    useSplatBackendStore.setState({
      requestedBackend: 'auto',
      availability: { webGpu: 'unsupported', webGpuFailureReason: null, spark: false },
    });

    const deps = await captureWorkflowDeps();

    expect(deps.shouldPreloadSplatRuntime?.(ply)).toBe(true);
  });

  it('does not preload the spark runtime while the webgpu renderer is still undecided', async () => {
    // A fresh page on a WebGPU-capable machine reports 'unavailable' until a
    // splat canvas mounts, so preloading here cost a 5 MB download on the
    // first drop of every session.
    useSplatBackendStore.setState({
      requestedBackend: 'auto',
      availability: { webGpu: 'unavailable', webGpuFailureReason: null, spark: false },
    });

    const deps = await captureWorkflowDeps();

    expect(deps.shouldPreloadSplatRuntime?.(ply)).toBe(false);
  });

  it('records a failed drop-time preload so nothing re-requests the chunk', async () => {
    useSplatBackendStore.setState({
      requestedBackend: 'auto',
      availability: { webGpu: 'unsupported', webGpuFailureReason: null, spark: false },
    });

    const deps = await captureWorkflowDeps();
    expect(deps.shouldPreloadSplatRuntime?.(ply)).toBe(true);

    // The drop-time attempt is the first of three in the app; if its failure
    // only reaches the log, the store keeps waiting on a download nobody is
    // making and the renderer-side attempts re-request the 5 MB chunk.
    deps.onSplatRuntimePreloadFailed?.();

    expect(useSplatBackendStore.getState().availability.sparkPreloadFailed).toBe(true);
    expect(deps.shouldPreloadSplatRuntime?.(ply)).toBe(false);
  });

  it('reads the backend at drop time, not at hook render time', async () => {
    useSplatBackendStore.setState({
      requestedBackend: 'auto',
      availability: { webGpu: 'unsupported', webGpuFailureReason: null, spark: false },
    });

    const deps = await captureWorkflowDeps();
    expect(deps.shouldPreloadSplatRuntime?.(ply)).toBe(true);

    useSplatBackendStore.getState().setWebGpuBackendState('ready');

    expect(deps.shouldPreloadSplatRuntime?.(ply)).toBe(false);
  });

  it('preloads the spark runtime for an incoming SOG even while webgpu is ready', async () => {
    // The dropped file is not active yet, so the gate must judge it by name
    // rather than by the backend store's current active-splat requirement.
    useSplatBackendStore.setState({
      requestedBackend: 'auto',
      availability: { webGpu: 'ready', webGpuFailureReason: null, spark: false },
    });

    const deps = await captureWorkflowDeps();

    expect(deps.shouldPreloadSplatRuntime?.(new File(['x'], 'scene.sog'))).toBe(true);
    expect(deps.shouldPreloadSplatRuntime?.(ply)).toBe(false);
  });

  it('preserves an explicit None choice while restoring unrelated local YAML settings', async () => {
    const deps = await captureWorkflowDeps();
    const a = buildFile('a.spz');
    const b = buildFile('b.spz');
    act(() => useReconstructionStore.getState().setLoadedFiles({ ...buildLoadedFiles(), splatFile: a, splatFiles: [a, b],
      splatFileSources: [{ id: 'a.spz', path: 'a.spz', file: a }, { id: 'b.spz', path: 'b.spz', file: b }],
    }));
    await act(async () => { await useReconstructionStore.getState().selectSplatSource(''); });
    await act(async () => { await deps.onViewerState?.({ version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'b.spz' }, ui: { backgroundColor: '#234567' } },
    }); });
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useUIStore.getState().backgroundColor).toBe('#234567');
  });

  it('captures the selection revision before dropped-folder preparation', async () => {
    const a = buildFile('a.spz');
    const b = buildFile('b.spz');
    useReconstructionStore.getState().setLoadedFiles({ ...buildLoadedFiles(), splatFile: a, splatFiles: [a, b],
      splatFileSources: [{ id: 'a.spz', path: 'a.spz', file: a }, { id: 'b.spz', path: 'b.spz', file: b }],
    });
    const entry = buildFileSystemFileEntry({ name: 'colmapview.yaml' });
    let resolve!: FileCallback;
    vi.spyOn(entry, 'file').mockImplementation(done => { resolve = done; });
    const { result } = renderHook(() => useFileDropzone());
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: {
      types: ['Files'], items: [{ kind: 'file', webkitGetAsEntry: () => entry }], files: [],
    } } as unknown as DragEvent<HTMLElement>;
    // The drop shows its loading state synchronously; start it inside act().
    let pending!: Promise<void>;
    act(() => { pending = result.current.handleDrop(event); });
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    await act(async () => { await useReconstructionStore.getState().selectSplatSource(''); });
    await act(async () => { resolve(buildFile('colmapview.yaml')); await pending; });
    const options = processFileDropzoneFilesMock.mock.calls.at(-1)?.[2] as import('./fileDropzoneWorkflow').FileDropzoneWorkflowOptions;
    await act(async () => { await options.onViewerState?.({ version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'b.spz' }, ui: { backgroundColor: '#345678' } },
    }); });
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useUIStore.getState().backgroundColor).toBe('#345678');
  });

  it.each(['a local drop', 'processFiles'] as const)('restores saved settings against the revision the workflow passes (%s)', async caller => {
    const a = buildFile('a.spz');
    const b = buildFile('b.spz');
    useReconstructionStore.getState().setLoadedFiles({ ...buildLoadedFiles(), splatFile: a, splatFiles: [a, b],
      splatFileSources: [{ id: 'a.spz', path: 'a.spz', file: a }, { id: 'b.spz', path: 'b.spz', file: b }],
    });
    const { result } = renderHook(() => useFileDropzone());
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: {
      types: ['Files'], items: [], files: [buildFile('colmapview.yaml')],
    } } as unknown as DragEvent<HTMLElement>;
    await act(async () => { await (caller === 'processFiles' ? result.current.processFiles(new Map()) : result.current.handleDrop(event)); });
    const options = processFileDropzoneFilesMock.mock.calls.at(-1)?.[2] as import('./fileDropzoneWorkflow').FileDropzoneWorkflowOptions;
    // A choice the commit ignored, made for the scene the load replaced.
    await act(async () => { await useReconstructionStore.getState().selectSplatSource('a.spz'); });
    await act(async () => { await options.onViewerState?.({ version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'b.spz' } } }, useReconstructionStore.getState().splatSelectionRevision); });
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(b);
  });

  it('rejects saved local settings from a cancelled job without changing the viewer', async () => {
    const deps = await captureWorkflowDeps();
    const initialColor = useUIStore.getState().backgroundColor;
    act(() => useReconstructionStore.getState().clear());
    await expect(deps.onViewerState?.({ version: 1, viewerVersion: 'test', viewState: null,
      config: { ui: { backgroundColor: '#456789' } },
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(useUIStore.getState().backgroundColor).toBe(initialColor);
  });

  it('returns unsuccessful processing without committing a local scene', async () => {
    processFileDropzoneFilesMock.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useFileDropzone());
    await expect(result.current.processFiles(new Map())).resolves.toBe(false);
  });

  it('keeps None through actual local COLMAP commit and saved YAML restoration', async () => {
    const a = buildFile('a.spz');
    const b = buildFile('b.spz');
    useReconstructionStore.getState().setLoadedFiles({ ...buildLoadedFiles(), splatFile: a, splatFiles: [a, b],
      splatFileSources: [{ id: 'a.spz', path: 'a.spz', file: a }, { id: 'b.spz', path: 'b.spz', file: b }],
    });
    const deps = await captureWorkflowDeps();
    const options = processFileDropzoneFilesMock.mock.calls.at(-1)?.[2] as import('./fileDropzoneWorkflow').FileDropzoneWorkflowOptions;
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'b.spz' }, ui: { backgroundColor: '#56789a' } },
    });
    const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin'].map(name => [name, buildFile(name)]));
    files.set('a.spz', a);
    files.set('b.spz', b);
    files.set('colmapview.yaml', Object.assign(buildFile('colmapview.yaml'), { text: async () => yaml }));
    let resolve!: () => void;
    let pending!: Promise<boolean>;
    // The real workflow publishes progress to the mounted hook's store until it reaches the paint delay.
    await act(async () => {
      pending = actualWorkflow.processFileDropzoneFiles(files, { ...deps, logger: noopLogger,
        parseFiles: async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false }),
        buildReconstruction: async () => ({ reconstruction: buildReconstruction(), pointCount: 0 }),
        delay: () => new Promise<void>(done => { resolve = done; }),
        clearCaches: vi.fn(), shouldPreloadSplatRuntime: () => false,
      }, options);
      await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    });
    await act(async () => { await useReconstructionStore.getState().selectSplatSource(''); });
    await act(async () => { resolve(); expect(await pending).toBe(true); });
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(2);
    expect(useUIStore.getState().backgroundColor).toBe('#56789a');
  });

  it('reloads the current dataset without dropping its remote splat tiles', async () => {
    const { result } = renderHook(() => useFileDropzone());
    const files = new Map([['cameras.bin', buildFile('cameras.bin')]]);
    await act(async () => { await result.current.reloadFiles(files); });
    expect(processFileDropzoneFilesMock).toHaveBeenLastCalledWith(files, expect.anything(),
      expect.objectContaining({ reload: true }));
    await act(async () => { await result.current.processFiles(files); });
    expect(processFileDropzoneFilesMock).toHaveBeenLastCalledWith(files, expect.anything(),
      expect.objectContaining({ reload: false }));
  });

  it('re-applies saved source settings only to the files they came with', async () => {
    const files = new Map([['cameras.bin', buildFile('cameras.bin')]]);
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null, config: {} };
    useReconstructionStore.getState().setDroppedFiles(files);
    useReconstructionStore.getState().setSourceViewerState(saved);
    const { result } = renderHook(() => useFileDropzone());

    await act(async () => { await result.current.reloadFiles(files); });
    expect(processFileDropzoneFilesMock).toHaveBeenLastCalledWith(files, expect.anything(),
      expect.objectContaining({ viewerState: saved }));

    const other = new Map(files);
    await act(async () => { await result.current.reloadFiles(other); });
    expect(processFileDropzoneFilesMock).toHaveBeenLastCalledWith(other, expect.anything(),
      expect.objectContaining({ viewerState: undefined }));
  });

  it('keeps the splat on screen when Reload re-applies saved source settings', async () => {
    const files = new Map([['cameras.bin', buildFile('cameras.bin')]]);
    const transform = { ...createIdentityEuler(), translationX: 5 };
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'splats/a.spz', transform } } };
    useReconstructionStore.getState().setDroppedFiles(files);
    useReconstructionStore.getState().setSourceViewerState(saved);
    const { result } = renderHook(() => useFileDropzone());

    await act(async () => { await result.current.reloadFiles(files); });

    // The settings go whole to the workflow, which keeps the splat on screen for a reload.
    expect(processFileDropzoneFilesMock).toHaveBeenLastCalledWith(files, expect.anything(),
      expect.objectContaining({ reload: true, viewerState: saved }));
    expect(useReconstructionStore.getState().sourceViewerState?.state).toBe(saved);
  });
});
