import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReconstructionStore } from '../store';
import { beginReconstructionLoad } from '../wasm/reconstructionLoadLifecycle';
import type { FileDropzoneWorkflowOptions } from './fileDropzoneWorkflow';
import type { ZipLoadResult, ZipProgress } from '../utils/zipLoader';
import {
  buildArchiveEntry,
  buildArchiveReader,
  buildFile,
  buildFileSystemDirectoryHandle,
} from '../test/builders';
import {
  loadBrowsedDirectory,
  loadDropPayload,
  loadLocalZipFile,
} from './fileDropzoneLocalSources';

function makeBaseDeps() {
  return {
    isLoading: vi.fn(() => false),
    cancelUrlLoad: vi.fn(),
    setUrlLoading: vi.fn(),
    setUrlProgress: vi.fn(),
    setError: vi.fn(),
    setSourceInfo: vi.fn(),
    clearCaches: vi.fn(),
    processFiles: vi.fn(async (_files: Map<string, File>, _progress?: { start: number; end: number },
      _options?: FileDropzoneWorkflowOptions): Promise<void | boolean> => {}),
    waitForPaint: vi.fn(async () => {}),
    log: vi.fn(),
    errorLog: vi.fn(),
  };
}

describe('file dropzone local source loading', () => {
  afterEach(() => useReconstructionStore.getState().clear());
  it('ignores duplicate local ZIP loads while another load is active', async () => {
    const deps = {
      ...makeBaseDeps(),
      isLoading: vi.fn(() => true),
      loadZipFromFile: vi.fn(),
      setActiveZipArchive: vi.fn(),
    };

    await expect(loadLocalZipFile(buildFile('scene.zip'), deps)).resolves.toBe(false);

    expect(deps.log).toHaveBeenCalledWith('[ZIP Loader] Already loading, ignoring duplicate request');
    expect(deps.setUrlLoading).not.toHaveBeenCalled();
    expect(deps.loadZipFromFile).not.toHaveBeenCalled();
    expect(deps.cancelUrlLoad).not.toHaveBeenCalled();
  });

  it('loads a local ZIP, activates lazy image extraction, and processes extracted COLMAP files', async () => {
    const zipFile = buildFile('scene.zip');
    const colmapFiles = new Map([['cameras.bin', buildFile('cameras.bin')]]);
    const imageIndex = new Map([['images/a.jpg', buildArchiveEntry({ name: 'a.jpg' })]]);
    const archive = buildArchiveReader();
    const deps = {
      ...makeBaseDeps(),
      loadZipFromFile: vi.fn(async (_file: File, onProgress: (progress: { percent: number }) => void) => {
        onProgress({ percent: 40 });
        return { colmapFiles, imageIndex, archive, fileSize: 4096, imageCount: 1 };
      }),
      setActiveZipArchive: vi.fn(),
    };

    deps.processFiles.mockImplementation(async (_files, _progress, options) => { options?.onSceneReplaced?.(); return true; });

    await expect(loadLocalZipFile(zipFile, deps)).resolves.toBe(true);

    expect(deps.setUrlLoading).toHaveBeenCalledWith(true);
    expect(deps.setUrlProgress).toHaveBeenNthCalledWith(1, { percent: 0, message: 'Opening ZIP archive...' });
    expect(deps.setUrlProgress).toHaveBeenNthCalledWith(2, { percent: 4, message: 'Extracting ZIP archive...' });
    expect(deps.clearCaches).toHaveBeenCalledTimes(1);
    expect(deps.setActiveZipArchive).toHaveBeenCalledWith(archive, imageIndex, 4096, 1);
    expect(deps.setSourceInfo).toHaveBeenCalledWith('zip', null);
    expect(deps.processFiles).toHaveBeenCalledWith(colmapFiles, undefined, expect.objectContaining({
      load: expect.objectContaining({ signal: expect.any(AbortSignal) }), onSceneReplaced: expect.any(Function),
    }));
    expect(deps.cancelUrlLoad.mock.invocationCallOrder[0]).toBeLessThan(deps.loadZipFromFile.mock.invocationCallOrder[0]);
  });

  it('cleans up partial ZIP state and exposes ZIP errors', async () => {
    const deps = {
      ...makeBaseDeps(),
      loadZipFromFile: vi.fn(async () => {
        throw new Error('bad archive');
      }),
      setActiveZipArchive: vi.fn(),
    };

    await expect(loadLocalZipFile(buildFile('bad.zip'), deps)).resolves.toBe(false);

    expect(deps.errorLog).toHaveBeenCalledWith('[ZIP Loader] Error processing ZIP file:', expect.any(Error));
    expect(deps.clearCaches).not.toHaveBeenCalled();
    expect(deps.setError).toHaveBeenCalledWith('bad archive');
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
  });

  it('delegates single archive drops to the ZIP loader', async () => {
    const archiveFile = buildFile('scene.zip');
    const deps = {
      ...makeBaseDeps(),
      collectDroppedFiles: vi.fn(),
      isArchiveFile: vi.fn(() => true),
      processZipFile: vi.fn(async () => {}),
      scanEntry: vi.fn(),
    };

    await expect(loadDropPayload({
      singleFile: archiveFile,
      entries: [],
      fallbackFiles: [archiveFile],
    }, deps)).resolves.toBe(true);

    expect(deps.log).toHaveBeenCalledWith('[Drop] Detected archive file: scene.zip');
    expect(deps.processZipFile).toHaveBeenCalledWith(archiveFile);
    expect(deps.collectDroppedFiles).not.toHaveBeenCalled();
  });

  it('loads non-archive dropped files as a local source', async () => {
    const files = new Map([['images/a.jpg', buildFile('a.jpg')]]);
    const deps = {
      ...makeBaseDeps(),
      collectDroppedFiles: vi.fn(async () => files),
      isArchiveFile: vi.fn(() => false),
      processZipFile: vi.fn(),
      scanEntry: vi.fn(),
    };

    await expect(loadDropPayload({
      singleFile: null,
      entries: [],
      fallbackFiles: [],
    }, deps)).resolves.toBe(true);

    expect(deps.setUrlLoading).toHaveBeenCalledWith(true);
    expect(deps.setUrlProgress).toHaveBeenCalledWith({ percent: 0, message: 'Scanning files...' });
    expect(deps.clearCaches).not.toHaveBeenCalled();
    expect(deps.setSourceInfo).not.toHaveBeenCalled();
    expect(deps.processFiles).toHaveBeenCalledWith(files, undefined, expect.objectContaining({
      onSceneReplaced: expect.any(Function),
    }));
    expect(deps.cancelUrlLoad.mock.invocationCallOrder[0]).toBeLessThan(deps.collectDroppedFiles.mock.invocationCallOrder[0]);
  });

  it('commits dropped files as a local source only when the workflow replaces the scene', async () => {
    const files = new Map([['images/a.jpg', buildFile('a.jpg')]]);
    const deps = {
      ...makeBaseDeps(),
      collectDroppedFiles: vi.fn(async () => files),
      isArchiveFile: vi.fn(() => false),
      processZipFile: vi.fn(),
      scanEntry: vi.fn(),
    };
    deps.processFiles.mockImplementation(async (_files, _progress, options) => {
      options?.onSceneReplaced?.();
    });

    await expect(loadDropPayload({
      singleFile: null,
      entries: [],
      fallbackFiles: [],
    }, deps)).resolves.toBe(true);

    expect(deps.clearCaches).toHaveBeenCalledTimes(1);
    expect(deps.setSourceInfo).toHaveBeenCalledWith('local', null);
  });

  it('reports non-archive dropped-file load failures', async () => {
    const deps = {
      ...makeBaseDeps(),
      collectDroppedFiles: vi.fn(async () => {
        throw new Error('scan failed');
      }),
      isArchiveFile: vi.fn(() => false),
      processZipFile: vi.fn(),
      scanEntry: vi.fn(),
    };

    await expect(loadDropPayload({
      singleFile: null,
      entries: [],
      fallbackFiles: [],
    }, deps)).resolves.toBe(false);

    expect(deps.errorLog).toHaveBeenCalledWith('[File Dropzone] Error processing drop:', expect.any(Error));
    expect(deps.setError).toHaveBeenCalledWith('scan failed');
    expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
  });

  it('reports unsupported directory browse APIs without starting a load', async () => {
    const deps = {
      ...makeBaseDeps(),
      scanDirectoryHandle: vi.fn(),
    };

    await expect(loadBrowsedDirectory(deps)).resolves.toBe(false);

    expect(deps.setError).toHaveBeenCalledWith(
      'Your browser does not support folder selection. Please use drag and drop, or try Chrome/Edge.'
    );
    expect(deps.setUrlLoading).not.toHaveBeenCalled();
  });

  it('loads browsed directories as a local source', async () => {
    const dirHandle = buildFileSystemDirectoryHandle();
    const browsedFile = buildFile('cameras.bin');
    const deps = {
      ...makeBaseDeps(),
      pickDirectory: vi.fn(async () => dirHandle),
      scanDirectoryHandle: vi.fn(async (_handle: FileSystemDirectoryHandle, _path: string, files: Map<string, File>) => {
        files.set('cameras.bin', browsedFile);
      }),
    };

    await expect(loadBrowsedDirectory(deps)).resolves.toBe(true);

    expect(deps.pickDirectory).toHaveBeenCalledOnce();
    expect(deps.setUrlLoading).toHaveBeenCalledWith(true);
    expect(deps.setUrlProgress).toHaveBeenCalledWith({ percent: 0, message: 'Scanning folder...' });
    expect(deps.scanDirectoryHandle).toHaveBeenCalledWith(dirHandle, '', expect.any(Map), expect.any(AbortSignal));
    expect(deps.cancelUrlLoad.mock.invocationCallOrder[0]).toBeLessThan(deps.scanDirectoryHandle.mock.invocationCallOrder[0]);
    expect(deps.clearCaches).not.toHaveBeenCalled();
    expect(deps.setSourceInfo).not.toHaveBeenCalled();
    expect(deps.processFiles).toHaveBeenCalledWith(new Map([['cameras.bin', browsedFile]]), undefined, expect.objectContaining({
      onSceneReplaced: expect.any(Function),
    }));
  });

  it('commits browsed directories as a local source only when the workflow replaces the scene', async () => {
    const dirHandle = buildFileSystemDirectoryHandle();
    const browsedFile = buildFile('cameras.bin');
    const deps = {
      ...makeBaseDeps(),
      pickDirectory: vi.fn(async () => dirHandle),
      scanDirectoryHandle: vi.fn(async (_handle: FileSystemDirectoryHandle, _path: string, files: Map<string, File>) => {
        files.set('cameras.bin', browsedFile);
      }),
    };
    deps.processFiles.mockImplementation(async (_files, _progress, options) => {
      options?.onSceneReplaced?.();
    });

    await expect(loadBrowsedDirectory(deps)).resolves.toBe(true);

    expect(deps.clearCaches).toHaveBeenCalledTimes(1);
    expect(deps.setSourceInfo).toHaveBeenCalledWith('local', null);
  });

  it('treats cancelled directory browsing as a no-op', async () => {
    const abortError = new Error('cancelled');
    abortError.name = 'AbortError';
    const deps = {
      ...makeBaseDeps(),
      pickDirectory: vi.fn(async () => {
        throw abortError;
      }),
      scanDirectoryHandle: vi.fn(),
    };

    await expect(loadBrowsedDirectory(deps)).resolves.toBe(false);

    expect(deps.setError).not.toHaveBeenCalled();
    expect(deps.setUrlLoading).not.toHaveBeenCalled();
    expect(deps.cancelUrlLoad).not.toHaveBeenCalled();
  });

  it.each(['scene.zip', 'scene.tar'])('cancels %s extraction without late progress, activation, or handoff', async name => {
    let resolve!: (result: ZipLoadResult) => void;
    let report!: (progress: { percent: number; message: string }) => void;
    const close = vi.fn(async () => {});
    const archive = buildArchiveReader({ close });
    const deps = { ...makeBaseDeps(), setActiveZipArchive: vi.fn(),
      loadZipFromFile: vi.fn((_file: File, onProgress: (progress: ZipProgress) => void, _signal?: AbortSignal) => {
        report = onProgress;
        return new Promise<ZipLoadResult>(done => { resolve = done; });
      }),
    };
    const pending = loadLocalZipFile(buildFile(name), deps);
    await vi.waitFor(() => expect(deps.loadZipFromFile).toHaveBeenCalledOnce());
    const signal = deps.loadZipFromFile.mock.calls[0][2] as AbortSignal;
    useReconstructionStore.getState().clear();
    await expect(pending).resolves.toBe(false);
    expect(signal.aborted).toBe(true);
    const progressCount = deps.setUrlProgress.mock.calls.length;
    report({ percent: 90, message: 'late extraction' });
    resolve({ colmapFiles: new Map(), imageIndex: new Map(), archive, fileSize: 1, imageCount: 0 });
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(deps.setUrlProgress).toHaveBeenCalledTimes(progressCount);
    expect(deps.processFiles).not.toHaveBeenCalled();
    expect(deps.setActiveZipArchive).not.toHaveBeenCalled();
    expect(deps.clearCaches).not.toHaveBeenCalled();
    expect(deps.setError).not.toHaveBeenCalled();
  });

  it('retains the previous archive when replacement processing fails and closes the staged reader', async () => {
    const close = vi.fn(async () => {});
    const deps = { ...makeBaseDeps(), setActiveZipArchive: vi.fn(),
      loadZipFromFile: vi.fn(async () => ({ colmapFiles: new Map(), imageIndex: new Map(),
        archive: buildArchiveReader({ close }), fileSize: 1, imageCount: 0 })),
    };
    deps.processFiles.mockResolvedValue(false);
    await expect(loadLocalZipFile(buildFile('replacement.zip'), deps)).resolves.toBe(false);
    expect(close).toHaveBeenCalledOnce();
    expect(deps.clearCaches).not.toHaveBeenCalled();
    expect(deps.setActiveZipArchive).not.toHaveBeenCalled();
    expect(deps.setSourceInfo).not.toHaveBeenCalled();
  });

  it.each(['clear', 'replacement'])('stops dropped-folder scanning after %s and ignores a late result', async action => {
    let resolve!: (files: Map<string, File>) => void;
    const deps = { ...makeBaseDeps(), isArchiveFile: vi.fn(() => false), processZipFile: vi.fn(), scanEntry: vi.fn(),
      collectDroppedFiles: vi.fn(() => new Promise<Map<string, File>>(done => { resolve = done; })),
    };
    const pending = loadDropPayload({ singleFile: null, entries: [], fallbackFiles: [] }, deps);
    await vi.waitFor(() => expect(deps.collectDroppedFiles).toHaveBeenCalledOnce());
    const replacement = action === 'replacement' ? beginReconstructionLoad() : null;
    if (!replacement) useReconstructionStore.getState().clear();
    await expect(pending).resolves.toBe(false);
    resolve(new Map([['cameras.bin', buildFile('cameras.bin')]]));
    await Promise.resolve();
    expect(deps.processFiles).not.toHaveBeenCalled();
    expect(deps.setSourceInfo).not.toHaveBeenCalled();
    expect(deps.setError).not.toHaveBeenCalled();
    replacement?.finish();
  });

  it.each(['picker', 'scan'])('cancels folder browsing during the %s stage', async stage => {
    let resolve!: () => void;
    const handle = buildFileSystemDirectoryHandle();
    const deps = { ...makeBaseDeps(),
      pickDirectory: vi.fn(() => stage === 'picker' ? new Promise<FileSystemDirectoryHandle>(done => { resolve = () => done(handle); }) : Promise.resolve(handle)),
      scanDirectoryHandle: vi.fn(() => new Promise<void>(done => { resolve = done; })),
    };
    const pending = loadBrowsedDirectory(deps);
    await vi.waitFor(() => expect(stage === 'picker' ? deps.pickDirectory : deps.scanDirectoryHandle).toHaveBeenCalledOnce());
    useReconstructionStore.getState().clear();
    await expect(pending).resolves.toBe(false);
    resolve();
    await Promise.resolve();
    expect(deps.processFiles).not.toHaveBeenCalled();
    expect(deps.setError).not.toHaveBeenCalled();
    if (stage === 'picker') expect(deps.scanDirectoryHandle).not.toHaveBeenCalled();
  });
});
