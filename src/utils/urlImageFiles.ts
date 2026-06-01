import {
  buildImageUrl,
  buildMaskUrlCandidates,
} from './imageFileLookupPolicy';
import { compressAndResizeToJpeg } from './imageFileCompression';
import { createImageFileRequestState } from './imageFileRequestState';
import type { CacheInfo } from './imageFileCachePolicy';
import { appLogger } from './logger';

/** Cache for images fetched from URLs (stored as compressed JPEG, resized) */
const urlImageState = createImageFileRequestState();

/**
 * Clear the URL image cache.
 * Call this when loading a new reconstruction.
 */
export function clearUrlImageCache(): void {
  urlImageState.clear();
}

/**
 * Get a cached URL image (synchronous).
 * Returns undefined if not yet fetched.
 */
export function getUrlImageCached(imageName: string): File | undefined {
  return urlImageState.getCached(imageName);
}

/**
 * Fetch an image from URL and cache it.
 * Returns the cached File if already fetched, otherwise fetches and caches.
 *
 * @param imageUrlBase - Base URL for images (e.g., "https://example.com/dataset/images/")
 * @param imageName - Image name from COLMAP (e.g., "camera_123/00.png")
 * @returns The fetched File or null if fetch failed
 */
export async function fetchUrlImage(
  imageUrlBase: string,
  imageName: string
): Promise<File | null> {
  const cached = urlImageState.getCached(imageName);
  if (cached) {
    return cached;
  }

  const { url: imageUrl, filename } = buildImageUrl(imageUrlBase, imageName);

  if (urlImageState.isRequestPending(imageUrl)) {
    return urlImageState.waitForRequest(imageUrl);
  }

  urlImageState.startRequest(imageUrl);
  let result: File | null = null;

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      appLogger.warn(`[URL Image] Failed to fetch ${imageName}: ${response.status}`);
      return null;
    }

    const blob = await response.blob();
    const file = await compressAndResizeToJpeg(blob, filename);

    urlImageState.setCached(imageName, file);
    result = file;

    return file;
  } catch (err) {
    appLogger.warn(`[URL Image] Error fetching ${imageName}:`, err);
    return null;
  } finally {
    urlImageState.completeRequest(imageUrl, result);
  }
}

/**
 * Fetch a mask from URL (lazy loaded, no cache).
 * Tries both same-name masks and COLMAP-style ".png" mask suffixes.
 *
 * @param maskUrlBase - Base URL for masks (e.g., "https://example.com/dataset/masks/")
 * @param imageName - Image name from COLMAP (e.g., "camera_123/00.png")
 * @returns The fetched File or null if fetch failed
 */
export async function fetchUrlMask(
  maskUrlBase: string,
  imageName: string
): Promise<File | null> {
  for (const { url: maskUrl, filename } of buildMaskUrlCandidates(maskUrlBase, imageName)) {
    try {
      const response = await fetch(maskUrl);
      if (response.ok) {
        const blob = await response.blob();
        appLogger.debug(`[URL Mask] Found mask for ${imageName}`);
        return new File([blob], filename, { type: blob.type || 'image/png' });
      }
    } catch (err) {
      appLogger.debug(`[URL Mask] Error trying ${maskUrl}:`, err);
    }
  }

  appLogger.debug(`[URL Mask] No mask found for ${imageName}`);
  return null;
}

/**
 * Prefetch multiple images from URLs.
 * Useful for preloading visible frustum images.
 */
export async function prefetchUrlImages(
  imageUrlBase: string,
  imageNames: string[],
  concurrency: number = 5
): Promise<void> {
  const toFetch = imageNames.filter(name => !urlImageState.hasCached(name));
  if (toFetch.length === 0) return;

  for (let i = 0; i < toFetch.length; i += concurrency) {
    const batch = toFetch.slice(i, i + concurrency);
    await Promise.all(batch.map(name => fetchUrlImage(imageUrlBase, name)));
  }
}

/**
 * Get URL image cache statistics.
 */
export function getUrlImageCacheStats(): CacheInfo {
  return urlImageState.getStats();
}
