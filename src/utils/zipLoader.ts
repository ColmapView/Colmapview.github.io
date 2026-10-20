/**
 * ZIP file loading utilities for COLMAP reconstructions.
 * Uses a shared archive worker for indexed extraction and lazy image previews.
 */

import { openArchiveReader, type ArchiveServiceOptions } from '../archive/archiveService';
import { archiveError, isIndexedArchive, REMOTE_ARCHIVE_RANGE_THRESHOLD, type ArchiveSource } from '../archive/protocol';
import { createRemoteArchiveRead } from '../archive/remoteArchive';
import type { ArchiveEntry, ArchiveReader } from '../archive/types';
import { isSplatFilePath } from './splatFilePolicy';
import { getFilenameFromUrl } from './urlUtils';
import { downloadZip, isArchiveDownloadDiskBacked, releaseArchiveDownload, type ZipDownloadOptions, type ZipProgress } from './zipDownload';
import { findDatasetViewerSettingsEntry, isDatasetViewerSettingsPath } from './datasetViewerSettings';
import { MAX_VIEWER_STATE_BYTES } from './publishedViewerState';
import { appLogger } from './logger';
import { awaitWithAbort } from './awaitWithAbort';
import { closeZipArchive, registerZipImagePaths } from './zipArchiveState';
import { fetchDatasetResource } from './fetchDatasetResource';
import { prepareCameraDataset } from '../dataset/importers/prepareCameraDataset';
import { isCameraMetadataPath, normalizeSourcePath, normalizeSourceIndex, parentPath } from '../dataset/importers/sourcePaths';
import { archiveUrlFilename, isPlainTarHeader, tarFilename } from '../archive/archiveTypeRecognition';
import { chooseMixedCameraScene, isPathInCameraScene, colmapSceneRoot } from '../dataset/importers/sceneDiscovery';
import { rememberNativeMediaSource } from '../dataset/nativeMedia';
import { resolveColmapPaths } from './colmapPathResolver';
import {
  validateZipFile,
  validateZipUrl,
  validateArchiveSize,
  getArchiveReadSizeLimit,
} from './zipValidation';
import {
  buildArchiveEntryPath,
  buildArchiveImageIndex,
  getColmapArchiveKey,
  hasArchiveExtension,
  hasRequiredColmapArchiveFiles,
  isArchiveColmapPath,
  isArchiveImagePath,
  isArchiveMimeType,
  isArchiveSplatPath,
  sortArchiveSplatCandidatesByPreference,
} from './zipLoaderPolicy';

// ============================================================================
// Constants
// ============================================================================

export { ARCHIVE_EXTENSIONS } from './zipLoaderPolicy';
// Failed remote indexing must not silently become a multi-gigabyte full download.
const MAX_AUTOMATIC_ARCHIVE_FALLBACK_BYTES = 512 * 1024 * 1024;
export {
  clearActiveZipArchive,
  extractZipImage,
  findZipEntry,
  getActiveZipImageIndex,
  getActiveZipStats,
  hasActiveZipArchive,
  setActiveZipArchive,
} from './zipArchiveState';
export {
  ARCHIVE_SIZE_LIMIT,
  validateZipFile,
  validateZipUrl,
  type ZipValidationResult,
} from './zipValidation';
export { type ZipProgress } from './zipDownload';

// ============================================================================
// Types
// ============================================================================

/** Result of loading a ZIP file */
export interface ZipLoadResult {
  /** COLMAP files extracted from ZIP (cameras.bin, images.bin, points3D.bin, etc.) */
  colmapFiles: Map<string, File>;
  /** Index of image files in the ZIP (path -> entry for lazy extraction) */
  imageIndex: Map<string, ArchiveEntry>;
  /** The archive reader instance (kept alive for lazy extraction) */
  archive: ArchiveReader;
  /** Size of the ZIP file in bytes */
  fileSize: number;
  /** Number of unique images in the ZIP (imageIndex has duplicates for lookup) */
  imageCount: number;
}

export interface ZipUrlLoadOptions {
  filename?: string;
  size?: number;
  fetchImpl?: ZipDownloadOptions['fetchImpl'];
}

// ============================================================================
// ZIP Detection
// ============================================================================

/**
 * Check if a URL points to a supported archive file
 * (.zip, .tar, .tar.gz/.tgz, .tar.bz2/.tbz2/.tbz, .tar.xz/.txz, .7z).
 */
export function isArchiveUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    return hasArchiveExtension(archiveUrlFilename(url) ?? pathname);
  } catch {
    return hasArchiveExtension(url);
  }
}

