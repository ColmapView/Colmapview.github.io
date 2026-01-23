/**
 * ZIP file loading utilities for COLMAP reconstructions.
 * Uses libarchive.js (WASM) for efficient extraction with lazy image loading.
 */

import { Archive } from 'libarchive.js';
import type { ArchiveEntry, ArchiveReader } from '../types/libarchive';
import { publicAsset } from './paths';
import { fetchWithTimeout } from './urlUtils';

// ============================================================================
// Constants
// ============================================================================

/** Maximum ZIP file size (2GB) */
export const ZIP_SIZE_LIMIT = 2 * 1024 * 1024 * 1024;

/** Timeout for ZIP size validation HEAD request (5 seconds) */
const SIZE_CHECK_TIMEOUT = 5000;

/** Whether libarchive.js has been initialized */
let archiveInitialized = false;

// ============================================================================
// Types
// ============================================================================

/** Progress callback for ZIP operations */
export interface ZipProgress {
  /** Progress percentage (0-100) */
  percent: number;
  /** Description of current operation */
  message: string;
  /** Bytes downloaded (for download phase) */
  bytesLoaded?: number;
  /** Total bytes (for download phase) */
  bytesTotal?: number;
}

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

/** ZIP validation result */
export interface ZipValidationResult {
  valid: boolean;
  size?: number;
  error?: string;
}

// ============================================================================
// ZIP Detection
// ============================================================================

/**
 * Check if a URL points to a ZIP file.
 */
export function isZipUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith('.zip');
  } catch {
    return url.toLowerCase().endsWith('.zip');
  }
}

/**
 * Check if a File is a ZIP file.
 */
export function isZipFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.zip') || file.type === 'application/zip';
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

// ============================================================================
// ZIP Validation
// ============================================================================

/**
 * Validate a ZIP URL by checking its size with a HEAD request.
 * Returns validation result with size or error.
 */
export async function validateZipUrl(url: string): Promise<ZipValidationResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SIZE_CHECK_TIMEOUT);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        valid: false,
        error: `Failed to access ZIP file (${response.status})`,
      };
    }

    const contentLength = response.headers.get('content-length');
    if (!contentLength) {
      // Server doesn't report size - allow download but warn
      return { valid: true };
    }

    const size = parseInt(contentLength, 10);
    if (size > ZIP_SIZE_LIMIT) {
      const sizeMB = (size / (1024 * 1024)).toFixed(1);
      const limitMB = (ZIP_SIZE_LIMIT / (1024 * 1024)).toFixed(0);
      return {
        valid: false,
        size,
        error: `ZIP file exceeds ${limitMB}MB limit (actual: ${sizeMB}MB)`,
      };
    }

    return { valid: true, size };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { valid: false, error: 'Size check timed out' };
    }
    // On HEAD failure (CORS, etc.), allow download attempt
    return { valid: true };
  }
}

/**
 * Validate a local ZIP file by checking its size.
 */
export function validateZipFile(file: File): ZipValidationResult {
  if (file.size > ZIP_SIZE_LIMIT) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    const limitMB = (ZIP_SIZE_LIMIT / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      size: file.size,
      error: `ZIP file exceeds ${limitMB}MB limit (actual: ${sizeMB}MB)`,
    };
  }
  return { valid: true, size: file.size };
}

// ============================================================================
// ZIP Loading
// ============================================================================

/**
 * Common image file extensions for identifying image files in ZIP.
 */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif'];

