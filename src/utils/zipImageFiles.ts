import {
  hasActiveZipArchive,
  findZipEntry,
  extractZipImage,
  getActiveZipImageIndex,
  clearActiveZipArchive,
} from './zipLoader';
import { getMaskPathVariants } from './imageFileLookupPolicy';
import { compressAndResizeToJpeg } from './imageFileCompression';
import { createImageFileRequestState } from './imageFileRequestState';
import type { CacheInfo } from './imageFileCachePolicy';
import { appLogger } from './logger';

/** Cache for images extracted from ZIP */
const zipImageState = createImageFileRequestState();

/** Cache for masks extracted from ZIP */
const zipMaskState = createImageFileRequestState();

/**
 * Get a cached ZIP image (synchronous).
 * Returns undefined if not yet extracted.
 */
export function getZipImageCached(imageName: string): File | undefined {
  return zipImageState.getCached(imageName);
}

/**
 * Get a cached ZIP mask (synchronous).
 * Returns undefined if not yet extracted.
 */
export function getZipMaskCached(imageName: string): File | undefined {
  return zipMaskState.getCached(imageName);
}

/**
 * Check if ZIP loading is available.
 */
export function isZipLoadingAvailable(): boolean {
  return hasActiveZipArchive();
}

/**
 * Extract an image from ZIP and cache it.
 * Returns the cached File if already extracted, otherwise extracts and caches.
 */
export async function fetchZipImage(imageName: string): Promise<File | null> {
  const cached = zipImageState.getCached(imageName);
  if (cached) return cached;

  if (!hasActiveZipArchive()) return null;

  if (zipImageState.isRequestPending(imageName)) {
    return zipImageState.waitForRequest(imageName);
  }

  zipImageState.startRequest(imageName);
  let result: File | null = null;

  try {
    const extractedFile = await extractZipImage(imageName);
    if (!extractedFile) {
      return null;
    }

    const filename = imageName.split('/').pop() || imageName;
    const file = await compressAndResizeToJpeg(new Blob([await extractedFile.arrayBuffer()]), filename);
    zipImageState.setCached(imageName, file);
    result = file;

    return file;
  } catch (err) {
    appLogger.warn(`[ZIP Image] Error extracting ${imageName}:`, err);
    return null;
  } finally {
    zipImageState.completeRequest(imageName, result);
  }
}

/**
 * Extract an image from ZIP without display-cache resizing or JPEG recompression.
 * Metric computations use this path because lossy cached images bias PSNR.
 */
export async function fetchZipImageRaw(imageName: string): Promise<File | null> {
  if (!hasActiveZipArchive()) return null;

  try {
    return await extractZipImage(imageName);
  } catch (err) {
    appLogger.warn(`[ZIP Image] Error extracting raw ${imageName}:`, err);
    return null;
  }
}

/**
 * Extract a mask from ZIP.
 */
export async function fetchZipMask(imageName: string): Promise<File | null> {
  const cached = zipMaskState.getCached(imageName);
  if (cached) return cached;

  if (!hasActiveZipArchive()) return null;

  if (zipMaskState.isRequestPending(imageName)) {
    return zipMaskState.waitForRequest(imageName);
  }

  const imageIndex = getActiveZipImageIndex();
  if (!imageIndex) return null;

  zipMaskState.startRequest(imageName);
  let result: File | null = null;

  try {
    for (const maskPath of getMaskPathVariants(imageName)) {
      const entry = findZipEntry(maskPath, imageIndex);
      if (entry) {
        try {
          const file = await entry.extract();
          zipMaskState.setCached(imageName, file);
          result = file;
          appLogger.info(`[ZIP Mask] Found mask for ${imageName}`);
          return file;
        } catch (err) {
          appLogger.debug(`[ZIP Mask] Error extracting ${maskPath}:`, err);
        }
      }
    }

    appLogger.debug(`[ZIP Mask] No mask found for ${imageName}`);
    return null;
  } finally {
    zipMaskState.completeRequest(imageName, result);
  }
}

/**
 * Remove specific entries from the ZIP mask cache.
 * Called when images are deleted to prevent stale mask data.
 */
export function removeZipMaskCacheEntries(imageNames: string[]): void {
  for (const name of imageNames) {
    zipMaskState.deleteCached(name);
  }
}

/**
 * Clear ZIP caches and release WASM memory.
 */
export function clearZipCache(): void {
  zipImageState.clear();
  zipMaskState.clear();
  clearActiveZipArchive();
}

/**
 * Get ZIP image cache statistics.
 */
export function getZipImageCacheStats(): CacheInfo {
  return zipImageState.getStats();
}

/**
 * Get ZIP mask cache statistics.
 */
export function getZipMaskCacheStats(): CacheInfo {
  return zipMaskState.getStats();
}
