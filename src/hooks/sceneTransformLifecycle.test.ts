import { emptyParseResult, stubbedParsing } from '../test/workflowStubs';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmReload, useDeletionStore, useReconstructionStore, useSplatBackendStore, useTransformStore, useUIStore } from '../store';
import type { FileDropzoneWorkflowDeps, processFileDropzoneFiles } from './fileDropzoneWorkflow';
import { useFileDropzone } from './useFileDropzone';
import { executeTransformGizmoContextMenuAction } from '../components/viewer3d/transformGizmoContextMenuExecutor';
import { applySavedViewerState } from './useUrlState';
import { buildTextFile, buildFile, buildReconstruction } from '../test/builders';
import { serializeDatasetViewerSettings } from '../utils/datasetViewerSettings';
import type { PublishedViewerState } from '../utils/publishedViewerState';
import { createIdentityEuler } from '../utils/sim3dTransforms';

const { processFileDropzoneFilesMock } = vi.hoisted(() => ({
  processFileDropzoneFilesMock: vi.fn<typeof processFileDropzoneFiles>(),
}));

vi.mock('./fileDropzoneWorkflow', () => ({
  processFileDropzoneFiles: processFileDropzoneFilesMock,
}));

// Loaded while the file is collected, where no timeout applies (a cold ~1 s transform).
const actualWorkflow = await vi.importActual<typeof import('./fileDropzoneWorkflow')>('./fileDropzoneWorkflow');

const alignment = { ...createIdentityEuler(), rotationY: 0.5, translationX: 2 };
const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null, config: { transform: alignment } };
const datasetFiles = () => new Map(['cameras.bin', 'images.bin', 'points3D.bin']
  .map((name): [string, File] => [name, buildFile(name)]));
const parsed: FileDropzoneWorkflowDeps['parseFiles'] = async () => emptyParseResult();

/** Every load runs the real workflow behind processFiles, with this parse. */
let parseFiles: FileDropzoneWorkflowDeps['parseFiles'];

/** A URL dataset as the loader leaves it: settings retained beside its files, then applied. */
async function showPublishedDataset(files: Map<string, File>) {
  useReconstructionStore.getState().setDroppedFiles(files);
  useReconstructionStore.getState().setSourceViewerState(saved);
  await applySavedViewerState(saved, null);
  const scene = buildReconstruction();
  useReconstructionStore.setState({ reconstruction: scene });
  return scene;
}

/** Reload through the gizmo menu, as a user does; hands back the Reload under way. */
async function reloadFromMenu(files: Map<string, File>, reloadFiles: (files: Map<string, File>) => Promise<boolean>) {
  let reloading: Promise<boolean> | undefined;
  await executeTransformGizmoContextMenuAction('reload', {
    resetTransform: useTransformStore.getState().resetTransform, applyTransformToData: vi.fn(),
    setShowGizmo: vi.fn(), closeContextMenu: vi.fn(), droppedFiles: files, confirmReload,
    reloadFiles: reloadedFiles => { reloading = reloadFiles(reloadedFiles); },
  });
  if (!reloading) throw new Error('Reload did not start');
  return { reloading };
}

