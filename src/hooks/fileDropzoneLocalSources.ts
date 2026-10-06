import type { ClearAllOptions } from '../cache';
import type { ReconstructionSourceType } from '../store/reconstructionStore';
import type { ArchiveEntry, ArchiveReader } from '../types/libarchive';
import type { UrlLoadProgress } from '../types/manifest';
import { appLogger } from '../utils/logger';
import { awaitWithAbort } from '../utils/awaitWithAbort';
import { closeZipArchive } from '../utils/zipArchiveState';
import { beginReconstructionLoad } from '../wasm/reconstructionLoadLifecycle';
import type { ZipLoadResult, ZipProgress } from '../utils/zipLoader';
import type { FileDropPayload } from './fileDropzoneDropPayload';
import type { FileDropzoneWorkflowOptions } from './fileDropzoneWorkflow';

type ProcessFiles = (
  files: Map<string, File>,
  progressRange?: { start: number; end: number },
  options?: Pick<FileDropzoneWorkflowOptions, 'onSceneReplaced' | 'onViewerState' | 'load' | 'signal' | 'initialSplatSelectionRevision'>
) => Promise<void | boolean>;
type ClearCaches = (options?: ClearAllOptions) => void;
type SetSourceInfo = (type: ReconstructionSourceType, url?: string | null) => void;
type SetActiveZipArchive = (
  archive: ArchiveReader,
  imageIndex: Map<string, ArchiveEntry>,
  fileSize?: number,
  imageCount?: number
) => void;
type LocalSourceLoad = ReturnType<typeof beginReconstructionLoad> &
  Pick<FileDropzoneWorkflowOptions, 'onViewerState' | 'initialSplatSelectionRevision'>;
type LoadZipFromFile = (
  zipFile: File,
  onProgress: (progress: ZipProgress) => void,
  signal?: AbortSignal
) => Promise<ZipLoadResult>;
type ScanEntry = (
  entry: FileSystemEntry,
  path: string,
  files: Map<string, File>,
  signal?: AbortSignal
) => Promise<void>;
type CollectDroppedFiles = (
  payload: Pick<FileDropPayload, 'entries' | 'fallbackFiles'>,
  scanEntry: ScanEntry
) => Promise<Map<string, File>>;
type ScanDirectoryHandle = (
  dirHandle: FileSystemDirectoryHandle,
  path: string,
  files: Map<string, File>,
  signal?: AbortSignal
) => Promise<void>;

interface LocalSourceBaseDeps {
  isLoading: () => boolean;
  cancelUrlLoad?: () => void;
  beginLoad?: () => LocalSourceLoad;
  setUrlLoading: (loading: boolean) => void;
  setUrlProgress: (progress: UrlLoadProgress | null) => void;
  setError: (error: string | null) => void;
  setSourceInfo: SetSourceInfo;
  clearCaches: ClearCaches;
  processFiles: ProcessFiles;
  waitForPaint?: () => Promise<void>;
  log?: (message: string) => void;
  errorLog?: (message: string, error: unknown) => void;
}

export interface LoadLocalZipFileDeps extends LocalSourceBaseDeps {
  loadZipFromFile: LoadZipFromFile;
  setActiveZipArchive: SetActiveZipArchive;
}

export interface LoadDropPayloadDeps extends LocalSourceBaseDeps {
  collectDroppedFiles: CollectDroppedFiles;
  isArchiveFile: (file: File) => boolean;
  processZipFile: (zipFile: File) => Promise<void>;
  scanEntry: ScanEntry;
}

export interface LoadBrowsedDirectoryDeps extends LocalSourceBaseDeps {
  pickDirectory?: () => Promise<FileSystemDirectoryHandle>;
  scanDirectoryHandle: ScanDirectoryHandle;
}

