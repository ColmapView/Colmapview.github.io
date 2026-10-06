import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReconstructionStore, useSplatBackendStore, useUIStore } from '../store';
import type { DragEvent } from 'react';
import type { FileDropzoneWorkflowDeps } from './fileDropzoneWorkflow';
import { useFileDropzone } from './useFileDropzone';
import { buildFile, buildFileSystemFileEntry, buildLoadedFiles, buildReconstruction } from '../test/builders';
import { serializeDatasetViewerSettings } from '../utils/datasetViewerSettings';

const { processFileDropzoneFilesMock } = vi.hoisted(() => ({
  processFileDropzoneFilesMock: vi.fn(async () => true),
}));

vi.mock('./fileDropzoneWorkflow', () => ({
  processFileDropzoneFiles: processFileDropzoneFilesMock,
}));

async function captureWorkflowDeps(): Promise<FileDropzoneWorkflowDeps> {
  const { result } = renderHook(() => useFileDropzone());
  await result.current.processFiles(new Map());

  const deps = processFileDropzoneFilesMock.mock.calls.at(-1)?.[1] as FileDropzoneWorkflowDeps | undefined;
  if (!deps) throw new Error('processFileDropzoneFiles was not called');
  return deps;
}

const ply = new File(['x'], 'scene.ply');

describe('useFileDropzone', () => {
  afterEach(() => useReconstructionStore.getState().clear());
  beforeEach(() => {
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
    useReconstructionStore.getState().setLoadedFiles({ ...buildLoadedFiles(), splatFile: a, splatFiles: [a, b],
      splatFileSources: [{ id: 'a.spz', path: 'a.spz', file: a }, { id: 'b.spz', path: 'b.spz', file: b }],
    });
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
    const pending = result.current.handleDrop(event);
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    await act(async () => { await useReconstructionStore.getState().selectSplatSource(''); });
    resolve(buildFile('colmapview.yaml'));
    await act(async () => { await pending; });
    const options = processFileDropzoneFilesMock.mock.calls.at(-1)?.[2] as import('./fileDropzoneWorkflow').FileDropzoneWorkflowOptions;
    await act(async () => { await options.onViewerState?.({ version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'b.spz' }, ui: { backgroundColor: '#345678' } },
    }); });
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useUIStore.getState().backgroundColor).toBe('#345678');
  });

  it('rejects saved local settings from a cancelled job without changing the viewer', async () => {
    const deps = await captureWorkflowDeps();
    const initialColor = useUIStore.getState().backgroundColor;
    useReconstructionStore.getState().clear();
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
    const actual = await vi.importActual<typeof import('./fileDropzoneWorkflow')>('./fileDropzoneWorkflow');
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
    const pending = actual.processFileDropzoneFiles(files, { ...deps,
      parseFiles: async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), usedWasmPath: false }),
      buildReconstruction: async () => ({ reconstruction: buildReconstruction(), pointCount: 0 }),
      delay: () => new Promise<void>(done => { resolve = done; }),
      clearCaches: vi.fn(), shouldPreloadSplatRuntime: () => false,
    }, options);
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    await act(async () => { await useReconstructionStore.getState().selectSplatSource(''); });
    resolve();
    await act(async () => { expect(await pending).toBe(true); });
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(2);
    expect(useUIStore.getState().backgroundColor).toBe('#56789a');
  });
});