describe('the scene transform across loads and Reloads', () => {
  beforeEach(() => {
    parseFiles = parsed;
    processFileDropzoneFilesMock.mockImplementation((files, deps, options) => actualWorkflow.processFileDropzoneFiles(files, {
      ...deps, ...stubbedParsing(), parseFiles: input => parseFiles!(input),
    }, options));
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
  });

  afterEach(() => {
    // Unmount first: resetting the store under a mounted hook is an update outside act().
    cleanup();
    useReconstructionStore.getState().clear();
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
    vi.restoreAllMocks();
    processFileDropzoneFilesMock.mockReset();
  });

  /** A parse that waits for the test: it fails, or ends when the load is cancelled. */
  function stalledParse(outcome: 'cancelled' | 'failed') {
    let parseStarted!: () => void;
    const parsing = new Promise<void>(resolve => { parseStarted = resolve; });
    parseFiles = ({ signal }) => new Promise<never>((_resolve, reject) => {
      parseStarted();
      if (outcome === 'failed') reject(new DOMException('The requested file could not be read.', 'NotReadableError'));
      else signal?.addEventListener('abort', () => reject(signal.reason));
    });
    return parsing;
  }

  async function endReload(outcome: 'cancelled' | 'failed', reloading: Promise<boolean>) {
    if (outcome === 'cancelled') act(() => useReconstructionStore.getState().cancelLoading());
    await act(async () => { expect(await reloading).toBe(false); });
  }

  it.each(['cancelled', 'failed'] as const)('keeps the saved alignment, with nothing to ask next time, when a Reload is %s', async outcome => {
    const files = datasetFiles();
    const scene = await showPublishedDataset(files);
    const parsing = stalledParse(outcome);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = renderHook(() => useFileDropzone());
    let reloading!: Promise<boolean>;
    await act(async () => {
      ({ reloading } = await reloadFromMenu(files, result.current.reloadFiles));
      await parsing;
    });

    await endReload(outcome, reloading);

    expect(useReconstructionStore.getState().reconstruction).toBe(scene);
    expect(useTransformStore.getState().transform).toEqual(alignment);
    // Nothing changed, so the next Reload has nothing to lose and asks nothing.
    await expect(confirmReload()).resolves.toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'failed'] as const)('keeps applied edits and pending marks when a confirmed Reload is %s', async outcome => {
    const files = datasetFiles();
    await showPublishedDataset(files);
    const edited = buildReconstruction();
    useReconstructionStore.getState().setReconstruction(edited, { edited: true });
    useDeletionStore.getState().markForDeletion(1);
    const parsing = stalledParse(outcome);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = renderHook(() => useFileDropzone());
    let reloading!: Promise<boolean>;
    await act(async () => {
      ({ reloading } = await reloadFromMenu(files, result.current.reloadFiles));
      await parsing;
    });
    expect(confirm).toHaveBeenCalledOnce();

    await endReload(outcome, reloading);

    expect(useReconstructionStore.getState()).toMatchObject({ reconstruction: edited, reconstructionEditRevision: 1 });
    expect(useDeletionStore.getState().pendingDeletions).toEqual(new Set([1]));
    expect(useTransformStore.getState().transform).toEqual(alignment);
  });

  it('shows the reloaded scene at its saved alignment from the moment it commits', async () => {
    const files = datasetFiles();
    await showPublishedDataset(files);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    // Read once the synchronous work under way has ended: nothing can paint before these microtasks run.
    const shown: unknown[] = [];
    const record = () => queueMicrotask(() => shown.push(useTransformStore.getState().transform));
    const unsubscribe = [useTransformStore.subscribe(record), useReconstructionStore.subscribe(record)];
    const { result } = renderHook(() => useFileDropzone());

    await act(async () => { expect(await (await reloadFromMenu(files, result.current.reloadFiles)).reloading).toBe(true); });
    unsubscribe.forEach(stop => stop());

    expect(shown.length).toBeGreaterThan(0);
    expect(shown).toEqual(shown.map(() => alignment));
  });

  it('discards a hand-made alignment when the reloaded scene commits', async () => {
    const files = datasetFiles();
    useReconstructionStore.getState().setDroppedFiles(files);
    useTransformStore.getState().setTransform({ scale: 3 });
    const { result } = renderHook(() => useFileDropzone());

    await act(async () => { expect(await result.current.reloadFiles(files)).toBe(true); });

    expect(useTransformStore.getState().transform).toEqual(createIdentityEuler());
  });

  it('brings the saved alignment back over a hand-made one', async () => {
    const files = datasetFiles();
    useReconstructionStore.getState().setDroppedFiles(files);
    useReconstructionStore.getState().setSourceViewerState(saved);
    useTransformStore.getState().setTransform({ scale: 3 });
    const { result } = renderHook(() => useFileDropzone());

    await act(async () => { expect(await result.current.reloadFiles(files)).toBe(true); });

    expect(useTransformStore.getState().transform).toEqual(alignment);
  });

  it("starts a new dataset without settings at identity, whatever the previous one's alignment", async () => {
    const { result } = renderHook(() => useFileDropzone());
    await act(async () => { expect(await result.current.processFiles(datasetFiles())).toBe(true); });
    useTransformStore.getState().setTransform(alignment);

    await act(async () => { expect(await result.current.processFiles(datasetFiles())).toBe(true); });

    expect(useTransformStore.getState().transform).toEqual(createIdentityEuler());
  });

  it('shows a new dataset at the alignment its own colmapview.yaml saves', async () => {
    const { result } = renderHook(() => useFileDropzone());
    await act(async () => { expect(await result.current.processFiles(datasetFiles())).toBe(true); });
    useTransformStore.getState().setTransform({ scale: 3 });
    const yaml = serializeDatasetViewerSettings(saved);
    const next = datasetFiles();
    // jsdom's File has no text().
    next.set('colmapview.yaml', buildTextFile('colmapview.yaml', yaml));

    await act(async () => { expect(await result.current.processFiles(next)).toBe(true); });

    expect(useTransformStore.getState().transform).toEqual(alignment);
  });

  it('keeps the alignment when a splat is dropped onto the open scene', async () => {
    const { result } = renderHook(() => useFileDropzone());
    await act(async () => { expect(await result.current.processFiles(datasetFiles())).toBe(true); });
    const scene = useReconstructionStore.getState().reconstruction;
    useTransformStore.getState().setTransform(alignment);

    await act(async () => { expect(await result.current.processFiles(new Map([['extra.spz', buildFile('extra.spz')]]))).toBe(true); });

    expect(useReconstructionStore.getState().reconstruction).toBe(scene);
    expect(useReconstructionStore.getState().loadedFiles?.splatFile?.name).toBe('extra.spz');
    expect(useTransformStore.getState().transform).toEqual(alignment);
  });
});
