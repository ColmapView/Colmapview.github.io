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

/**
 * Set the active ZIP archive for lazy image extraction.
 */
export function setActiveZipArchive(
  archive: ArchiveReader,
  imageIndex: Map<string, ArchiveEntry>,
  fileSize = 0,
  imageCount = 0
): void {
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

/** Own the archive as well as its entries so later source replacement cannot
 * redirect a lazy read. The handle is released when its snapshot is released. */
export function retainActiveZipSource() {
  const archive = activeArchive;
  const index = activeImageIndex ? new Map(activeImageIndex) : null;
  return {
    hasMasks: () => [...(index?.keys() ?? [])].some(name => name.startsWith('masks/')),
    hasEntry: (name: string) => index?.has(name) ?? false,
    async read(name: string): Promise<File | null> {
      if (!archive || !index) return null;
      // Preserve the entire nested name; basename fallbacks can select another camera.
      const entry = index.get(name) ?? index.get(`images/${name}`);
      const result = entry ? await entry.extract() : null;
      // Keep the owning reader alive across the asynchronous extraction.
      void archive;
      return result;
    },
  };
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
  // libarchive.js Archive does not expose a close method in every runtime path.
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

  const entry = findZipEntry(imageName, activeImageIndex);
  if (!entry) {
    return null;
  }

  try {
    return await entry.extract();
  } catch (err) {
    appLogger.warn(`[ZIP] Failed to extract ${imageName}:`, err);
    return null;
  }
}
