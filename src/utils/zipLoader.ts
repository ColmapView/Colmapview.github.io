/**
 * ZIP file loading utilities for COLMAP reconstructions.
 * Uses libarchive.js (WASM) for efficient extraction with lazy image loading.
 */

import { Archive } from 'libarchive.js';
import type { ArchiveEntry, ArchiveReader } from '../types/libarchive';
import { publicAsset } from './paths';
import { isSplatFilePath } from './splatFilePolicy';
import { getFilenameFromUrl } from './urlUtils';
import {
  downloadZip,
  validateDownloadedArchiveSize,
  type ZipProgress,
} from './zipDownload';
import {
  ARCHIVE_SIZE_LIMIT,
  validateZipFile,
  validateZipUrl,
} from './zipValidation';
import {
  buildArchiveEntryPath,
  getArchiveImageLookupKeys,
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

/** Whether libarchive.js has been initialized */
let archiveInitialized = false;

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
    return hasArchiveExtension(pathname);
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

// ============================================================================
// Archive Initialization
// ============================================================================

/**
 * Initialize libarchive.js with the correct worker URL.
 */
async function initializeArchive(): Promise<void> {
  if (archiveInitialized) return;

  Archive.init({
    workerUrl: publicAsset('workers/worker-bundle.js'),
  });

  archiveInitialized = true;
}

/**
 * Process a ZIP archive: extract COLMAP files immediately, build index for images.
 */
async function processZipArchive(
  archive: ArchiveReader,
  onProgress: (progress: ZipProgress) => void
): Promise<{ colmapFiles: Map<string, File>; imageIndex: Map<string, ArchiveEntry>; imageCount: number }> {
  onProgress({ percent: 50, message: 'Reading archive contents...' });

  // Get list of files in archive
  const filesArray = await archive.getFilesArray();

  onProgress({ percent: 55, message: 'Identifying COLMAP files...' });

  // Separate COLMAP files and image files
  const colmapEntries: Array<{ file: ArchiveEntry; path: string }> = [];
  const splatEntries: Array<{ file: ArchiveEntry; path: string; size: number }> = [];
  const imageIndex = new Map<string, ArchiveEntry>();
  let imageCount = 0; // Track actual unique images (imageIndex has duplicates for lookup)

  for (const entry of filesArray) {
    const fullPath = buildArchiveEntryPath(entry.path, entry.file.name);

    if (isArchiveColmapPath(fullPath)) {
      colmapEntries.push({ file: entry.file, path: fullPath });
    } else if (isArchiveSplatPath(fullPath)) {
      splatEntries.push({ file: entry.file, path: fullPath, size: entry.file.size });
    } else if (isArchiveImagePath(fullPath)) {
      // Store in index for lazy extraction
      for (const key of getArchiveImageLookupKeys(fullPath)) {
        if (!imageIndex.has(key)) {
          imageIndex.set(key, entry.file);
        }
      }
      imageCount++; // Count unique images (only the full path entry)
    }
  }

  onProgress({ percent: 60, message: `Extracting ${colmapEntries.length} COLMAP files...` });

  // Extract COLMAP files immediately
  const colmapFiles = new Map<string, File>();

  for (let i = 0; i < colmapEntries.length; i++) {
    const entry = colmapEntries[i];
    const extractedFile = await entry.file.extract();

    const filename = entry.path.split('/').pop() ?? entry.path;
    const key = getColmapArchiveKey(entry.path);

    colmapFiles.set(key, extractedFile);

    const percent = 60 + Math.round(((i + 1) / colmapEntries.length) * 10); // 60-70%
    onProgress({ percent, message: `Extracting ${filename}...` });
  }

  if (splatEntries.length > 0) {
    const sortedSplatEntries = sortArchiveSplatCandidatesByPreference(splatEntries);
    if (sortedSplatEntries.length === 0) {
      throw new Error('Internal error selecting archive splat file');
    }
    for (const splatEntry of sortedSplatEntries) {
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

/**
 * Load a ZIP file from URL.
 * Downloads the ZIP, extracts COLMAP files immediately, and builds an index for lazy image extraction.
 */
export async function loadZipFromUrl(
  url: string,
  onProgress: (progress: ZipProgress) => void
): Promise<ZipLoadResult> {
  // Initialize libarchive.js
  await initializeArchive();

  onProgress({ percent: 0, message: 'Checking archive...' });

  // Validate size
  const validation = await validateZipUrl(url);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Invalid archive');
  }

  // Download archive
  const blob = await downloadZip(url, onProgress);

  // Validate downloaded size
  validateDownloadedArchiveSize(blob, ARCHIVE_SIZE_LIMIT);

  onProgress({ percent: 40, message: 'Opening archive...' });

  // Preserve original filename so libarchive.js can sniff format from extension.
  const archiveName = getFilenameFromUrl(url) || 'archive.zip';
  const file = new File([blob], archiveName);
  const archive = await Archive.open(file);

  // Process archive
  const { colmapFiles, imageIndex, imageCount } = await processZipArchive(archive, onProgress);

  // Verify we have required COLMAP files
  if (!hasRequiredColmapArchiveFiles(colmapFiles.keys())) {
    throw new Error(
      'Archive does not contain valid COLMAP files (cameras.bin, images.bin, points3D.bin)'
    );
  }

  return { colmapFiles, imageIndex, archive, fileSize: blob.size, imageCount };
}

/**
 * Load a ZIP file from a local File object.
 * Extracts COLMAP files immediately and builds an index for lazy image extraction.
 */
export async function loadZipFromFile(
  zipFile: File,
  onProgress: (progress: ZipProgress) => void
): Promise<ZipLoadResult> {
  // Initialize libarchive.js
  await initializeArchive();

  onProgress({ percent: 0, message: 'Checking archive...' });

  // Validate size
  const validation = validateZipFile(zipFile);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Invalid archive');
  }

  onProgress({ percent: 40, message: 'Opening archive...' });

  // Open archive
  const archive = await Archive.open(zipFile);

  // Process archive
  const { colmapFiles, imageIndex, imageCount } = await processZipArchive(archive, onProgress);

  // Verify we have required COLMAP files
  if (!hasRequiredColmapArchiveFiles(colmapFiles.keys())) {
    throw new Error(
      'ZIP does not contain valid COLMAP files (cameras.bin, images.bin, points3D.bin)'
    );
  }

  return { colmapFiles, imageIndex, archive, fileSize: zipFile.size, imageCount };
}
