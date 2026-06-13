import type { ClearAllOptions } from '../cache';
import type { ReconstructionSourceType } from '../store/reconstructionStore';
import type { ArchiveEntry, ArchiveReader } from '../types/libarchive';
import type { UrlLoadProgress } from '../types/manifest';
import { appLogger } from '../utils/logger';
import type { ZipLoadResult, ZipProgress } from '../utils/zipLoader';
import type { FileDropPayload } from './fileDropzoneDropPayload';
import type { FileDropzoneWorkflowOptions } from './fileDropzoneWorkflow';

type ProcessFiles = (
  files: Map<string, File>,
  progressRange?: { start: number; end: number },
  options?: Pick<FileDropzoneWorkflowOptions, 'onSceneReplaced'>
) => Promise<void | boolean>;
type ClearCaches = (options?: ClearAllOptions) => void;
type SetSourceInfo = (type: ReconstructionSourceType, url?: string | null) => void;
type SetActiveZipArchive = (
  archive: ArchiveReader,
  imageIndex: Map<string, ArchiveEntry>,
  fileSize?: number,
  imageCount?: number
) => void;
type LoadZipFromFile = (
  zipFile: File,
  onProgress: (progress: ZipProgress) => void
) => Promise<ZipLoadResult>;
type ScanEntry = (
  entry: FileSystemEntry,
  path: string,
  files: Map<string, File>
) => Promise<void>;
type CollectDroppedFiles = (
  payload: Pick<FileDropPayload, 'entries' | 'fallbackFiles'>,
  scanEntry: ScanEntry
) => Promise<Map<string, File>>;
type ScanDirectoryHandle = (
  dirHandle: FileSystemDirectoryHandle,
  path: string,
  files: Map<string, File>
) => Promise<void>;

interface LocalSourceBaseDeps {
  isLoading: () => boolean;
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

  deps.setUrlLoading(true);
  deps.setUrlProgress({ percent: 0, message: 'Opening ZIP archive...' });
  await yieldToPaint(deps);

  try {
    deps.clearCaches();

    log(`[ZIP Loader] Processing local ZIP file: ${zipFile.name}`);

    const { colmapFiles, imageIndex, archive, fileSize, imageCount } = await deps.loadZipFromFile(
      zipFile,
      (progress) => {
        deps.setUrlProgress({
          percent: Math.round(progress.percent * 0.1),
          message: 'Extracting ZIP archive...',
        });
      }
    );

    deps.setActiveZipArchive(archive, imageIndex, fileSize, imageCount);
    deps.setSourceInfo('zip', null);

    log(`[ZIP Loader] ZIP contains ${colmapFiles.size} COLMAP files, ${imageCount} indexed images`);

    await deps.processFiles(colmapFiles);

    log('[ZIP Loader] Successfully loaded reconstruction from local ZIP');
    return true;
  } catch (error) {
    errorLog('[ZIP Loader] Error processing ZIP file:', error);
    deps.clearCaches();
    deps.setError(getErrorMessage(error, 'Failed to process ZIP file'));
    deps.setUrlLoading(false);
    return false;
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

  deps.setUrlLoading(true);
  deps.setUrlProgress({ percent: 0, message: 'Scanning files...' });
  await yieldToPaint(deps);

  try {
    const files = await deps.collectDroppedFiles(payload, deps.scanEntry);

    await deps.processFiles(files, undefined, {
      onSceneReplaced: () => commitLocalSceneSource(deps),
    });
    return true;
  } catch (error) {
    errorLog('[File Dropzone] Error processing drop:', error);
    deps.setError(getErrorMessage(error, 'Failed to process dropped files'));
    deps.setUrlLoading(false);
    return false;
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

  try {
    const dirHandle = await deps.pickDirectory();

    deps.setUrlLoading(true);
    deps.setUrlProgress({ percent: 0, message: 'Scanning folder...' });
    await yieldToPaint(deps);

    const files = new Map<string, File>();
    await deps.scanDirectoryHandle(dirHandle, '', files);

    await deps.processFiles(files, undefined, {
      onSceneReplaced: () => commitLocalSceneSource(deps),
    });
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return false;
    }

    errorLog('Error browsing for folder:', error);
    deps.setError(getErrorMessage(error, 'Failed to open folder'));
    deps.setUrlLoading(false);
    return false;
  }
}
