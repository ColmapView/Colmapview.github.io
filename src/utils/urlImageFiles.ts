import {
  buildImageUrl,
  buildMaskUrlCandidates,
} from './imageFileLookupPolicy';
import { compressAndResizeToJpeg } from './imageFileCompression';
import { createImageFileRequestState } from './imageFileRequestState';
import type { CacheInfo } from './imageFileCachePolicy';
import { getFilenameFromUrl } from './urlUtils';
import { appLogger } from './logger';

/** Cache for images fetched from URLs (stored as compressed JPEG, resized) */
const urlImageState = createImageFileRequestState();

/** Cache for masks fetched from URLs (stored as original mask files) */
const urlMaskState = createImageFileRequestState();

/**
 * Clear the URL image and mask caches.
 * Call this when loading a new reconstruction.
 */
export function clearUrlImageCache(): void {
  urlImageState.clear();
  clearUrlMaskCache();
}

/**
 * Clear the URL mask cache.
 */
export function clearUrlMaskCache(): void {
  urlMaskState.clear();
}

/**
 * Get a cached URL image (synchronous).
 * Returns undefined if not yet fetched.
 */
export function getUrlImageCached(imageName: string): File | undefined {
  return urlImageState.getCached(imageName);
}

/**
 * Get a cached URL mask (synchronous).
 * Returns undefined if not yet fetched.
 */
export function getUrlMaskCached(imageName: string): File | undefined {
  return urlMaskState.getCached(imageName);
}

/**
 * Resolve the request URL and display filename for an image. When an explicit
 * URL is given (a per-image mapping), it is used verbatim — already absolute and
 * encoded — and must not pass through buildImageUrl again. Otherwise the URL is
 * built from the base + COLMAP name. Returns null when neither is available.
 */
function resolveImageRequestUrl(
  imageUrlBase: string | null,
  imageName: string,
  explicitUrl?: string
): { url: string; filename: string } | null {
  if (explicitUrl) {
    return { url: explicitUrl, filename: getFilenameFromUrl(explicitUrl) };
  }
  if (!imageUrlBase) {
    return null;
  }
  return buildImageUrl(imageUrlBase, imageName);
}

/**
 * Fetch an image from URL and cache it.
 * Returns the cached File if already fetched, otherwise fetches and caches.
 *
 * @param imageUrlBase - Base URL for images (e.g., "https://example.com/dataset/images/")
 * @param imageName - Image name from COLMAP (e.g., "camera_123/00.png")
 * @param explicitUrl - Optional absolute, pre-encoded URL for this exact image
 *   (per-image mapping); bypasses imageUrlBase + buildImageUrl when provided.
 * @returns The fetched File or null if fetch failed
 */
export async function fetchUrlImage(
  imageUrlBase: string | null,
  imageName: string,
  explicitUrl?: string
): Promise<File | null> {
  const cached = urlImageState.getCached(imageName);
  if (cached) {
    return cached;
  }

  const resolved = resolveImageRequestUrl(imageUrlBase, imageName, explicitUrl);
  if (!resolved) {
    return null;
  }
  const { url: imageUrl, filename } = resolved;

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
 * Fetch an image from URL without display-cache resizing or JPEG recompression.
 * Metric computations use this path because lossy cached images bias PSNR.
 */
export async function fetchUrlImageRaw(
  imageUrlBase: string | null,
  imageName: string,
  explicitUrl?: string
): Promise<File | null> {
  const resolved = resolveImageRequestUrl(imageUrlBase, imageName, explicitUrl);
  if (!resolved) {
    return null;
  }
  const { url: imageUrl, filename } = resolved;

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      appLogger.warn(`[URL Image] Failed to fetch raw ${imageName}: ${response.status}`);
      return null;
    }

    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  } catch (err) {
    appLogger.warn(`[URL Image] Error fetching raw ${imageName}:`, err);
    return null;
  }
}

/**
 * Fetch a mask from URL.
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
  const cached = urlMaskState.getCached(imageName);
  if (cached) {
    return cached;
  }

  if (urlMaskState.isRequestPending(imageName)) {
    return urlMaskState.waitForRequest(imageName);
  }

  urlMaskState.startRequest(imageName);
  let result: File | null = null;

  try {
    for (const { url: maskUrl, filename } of buildMaskUrlCandidates(maskUrlBase, imageName)) {
      try {
        const response = await fetch(maskUrl);
        if (response.ok) {
          const blob = await response.blob();
          const file = new File([blob], filename, { type: blob.type || 'image/png' });
          urlMaskState.setCached(imageName, file);
          result = file;
          appLogger.debug(`[URL Mask] Found mask for ${imageName}`);
          return file;
        }
      } catch (err) {
        appLogger.debug(`[URL Mask] Error trying ${maskUrl}:`, err);
      }
    }

    appLogger.debug(`[URL Mask] No mask found for ${imageName}`);
    return null;
  } finally {
    urlMaskState.completeRequest(imageName, result);
  }
}

/**
 * Prefetch multiple images from URLs.
 * Useful for preloading visible frustum images.
 */
export async function prefetchUrlImages(
  imageUrlBase: string | null,
  imageNames: string[],
  concurrency: number = 5,
  imageNameToUrl?: Record<string, string>
): Promise<void> {
  const toFetch = imageNames.filter(name => !urlImageState.hasCached(name));
  if (toFetch.length === 0) return;

  for (let i = 0; i < toFetch.length; i += concurrency) {
    const batch = toFetch.slice(i, i + concurrency);
    await Promise.all(batch.map(name => fetchUrlImage(imageUrlBase, name, imageNameToUrl?.[name])));
  }
}

/**
 * Get URL image cache statistics.
 */
export function getUrlImageCacheStats(): CacheInfo {
  return urlImageState.getStats();
}

/**
 * Get URL mask cache statistics.
 */
export function getUrlMaskCacheStats(): CacheInfo {
  return urlMaskState.getStats();
}
