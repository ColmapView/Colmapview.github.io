/**
 * Thumbnail loading for gallery images.
 *
 * Uses the generic async image cache with blob URL output.
 */

import { createImageCache } from './useAsyncImageCache';

const THUMBNAIL_SIZE = 256;

/**
 * Process canvas to blob URL for thumbnails.
 */
async function canvasToBlobUrl(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string | null> {
  return new Promise((resolve) => {
    if (canvas instanceof OffscreenCanvas) {
      canvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 }).then((blob) => {
        resolve(URL.createObjectURL(blob));
      }).catch(() => {
        resolve(null);
      });
    } else {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          resolve(null);
        }
      }, 'image/jpeg', 0.75);
    }
  });
}

// Create the thumbnail cache instance
const thumbnailCache = createImageCache<string>({
  maxSize: THUMBNAIL_SIZE,
  processCanvas: canvasToBlobUrl,
  dispose: (url) => URL.revokeObjectURL(url),
  idleTimeout: 500,
  idleFallback: 16,
});

/**
 * Clear all cached thumbnails.
 * Call this when loading a new reconstruction.
 */
export function clearThumbnailCache(): void {
  thumbnailCache.clear();
}

/**
 * Pause thumbnail processing (e.g., during scroll).
 */
export function pauseThumbnailCache(): void {
  thumbnailCache.pause();
}

/**
 * Resume thumbnail processing after pause.
 */
export function resumeThumbnailCache(): void {
  thumbnailCache.resume();
}

/**
 * Get a cached thumbnail URL synchronously if available.
 * Returns null if not cached.
 */
export function getCachedThumbnailUrl(imageName: string): string | null {
  return thumbnailCache.getCached(imageName);
}

/**
 * Prefetch thumbnails for a list of images.
 */
export function prefetchThumbnails(
  images: Array<{ file: File; name: string }>,
  onProgress?: (progress: number) => void
): Promise<void> {
  return thumbnailCache.prefetch(images, onProgress);
}

/**
 * Hook to get a thumbnail URL with caching and optimization.
 *
 * @param imageFile - The image file to load
 * @param imageName - Unique identifier for caching
 * @param enabled - Whether to load the thumbnail
 * @returns The thumbnail URL or null
 */
export function useThumbnail(
  imageFile: File | undefined,
  imageName: string,
  enabled: boolean
): string | null {
  return thumbnailCache.useCache(imageFile, imageName, enabled);
}