/**
 * Check if a File is a supported archive
 * (.zip, .tar, .tar.gz/.tgz, .tar.bz2/.tbz2/.tbz, .tar.xz/.txz, .7z).
 */
export function isArchiveFile(file: File): boolean {
  if (isSplatFilePath(file.name)) return false;
  if (hasArchiveExtension(file.name)) return true;
  return isArchiveMimeType(file.type);
}

/**
 * Process a ZIP archive: extract COLMAP files immediately, build index for images.
 */
async function processZipArchive(
  archive: ArchiveReader,
  onProgress: (progress: ZipProgress) => void,
  signal?: AbortSignal
): Promise<{ colmapFiles: Map<string, File>; imageIndex: Map<string, ArchiveEntry>; imageCount: number }> {
  onProgress({ percent: 50, message: 'Reading archive contents...' });

  // Get list of files in archive
  let filesArray = await archive.getFilesArray();
  signal?.throwIfAborted();
  const allEntries = normalizeSourceIndex(filesArray.map(entry => [buildArchiveEntryPath(entry.path, entry.file.name),entry.file] as const));
  const selected = await chooseMixedCameraScene([...allEntries.keys()], signal);
  if (selected && !selected.metadataPath) filesArray = filesArray.filter(entry => isPathInCameraScene(normalizeSourcePath(buildArchiveEntryPath(entry.path, entry.file.name)),selected));

  onProgress({ percent: 55, message: 'Identifying COLMAP files...' });

  // Separate COLMAP files and image files
  const colmapEntries: Array<{ file: ArchiveEntry; path: string }> = [];
  const splatEntries: Array<{ file: ArchiveEntry; path: string; size: number }> = [];
  const originalMediaEntries = new Map<string,ArchiveEntry>();
  const settingsEntries = new Map<string, ArchiveEntry>();

  for (const entry of filesArray) {
    const fullPath = normalizeSourcePath(buildArchiveEntryPath(entry.path, entry.file.name));

    if (isDatasetViewerSettingsPath(fullPath)) {
      settingsEntries.set(fullPath, entry.file);
    } else if (isArchiveColmapPath(fullPath)) {
      colmapEntries.push({ file: entry.file, path: fullPath });
    } else if (isArchiveSplatPath(fullPath)) {
      splatEntries.push({ file: entry.file, path: fullPath, size: entry.file.size });
    } else if (isArchiveImagePath(fullPath)) {
      originalMediaEntries.set(fullPath,entry.file);
    }
  }

  const entries = selected && !selected.metadataPath ? new Map([...allEntries].filter(([path])=>isPathInCameraScene(path,selected))) : allEntries;
  const nativePaths=resolveColmapPaths(colmapEntries.map(entry=>entry.path))
    ?? resolveColmapPaths(colmapEntries.map(entry=>entry.path), { requirePoints3D: false });
  const modelRoots=new Set(colmapEntries.map(entry=>colmapSceneRoot(parentPath(entry.path))));
  const selectedRoot=nativePaths ? colmapSceneRoot(nativePaths.dir) : '';
  const foreignRoots=nativePaths && !selected?.metadataPath ? [...modelRoots].filter(root=>root && root!==selectedRoot) : [];
  const isForeignScene=(path: string)=>foreignRoots.some(root=>path.startsWith(root+'/')
    && !(selectedRoot.startsWith(root+'/') && path.startsWith(selectedRoot+'/')));
  const scopedMedia = foreignRoots.length ? new Map([...originalMediaEntries].filter(([path]) => !isForeignScene(path))) : originalMediaEntries;
  const imageIndex = buildArchiveImageIndex(scopedMedia);
  const imageCount = scopedMedia.size;
  if (nativePaths) registerZipImagePaths(imageIndex,entries,colmapSceneRoot(nativePaths.dir));
  if ((selected?.metadataPath || !nativePaths) && [...entries.keys()].some(isCameraMetadataPath)) {
    onProgress({ percent: 60, message: 'Importing camera metadata...' });
    const prepared = await prepareCameraDataset({ kind: 'archive', entries }, { signal, metadataPath: selected?.metadataPath });
    if (prepared) return { colmapFiles: prepared.files, imageIndex, imageCount };
  }

  // Keep model files from one complete group before canonical archive keys discard scene prefixes.
  const chosenPaths=nativePaths ? new Set([nativePaths.cameras,nativePaths.images,nativePaths.points3D,nativePaths.rigs,nativePaths.frames].filter((path): path is string=>Boolean(path))) : null;
  const chosenColmapEntries=chosenPaths ? colmapEntries.filter(entry=>chosenPaths.has(entry.path)) : [];
  onProgress({ percent: 60, message: `Extracting ${chosenColmapEntries.length} COLMAP files...` });

  // Extract COLMAP files immediately
  const colmapFiles = new Map<string, File>();
  if (nativePaths) rememberNativeMediaSource(colmapFiles, { source: { kind: 'archive', entries }, modelDir: nativePaths.dir });

  const scopedSettings=nativePaths && modelRoots.size>1 ? new Map([...settingsEntries].filter(([path])=>{
    const directory=parentPath(path);
    return !directory || directory===nativePaths.dir || nativePaths.dir.startsWith(directory+'/');
  })) : settingsEntries;
  const settingsEntry = findDatasetViewerSettingsEntry(scopedSettings);
  if (settingsEntry) {
    const [path, entry] = settingsEntry;
    try {
      if (entry.size > MAX_VIEWER_STATE_BYTES) throw new Error('Settings exceed size limit');
      const extracted = await entry.extract();
      if (extracted.size > MAX_VIEWER_STATE_BYTES) throw new Error('Settings exceed size limit');
      colmapFiles.set(path, extracted);
    } catch {
      appLogger.warn('[Archive Loader] Skipping unavailable or oversized colmapview.yaml settings.');
    }
  }

  for (let i = 0; i < chosenColmapEntries.length; i++) {
    signal?.throwIfAborted();
    const entry = chosenColmapEntries[i];
    const extractedFile = await entry.file.extract();

    const filename = entry.path.split('/').pop() ?? entry.path;
    const key = getColmapArchiveKey(entry.path);

    colmapFiles.set(key, extractedFile);

    const percent = 60 + Math.round(((i + 1) / chosenColmapEntries.length) * 10); // 60-70%
    onProgress({ percent, message: `Extracting ${filename}...` });
  }

  if (splatEntries.length > 0) {
    const sortedSplatEntries = sortArchiveSplatCandidatesByPreference(splatEntries.filter(entry=>!isForeignScene(entry.path)));
    if (sortedSplatEntries.length === 0) {
      // All splats may belong to unselected native scenes.
      return { colmapFiles, imageIndex, imageCount };
    }
    for (const splatEntry of sortedSplatEntries) {
      signal?.throwIfAborted();
      const filename = splatEntry.path.split('/').pop() ?? splatEntry.path;
      const extractedFile = await splatEntry.file.extract();
      const namedFile = isArchiveSplatPath(extractedFile.name)
        ? extractedFile
        : new File([extractedFile], filename, { type: extractedFile.type });

      colmapFiles.set(splatEntry.path, namedFile);
      onProgress({ percent: 70, message: `Extracting ${filename}...` });
    }
  }

  onProgress({ percent: 70, message: `Indexed ${imageCount} images for lazy loading` });

  return { colmapFiles, imageIndex, imageCount };
}

