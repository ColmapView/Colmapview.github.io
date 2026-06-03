import { describe, expect, it, vi } from 'vitest';
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
    setUrlLoading: vi.fn(),
    setUrlProgress: vi.fn(),
    setError: vi.fn(),
    setSourceInfo: vi.fn(),
    clearCaches: vi.fn(),
    processFiles: vi.fn(async () => {}),
    waitForPaint: vi.fn(async () => {}),
    log: vi.fn(),
    errorLog: vi.fn(),
  };
}

describe('file dropzone local source loading', () => {
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

    await expect(loadLocalZipFile(zipFile, deps)).resolves.toBe(true);

    expect(deps.setUrlLoading).toHaveBeenCalledWith(true);
    expect(deps.setUrlProgress).toHaveBeenNthCalledWith(1, { percent: 0, message: 'Opening ZIP archive...' });
    expect(deps.setUrlProgress).toHaveBeenNthCalledWith(2, { percent: 4, message: 'Extracting ZIP archive...' });
    expect(deps.clearCaches).toHaveBeenCalledTimes(1);
    expect(deps.setActiveZipArchive).toHaveBeenCalledWith(archive, imageIndex, 4096, 1);
    expect(deps.setSourceInfo).toHaveBeenCalledWith('zip', null);
    expect(deps.processFiles).toHaveBeenCalledWith(colmapFiles);
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
    expect(deps.clearCaches).toHaveBeenCalledTimes(2);
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
    expect(deps.clearCaches).toHaveBeenCalledTimes(1);
    expect(deps.setSourceInfo).toHaveBeenCalledWith('local', null);
    expect(deps.processFiles).toHaveBeenCalledWith(files);
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
    expect(deps.scanDirectoryHandle).toHaveBeenCalledWith(dirHandle, '', expect.any(Map));
    expect(deps.clearCaches).toHaveBeenCalledTimes(1);
    expect(deps.setSourceInfo).toHaveBeenCalledWith('local', null);
    expect(deps.processFiles).toHaveBeenCalledWith(new Map([['cameras.bin', browsedFile]]));
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
  });
});
