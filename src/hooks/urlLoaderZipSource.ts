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
  type ZipUrlLoadOptions,
} from '../utils/zipLoader';
import { closeZipArchive } from '../utils/zipArchiveState';

type ProcessFiles = (
  files: Map<string, File>,
  progressRange?: { start: number; end: number },
  options?: { throwOnError?: boolean; signal?: AbortSignal; onSceneReplaced?: () => void }
) => Promise<void | boolean>;
type SetSourceInfo = (type: ReconstructionSourceType, url?: string | null) => void;
type SetUrlProgress = (progress: UrlLoadProgress | null) => void;
type LoadZipFromUrl = (
  url: string,
  onProgress: (progress: ZipProgress) => void,
  signal?: AbortSignal,
  options?: ZipUrlLoadOptions
) => Promise<ZipLoadResult>;
type SetActiveZipArchive = (
  archive: ArchiveReader,
  imageIndex: Map<string, ArchiveEntry>,
  fileSize?: number,
  imageCount?: number
) => void;

export interface LoadZipUrlSourceDeps {
  signal?: AbortSignal;
  assertCurrent?: () => void;
  loadZip?: LoadZipFromUrl;
  log?: (message: string) => void;
  processFiles: ProcessFiles;
  setActiveArchive?: SetActiveZipArchive;
  setSourceInfo: SetSourceInfo;
  setUrlProgress: SetUrlProgress;
  archiveOptions?: ZipUrlLoadOptions;
  /** Shareable source link, rather than the provider's authenticated download URL. */
  sourceUrl?: string;
}

export function mapZipProgressToUrlProgress(progress: ZipProgress): UrlLoadProgress {
  return {
    percent: progress.percent,
    message: progress.message,
    bytesLoaded: progress.bytesLoaded,
    bytesTotal: progress.bytesTotal,
  };
}

export async function loadZipUrlSource(
  url: string,
  deps: LoadZipUrlSourceDeps
): Promise<boolean> {
  const log = deps.log ?? appLogger.info;
  const loadZip = deps.loadZip ?? loadZipFromUrl;
  const setActiveArchive = deps.setActiveArchive ?? setActiveZipArchive;

  const sourceUrl = deps.sourceUrl ?? url;
  log(`[URL Loader] Loading ZIP from URL: ${sourceUrl}`);

  const onProgress = (progress: ZipProgress) => {
    deps.signal?.throwIfAborted();
    deps.setUrlProgress(mapZipProgressToUrlProgress(progress));
  };
  const { colmapFiles, imageIndex, archive, fileSize, imageCount } = deps.archiveOptions
    ? await loadZip(url, onProgress, deps.signal, deps.archiveOptions)
    : deps.signal
    ? await loadZip(url, onProgress, deps.signal)
    : await loadZip(url, onProgress);

  let committed = false;
  const assertCurrent = () => { deps.signal?.throwIfAborted(); deps.assertCurrent?.(); };
  const commitSource = () => {
    assertCurrent();
    if (committed) return;
    setActiveArchive(archive, imageIndex, fileSize, imageCount);
    deps.setSourceInfo('zip', sourceUrl);
    committed = true;
  };
  try {
  assertCurrent();

  deps.setUrlProgress({ percent: 80, message: 'Parsing reconstruction...' });

  log(`[URL Loader] ZIP contains ${colmapFiles.size} COLMAP files, ${imageCount} indexed images`);
  log('[URL Loader] Calling processFiles...');

  const processed = await deps.processFiles(colmapFiles, { start: 80, end: 100 }, {
    throwOnError: true, signal: deps.signal, onSceneReplaced: commitSource,
  });
  assertCurrent();
  if (processed === false) return false;
  commitSource();

  if (findSplatFileSources(colmapFiles).length === 0) {
    deps.setUrlProgress({ percent: 100, message: 'Complete' });
  }
  log('[URL Loader] Successfully loaded reconstruction from ZIP');

  return true;
  } finally {
    if (!committed) await closeZipArchive(archive);
  }
}