/** Transfer reader ownership to the caller only after extraction and validation succeed. */
async function openZipArchive(
  file: ArchiveSource,
  onProgress: (progress: ZipProgress) => void,
  signal?: AbortSignal,
  serviceOptions?: ArchiveServiceOptions
): Promise<ZipLoadResult> {
  signal?.throwIfAborted();
  onProgress({ percent: 40, message: 'Opening archive...' });
  signal?.throwIfAborted();
  const archive = await awaitWithAbort(openArchiveReader(file, { ...serviceOptions, signal }), signal,
    reader => { void closeZipArchive(reader).catch(() => {}); });
  const closeOnAbort = () => { void closeZipArchive(archive).catch(() => {}); };
  signal?.addEventListener('abort', closeOnAbort, { once: true });
  try {
    signal?.throwIfAborted();
    const result = await awaitWithAbort(processZipArchive(archive, (progress) => {
      signal?.throwIfAborted();
      onProgress(progress);
    }, signal), signal);
    signal?.throwIfAborted();
    if (!hasRequiredColmapArchiveFiles(result.colmapFiles.keys(), { requirePoints3D: false })) {
      throw new Error(
        'Archive does not contain valid COLMAP files: cameras.bin/txt and images.bin/txt must be co-located.'
      );
    }
    return { ...result, archive, fileSize: file.size };
  } catch (error) {
    await closeZipArchive(archive).catch(() => {});
    throw error;
  } finally {
    signal?.removeEventListener('abort', closeOnAbort);
  }
}

/**
 * Load a remote archive through ranges or a complete download, with lazy image extraction.
 */