function isImagePath(path: string): boolean {
  const lower = path.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Check if a path is a COLMAP file.
 */
function isColmapFile(path: string): boolean {
  const filename = path.split('/').pop()?.toLowerCase() ?? '';
  return (
    filename === 'cameras.bin' || filename === 'cameras.txt' ||
    filename === 'images.bin' || filename === 'images.txt' ||
    filename === 'points3d.bin' || filename === 'points3d.txt' ||
    filename === 'rigs.bin' || filename === 'rigs.txt' ||
    filename === 'frames.bin' || filename === 'frames.txt'
  );
}

/**
 * Download a ZIP file from URL with progress tracking.
 */
async function downloadZip(
  url: string,
  onProgress: (progress: ZipProgress) => void
): Promise<Blob> {
  onProgress({ percent: 2, message: 'Starting download...' });

  const response = await fetchWithTimeout(url, 120000); // 2 minute timeout for large files

  if (!response.ok) {
    throw new Error(`Failed to download ZIP (${response.status})`);
  }

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  if (!response.body) {
    // Fallback for browsers without ReadableStream support
    const blob = await response.blob();
    return blob;
  }

  // Stream download with progress
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(new Uint8Array(value));
    loaded += value.length;

    if (total > 0) {
      const percent = 2 + Math.round((loaded / total) * 38); // 2-40%
      const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
      const totalMB = (total / (1024 * 1024)).toFixed(1);
      onProgress({
        percent,
        message: `Downloading ZIP (${loadedMB} / ${totalMB} MB)...`,
        bytesLoaded: loaded,
        bytesTotal: total,
      });
    } else {
      const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
      onProgress({
        percent: 20,
        message: `Downloading ZIP (${loadedMB} MB)...`,
        bytesLoaded: loaded,
      });
    }
  }

  // Concatenate chunks and create Blob
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return new Blob([result]);
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
  const imageIndex = new Map<string, ArchiveEntry>();
  let imageCount = 0; // Track actual unique images (imageIndex has duplicates for lookup)

  for (const entry of filesArray) {
    // Build full path with proper separator
    // entry.path may or may not have trailing slash depending on libarchive.js version
    let fullPath: string;
    if (entry.path) {
      const dir = entry.path.endsWith('/') ? entry.path : `${entry.path}/`;
      fullPath = `${dir}${entry.file.name}`;
    } else {
      fullPath = entry.file.name;
    }

    if (isColmapFile(fullPath)) {
      colmapEntries.push({ file: entry.file as ArchiveEntry, path: fullPath });
    } else if (isImagePath(fullPath)) {
      // Store in index for lazy extraction
      imageIndex.set(fullPath, entry.file as ArchiveEntry);
      imageCount++; // Count unique images (only the full path entry)
      // Also store under just the filename for easier lookup
      const filename = fullPath.split('/').pop() ?? fullPath;
      if (!imageIndex.has(filename)) {
        imageIndex.set(filename, entry.file as ArchiveEntry);
      }
    }
  }

  onProgress({ percent: 60, message: `Extracting ${colmapEntries.length} COLMAP files...` });

  // Extract COLMAP files immediately
  const colmapFiles = new Map<string, File>();

  for (let i = 0; i < colmapEntries.length; i++) {
    const entry = colmapEntries[i];
    const extractedFile = await (entry.file as ArchiveEntry & { extract: () => Promise<File> }).extract();

    // Determine the key (preserve sparse/0/ structure if present)
    let key = entry.path;
    const filename = entry.path.split('/').pop() ?? entry.path;

    // Check if it's in a sparse/0 directory
    if (entry.path.includes('sparse/')) {
      // Keep the path from sparse/ onwards
      const match = entry.path.match(/(sparse\/\d+\/[^/]+)$/);
      if (match) {
        key = match[1];
      } else {
        key = `sparse/0/${filename}`;
      }
    } else {
      key = `sparse/0/${filename}`;
    }

    colmapFiles.set(key, extractedFile);

    const percent = 60 + Math.round(((i + 1) / colmapEntries.length) * 10); // 60-70%
    onProgress({ percent, message: `Extracting ${filename}...` });
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

  onProgress({ percent: 0, message: 'Checking ZIP file...' });

  // Validate size
  const validation = await validateZipUrl(url);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Invalid ZIP file');
  }

  // Download ZIP
  const blob = await downloadZip(url, onProgress);

  // Validate downloaded size
  if (blob.size > ZIP_SIZE_LIMIT) {
    const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
    throw new Error(`Downloaded ZIP exceeds size limit (${sizeMB}MB)`);
  }

  onProgress({ percent: 40, message: 'Opening archive...' });

  // Open archive
  const file = new File([blob], 'archive.zip', { type: 'application/zip' });
  const archive = await Archive.open(file);

  // Process archive
  const { colmapFiles, imageIndex, imageCount } = await processZipArchive(archive, onProgress);

  // Verify we have required COLMAP files
  const hasRequiredFiles =
    (colmapFiles.has('sparse/0/cameras.bin') || colmapFiles.has('sparse/0/cameras.txt')) &&
    (colmapFiles.has('sparse/0/images.bin') || colmapFiles.has('sparse/0/images.txt')) &&
    (colmapFiles.has('sparse/0/points3d.bin') || colmapFiles.has('sparse/0/points3D.txt'));

  if (!hasRequiredFiles) {
    // Also check without sparse/0 prefix
    let foundCameras = false;
    let foundImages = false;
    let foundPoints = false;

    for (const key of colmapFiles.keys()) {
      const lower = key.toLowerCase();
      if (lower.includes('cameras.')) foundCameras = true;
      if (lower.includes('images.')) foundImages = true;
      if (lower.includes('points3d.')) foundPoints = true;
    }

    if (!foundCameras || !foundImages || !foundPoints) {
      throw new Error(
        'ZIP does not contain valid COLMAP files (cameras.bin, images.bin, points3D.bin)'
      );
    }
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

  onProgress({ percent: 0, message: 'Checking ZIP file...' });

  // Validate size
  const validation = validateZipFile(zipFile);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Invalid ZIP file');
  }

  onProgress({ percent: 40, message: 'Opening archive...' });

  // Open archive
  const archive = await Archive.open(zipFile);

  // Process archive
  const { colmapFiles, imageIndex, imageCount } = await processZipArchive(archive, onProgress);

  // Verify we have required COLMAP files
  let foundCameras = false;
  let foundImages = false;
  let foundPoints = false;

  for (const key of colmapFiles.keys()) {
    const lower = key.toLowerCase();
    if (lower.includes('cameras.')) foundCameras = true;
    if (lower.includes('images.')) foundImages = true;
    if (lower.includes('points3d.')) foundPoints = true;
  }

  if (!foundCameras || !foundImages || !foundPoints) {
    throw new Error(
      'ZIP does not contain valid COLMAP files (cameras.bin, images.bin, points3D.bin)'
    );
  }

  return { colmapFiles, imageIndex, archive, fileSize: zipFile.size, imageCount };
}

