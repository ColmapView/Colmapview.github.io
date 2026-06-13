import type { ReconstructionSourceType } from '../store/reconstructionStore';
import type { ArchiveEntry, ArchiveReader } from '../types/libarchive';
import type { UrlLoadProgress } from '../types/manifest';
import { findSplatFileSources } from '../utils/fileClassification';
import { appLogger } from '../utils/logger';
import {
  loadZipFromUrl,
  setActiveZipArchive,
  type ZipLoadResult,
  type ZipProgress,
} from '../utils/zipLoader';

type ProcessFiles = (
  files: Map<string, File>,
  progressRange?: { start: number; end: number },
  options?: { throwOnError?: boolean }
) => Promise<void | boolean>;
type SetSourceInfo = (type: ReconstructionSourceType, url?: string | null) => void;
type SetUrlProgress = (progress: UrlLoadProgress | null) => void;
type LoadZipFromUrl = (
  url: string,
  onProgress: (progress: ZipProgress) => void
) => Promise<ZipLoadResult>;
type SetActiveZipArchive = (
  archive: ArchiveReader,
  imageIndex: Map<string, ArchiveEntry>,
  fileSize?: number,
  imageCount?: number
) => void;

export interface LoadZipUrlSourceDeps {
  loadZip?: LoadZipFromUrl;
  log?: (message: string) => void;
  processFiles: ProcessFiles;
  setActiveArchive?: SetActiveZipArchive;
  setSourceInfo: SetSourceInfo;
  setUrlProgress: SetUrlProgress;
}

export function mapZipProgressToUrlProgress(progress: ZipProgress): UrlLoadProgress {
  return {
    percent: progress.percent,
    message: progress.message,
    filesDownloaded: progress.bytesLoaded,
    totalFiles: progress.bytesTotal,
  };
}

export async function loadZipUrlSource(
  url: string,
  deps: LoadZipUrlSourceDeps
): Promise<boolean> {
  const log = deps.log ?? appLogger.info;
  const loadZip = deps.loadZip ?? loadZipFromUrl;
  const setActiveArchive = deps.setActiveArchive ?? setActiveZipArchive;

  log(`[URL Loader] Loading ZIP from URL: ${url}`);

  const { colmapFiles, imageIndex, archive, fileSize, imageCount } = await loadZip(
    url,
    (progress) => {
      deps.setUrlProgress(mapZipProgressToUrlProgress(progress));
    }
  );

  setActiveArchive(archive, imageIndex, fileSize, imageCount);

  deps.setUrlProgress({ percent: 80, message: 'Parsing reconstruction...' });
  deps.setSourceInfo('zip', url);

  log(`[URL Loader] ZIP contains ${colmapFiles.size} COLMAP files, ${imageCount} indexed images`);
  log('[URL Loader] Calling processFiles...');

  await deps.processFiles(colmapFiles, { start: 80, end: 100 }, { throwOnError: true });

  if (findSplatFileSources(colmapFiles).length === 0) {
    deps.setUrlProgress({ percent: 100, message: 'Complete' });
  }
  log('[URL Loader] Successfully loaded reconstruction from ZIP');

  return true;
}
