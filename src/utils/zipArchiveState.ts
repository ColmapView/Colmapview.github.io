import type { ArchiveEntry, ArchiveReader } from '../types/libarchive';
import { appLogger } from './logger';
import { getZipEntryLookupCandidates } from './zipLoaderPolicy';

/** Currently active ZIP archive for lazy image extraction. */
let activeArchive: ArchiveReader | null = null;

/** Index of images in the active archive. */
let activeImageIndex: Map<string, ArchiveEntry> | null = null;

/** Size of the active ZIP file in bytes. */
let activeZipFileSize = 0;

/** Actual count of unique images in the archive. */
let activeZipImageCount = 0;

const closedArchives = new WeakSet<ArchiveReader>();

/** Closing may be requested by both cancellation and ownership cleanup. */
export function closeZipArchive(archive: ArchiveReader): Promise<void> {
  if (closedArchives.has(archive)) return Promise.resolve();
  closedArchives.add(archive);
  try {
    return archive.close();
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Set the active ZIP archive for lazy image extraction.
 */
export function setActiveZipArchive(
  archive: ArchiveReader,
  imageIndex: Map<string, ArchiveEntry>,
  fileSize = 0,
  imageCount = 0
): void {
  if (activeArchive !== archive) clearActiveZipArchive();

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
  const previousArchive = activeArchive;
  activeArchive = null;
  activeImageIndex = null;
  activeZipFileSize = 0;
  activeZipImageCount = 0;
  if (previousArchive) {
    void closeZipArchive(previousArchive).catch(error => appLogger.warn('[ZIP] Failed to close archive:', error));
  }
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
 * Find an entry in a ZIP index by image name.
 */
export function findZipEntry(
  imageName: string,
  index: Map<string, ArchiveEntry>
): ArchiveEntry | null {
  const candidates = getZipEntryLookupCandidates(imageName);

  for (const candidate of candidates) {
    const entry = index.get(candidate);
    if (entry) {
      return entry;
    }
  }

  const lowerCandidates = new Set(candidates.map(candidate => candidate.toLowerCase()));
  for (const [key, entry] of index.entries()) {
    if (lowerCandidates.has(key.toLowerCase())) {
      return entry;
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

  const archive = activeArchive;
  const entry = findZipEntry(imageName, activeImageIndex);
  if (!entry) {
    return null;
  }

  try {
    const file = await entry.extract();
    return activeArchive === archive ? file : null;
  } catch (err) {
    appLogger.warn(`[ZIP] Failed to extract ${imageName}:`, err);
    return null;
  }
}