export function waitForBrowserPaint(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function yieldToPaint(deps: Pick<LocalSourceBaseDeps, 'waitForPaint'>): Promise<void> {
  await (deps.waitForPaint ?? waitForBrowserPaint)();
}

function commitLocalSceneSource(deps: Pick<LocalSourceBaseDeps, 'clearCaches' | 'setSourceInfo'>): void {
  deps.clearCaches();
  deps.setSourceInfo('local', null);
}

export async function loadLocalZipFile(
  zipFile: File,
  deps: LoadLocalZipFileDeps
): Promise<boolean> {
  const log = deps.log ?? appLogger.info;
  const errorLog = deps.errorLog ?? appLogger.error;

  if (deps.isLoading()) {
    log('[ZIP Loader] Already loading, ignoring duplicate request');
    return false;
  }

  deps.cancelUrlLoad?.();
  const load: LocalSourceLoad = (deps.beginLoad ?? beginReconstructionLoad)();
  let stagedArchive: ArchiveReader | null = null;
  let transferred = false;
  try {
    deps.setUrlLoading(true);
    deps.setUrlProgress({ percent: 0, message: 'Opening ZIP archive...' });
    await awaitWithAbort(yieldToPaint(deps), load.signal);
    load.assertCurrent();

    log(`[ZIP Loader] Processing local ZIP file: ${zipFile.name}`);

    const { colmapFiles, imageIndex, archive, fileSize, imageCount } = await awaitWithAbort(deps.loadZipFromFile(
      zipFile,
      (progress) => {
        if (load.signal.aborted) return;
        deps.setUrlProgress({
          percent: Math.round(progress.percent * 0.1),
          message: 'Extracting ZIP archive...',
        });
      }, load.signal
    ), load.signal, result => { void closeZipArchive(result.archive).catch(() => {}); });
    stagedArchive = archive;
    load.assertCurrent();

    log(`[ZIP Loader] ZIP contains ${colmapFiles.size} COLMAP files, ${imageCount} indexed images`);

    const processed = await deps.processFiles(colmapFiles, undefined, {
      load,
      signal: load.signal,
      initialSplatSelectionRevision: load.initialSplatSelectionRevision,
      onViewerState: load.onViewerState,
      onSceneReplaced: () => {
        load.assertCurrent();
        deps.clearCaches();
        deps.setActiveZipArchive(archive, imageIndex, fileSize, imageCount);
        transferred = true;
        deps.setSourceInfo('zip', null);
      },
    });
    load.assertCurrent();
    if (processed === false) return false;

    log('[ZIP Loader] Successfully loaded reconstruction from local ZIP');
    return true;
  } catch (error) {
    if (load.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return false;
    errorLog('[ZIP Loader] Error processing ZIP file:', error);
    if (transferred) deps.clearCaches();
    deps.setError(getErrorMessage(error, 'Failed to process ZIP file'));
    deps.setUrlLoading(false);
    return false;
  } finally {
    if (stagedArchive && !transferred) await closeZipArchive(stagedArchive).catch(() => {});
    load.finish();
  }
}

export async function loadDropPayload(
  payload: FileDropPayload,
  deps: LoadDropPayloadDeps
): Promise<boolean> {
  const log = deps.log ?? appLogger.info;
  const errorLog = deps.errorLog ?? appLogger.error;

  if (payload.singleFile && deps.isArchiveFile(payload.singleFile)) {
    log(`[Drop] Detected archive file: ${payload.singleFile.name}`);
    await deps.processZipFile(payload.singleFile);
    return true;
  }

  deps.cancelUrlLoad?.();
  const load: LocalSourceLoad = (deps.beginLoad ?? beginReconstructionLoad)();
  try {
    deps.setUrlLoading(true);
    deps.setUrlProgress({ percent: 0, message: 'Scanning files...' });
    await awaitWithAbort(yieldToPaint(deps), load.signal);
    load.assertCurrent();
    const files = await awaitWithAbort(deps.collectDroppedFiles(payload,
      (entry, path, files) => deps.scanEntry(entry, path, files, load.signal)), load.signal);
    load.assertCurrent();

    const processed = await deps.processFiles(files, undefined, {
      load,
      signal: load.signal,
      initialSplatSelectionRevision: load.initialSplatSelectionRevision,
      onViewerState: load.onViewerState,
      onSceneReplaced: () => { load.assertCurrent(); commitLocalSceneSource(deps); },
    });
    load.assertCurrent();
    return processed !== false;
  } catch (error) {
    if (load.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return false;
    errorLog('[File Dropzone] Error processing drop:', error);
    deps.setError(getErrorMessage(error, 'Failed to process dropped files'));
    deps.setUrlLoading(false);
    return false;
  } finally {
    load.finish();
  }
}

export async function loadBrowsedDirectory(
  deps: LoadBrowsedDirectoryDeps
): Promise<boolean> {
  const errorLog = deps.errorLog ?? appLogger.error;

  if (deps.isLoading()) {
    (deps.log ?? appLogger.info)('[File Dropzone] Ignoring browse during active loading');
    return false;
  }

  if (!deps.pickDirectory) {
    deps.setError('Your browser does not support folder selection. Please use drag and drop, or try Chrome/Edge.');
    return false;
  }

  const load: LocalSourceLoad = (deps.beginLoad ?? beginReconstructionLoad)();
  try {
    const dirHandle = await awaitWithAbort(deps.pickDirectory(), load.signal);
    load.assertCurrent();
    if (deps.isLoading()) return false;
    deps.cancelUrlLoad?.();
    deps.setUrlLoading(true);
    deps.setUrlProgress({ percent: 0, message: 'Scanning folder...' });
    await awaitWithAbort(yieldToPaint(deps), load.signal);
    load.assertCurrent();

    const files = new Map<string, File>();
    await awaitWithAbort(deps.scanDirectoryHandle(dirHandle, '', files, load.signal), load.signal);
    load.assertCurrent();

    const processed = await deps.processFiles(files, undefined, {
      load,
      signal: load.signal,
      initialSplatSelectionRevision: load.initialSplatSelectionRevision,
      onViewerState: load.onViewerState,
      onSceneReplaced: () => { load.assertCurrent(); commitLocalSceneSource(deps); },
    });
    load.assertCurrent();
    return processed !== false;
  } catch (error) {
    if (load.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return false;
    }

    errorLog('Error browsing for folder:', error);
    deps.setError(getErrorMessage(error, 'Failed to open folder'));
    deps.setUrlLoading(false);
    return false;
  } finally {
    load.finish();
  }
}