export async function loadZipFromUrl(
  url: string,
  onProgress: (progress: ZipProgress) => void,
  signal?: AbortSignal,
  options?: ZipUrlLoadOptions
): Promise<ZipLoadResult> {
  signal?.throwIfAborted();

  onProgress({ percent: 0, message: 'Checking archive...' });

  let archiveName = options?.filename ?? archiveUrlFilename(url) ?? (getFilenameFromUrl(url) || 'archive.zip');

  // Validate size
  // The size check needs the signed-in account for private Hub archives, like the download.
  const validation = options?.size !== undefined ? validateArchiveSize(options.size, Number.MAX_SAFE_INTEGER) : await validateZipUrl(url, {
    signal, sizeLimit: Number.MAX_SAFE_INTEGER,
    fetchImpl: (target, init) => (options?.fetchImpl ?? fetchDatasetResource)(target, undefined, init),
  });
  signal?.throwIfAborted();
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Invalid archive');
  }
  let rangeRead: ReturnType<typeof createRemoteArchiveRead> | undefined;
  if (/\.(?:tar\.gz|tgz)$/i.test(archiveName) && validation.size !== undefined && validation.size >= 512) {
    rangeRead = createRemoteArchiveRead(url, validation.size, options?.fetchImpl);
    try {
      const header = new Uint8Array(await rangeRead(0, 512, signal ?? new AbortController().signal));
      if (isPlainTarHeader(header)) archiveName = tarFilename(archiveName);
    } catch (error) {
      signal?.throwIfAborted();
      if ((error as Error).name !== 'ArchiveRangeUnsupportedError' && !(error instanceof TypeError)) throw error;
      rangeRead = undefined;
      // Never turn an oversized range failure into a whole-archive allocation.
      if (validation.size > 2 * 1024 * 1024 * 1024) throw error;
    }
  }
  const sizeLimit = getArchiveReadSizeLimit(archiveName);
  if (validation.size !== undefined) {
    const checked = validateArchiveSize(validation.size, sizeLimit);
    if (!checked.valid) throw new Error(checked.error);
  }

  if (isIndexedArchive(archiveName) && validation.size !== undefined && validation.size >= REMOTE_ARCHIVE_RANGE_THRESHOLD) {
    try {
      return await openZipArchive({ kind: 'remote', name: archiveName, size: validation.size }, onProgress, signal, {
        read: rangeRead ?? createRemoteArchiveRead(url, validation.size, options?.fetchImpl),
      });
    } catch (error) {
      signal?.throwIfAborted();
      if (!['ArchiveRangeUnsupportedError', 'ArchiveUnsupportedFeatureError', 'TypeError'].includes((error as Error).name)) throw error;
      if (validation.size > MAX_AUTOMATIC_ARCHIVE_FALLBACK_BYTES) {
        throw archiveError('Remote archive indexing is unavailable. The archive exceeds the 512 MiB automatic download fallback limit. Download it and open the local file.', 'ArchiveLocalAccessRequiredError');
      }
      onProgress({ percent: 2, message: 'Downloading archive for local access...' });
    }
  }

  // Download archive
  const blob = await downloadZip(url, onProgress, {
    signal, sizeLimit,
    ...(validation.size !== undefined && { expectedSize: validation.size }),
    ...(options && { fetchImpl: options.fetchImpl }),
  });
  let result: ZipLoadResult | undefined;
  try {
    signal?.throwIfAborted();
    result = await openZipArchive(new File([blob], archiveName), onProgress, signal, { diskBacked: isArchiveDownloadDiskBacked(blob) });
    signal?.throwIfAborted();
    const close = result.archive.close.bind(result.archive);
    result.archive.close = async () => { try { await close(); } finally { await releaseArchiveDownload(blob); } };
    return result;
  } catch (error) {
    if (result) await closeZipArchive(result.archive).catch(() => {});
    await releaseArchiveDownload(blob).catch(() => {}); throw error;
  }
}

/**
 * Load a ZIP file from a local File object.
 * Extracts COLMAP files immediately and builds an index for lazy image extraction.
 */
export async function loadZipFromFile(
  zipFile: File,
  onProgress: (progress: ZipProgress) => void,
  signal?: AbortSignal
): Promise<ZipLoadResult> {
  signal?.throwIfAborted();

  onProgress({ percent: 0, message: 'Checking archive...' });

  if (/\.(?:tar\.gz|tgz)$/i.test(zipFile.name) && isPlainTarHeader(new Uint8Array(await zipFile.slice(0, 512).arrayBuffer()))) {
    zipFile = new File([zipFile], tarFilename(zipFile.name), { type: 'application/x-tar' });
  }
  signal?.throwIfAborted();

  // Validate size
  const validation = validateZipFile(zipFile);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Invalid archive');
  }

  return openZipArchive(zipFile, onProgress, signal);
}