// ============================================================================
// Active ZIP Archive Management
// ============================================================================

/** Currently active ZIP archive for lazy image extraction */
let activeArchive: ArchiveReader | null = null;

/** Index of images in the active archive */
let activeImageIndex: Map<string, ArchiveEntry> | null = null;

/** Size of the active ZIP file in bytes */
let activeZipFileSize: number = 0;

/** Actual count of unique images in the archive (imageIndex has duplicates for lookup) */
let activeZipImageCount: number = 0;

/**
 * Set the active ZIP archive for lazy image extraction.
 */
export function setActiveZipArchive(archive: ArchiveReader, imageIndex: Map<string, ArchiveEntry>, fileSize: number = 0, imageCount: number = 0): void {
  // Close previous archive if any
  clearActiveZipArchive();

  activeArchive = archive;
  activeImageIndex = imageIndex;
  activeZipFileSize = fileSize;
  activeZipImageCount = imageCount;
}

/**
 * Get the active ZIP image index.
 */
export function getActiveZipImageIndex(): Map<string, ArchiveEntry> | null {
  return activeImageIndex;
}

/**
 * Check if there's an active ZIP archive.
 */
export function hasActiveZipArchive(): boolean {
  return activeArchive !== null && activeImageIndex !== null;
}

/**
 * Clear the active ZIP archive and release resources.
 */
export function clearActiveZipArchive(): void {
  // Note: libarchive.js Archive doesn't have a close() method,
  // but clearing references allows garbage collection
  activeArchive = null;
  activeImageIndex = null;
  activeZipFileSize = 0;
  activeZipImageCount = 0;
}

/**
 * Get statistics about the active ZIP archive.
 */
export function getActiveZipStats(): { fileSize: number; imageCount: number } {
  return {
    fileSize: activeZipFileSize,
    imageCount: activeZipImageCount,
  };
}

/**
 * Find an entry in the ZIP index by image name.
 * Tries multiple path variants (with/without folder prefixes, case-insensitive).
 */
export function findZipEntry(imageName: string, index: Map<string, ArchiveEntry>): ArchiveEntry | null {
  // Normalize path
  const normalized = imageName.replace(/\\/g, '/');

  // Try exact match
  if (index.has(normalized)) {
    return index.get(normalized)!;
  }

  // Try lowercase
  const lower = normalized.toLowerCase();
  for (const [key, entry] of index.entries()) {
    if (key.toLowerCase() === lower) {
      return entry;
    }
  }

  // Try just the filename
  const filename = normalized.split('/').pop() ?? normalized;
  if (index.has(filename)) {
    return index.get(filename)!;
  }

  // Try with common prefixes
  const prefixes = ['images/', 'sparse/0/', ''];
  for (const prefix of prefixes) {
    const prefixedPath = `${prefix}${normalized}`;
    if (index.has(prefixedPath)) {
      return index.get(prefixedPath)!;
    }
  }

  return null;
}

/**
 * Extract an image from the active ZIP archive.
 */
export async function extractZipImage(imageName: string): Promise<File | null> {
  if (!activeArchive || !activeImageIndex) {
    return null;
  }

  const entry = findZipEntry(imageName, activeImageIndex);
  if (!entry) {
    return null;
  }

  try {
    const file = await (entry as ArchiveEntry & { extract: () => Promise<File> }).extract();
    return file;
  } catch (err) {
    console.warn(`[ZIP] Failed to extract ${imageName}:`, err);
    return null;
  }
}
