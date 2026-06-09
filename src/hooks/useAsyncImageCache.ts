/**
 * Generic async image cache with optimized loading.
 *
 * This is a generic implementation that handles both:
 * - Thumbnail blob URLs (for gallery)
 * - THREE.Texture objects (for camera frustums)
 *
 * Optimizations:
 * 1. Shared cache - results are cached and reused
 * 2. Off-main-thread decoding - uses createImageBitmap for non-blocking decode
 * 3. Idle-time processing - schedules work during idle periods to avoid blocking UI
 * 4. Concurrency limit - prevents browser overload from parallel loads
 * 5. Deduplication - concurrent requests for same image share one load
 * 6. Generation tracking - invalidates stale requests when cache is cleared
 */

import { SIZE, TIMING } from '../theme';
import { appLogger } from '../utils/logger';
import { prefetchAsyncImages } from './asyncImageCachePrefetch';
import { useAsyncImageCacheItem } from './useAsyncImageCacheItem';
import { createAsyncImageCacheScheduler } from './asyncImageCacheScheduler';
import {
  clearAsyncImageCacheState,
  createAsyncImageCacheState,
  getAsyncImageCacheStats,
  movePendingImageCacheItemToFront,
} from './asyncImageCacheState';
import {
  PENDING_BACKPRESSURE_BATCH_SIZE,
  canStartQueuedLoad,
  shouldApplyPendingBackpressure,
} from './asyncImageCacheQueuePolicy';
import {
  createImageBitmapWithTimeout,
  hasImageFailed,
  markImageFailed,
  resizeImageBitmapToMaxSizeWithTimeout,
  shouldLogDecodeFailure,
  shouldLogDecodeFailureSuppression,
} from './asyncImageDecode';

export { hasImageFailed, getFailedImageCount } from './asyncImageDecode';

const MAX_CONCURRENT_LOADS = SIZE.maxConcurrentLoads;

// Timeout for createImageBitmap (some images hang indefinitely)
const DECODE_TIMEOUT = 3000; // 3 seconds - fail fast to avoid blocking other loads

/**
 * Placeholder for shared decode cache clear (no-op after simplification).
 */
export function clearSharedDecodeCache(): void {
  // No-op - shared decode cache was removed for simplicity
}

/**
 * Configuration for creating an image cache instance.
 */
export interface ImageCacheConfig<T> {
  /** Maximum dimension for resizing (preserving aspect ratio) */
  maxSize: number;
  /** Convert a canvas to the output type */
  processCanvas: (canvas: HTMLCanvasElement | OffscreenCanvas) => T | Promise<T | null>;
  /** Cleanup function when cache is cleared */
  dispose: (item: T) => void;
  /** Timeout for idle callback (ms) */
  idleTimeout?: number;
  /** Fallback delay for browsers without requestIdleCallback (ms) */
  idleFallback?: number;
}

/**
 * Create a new image cache instance with the given configuration.
 * Each cache instance maintains its own state and can be cleared independently.
 */
export function createImageCache<T>(config: ImageCacheConfig<T>) {
  const { maxSize, processCanvas, dispose, idleTimeout = TIMING.textureUploadTimeout, idleFallback = TIMING.textureUploadFallback } = config;

  // Instance state
  const state = createAsyncImageCacheState<T>();

  const { processPendingItems, scheduleIdleProcessing } = createAsyncImageCacheScheduler({
    state,
    maxSize,
    processCanvas,
    idleTimeout,
    idleFallback,
  });

  /**
   * Process the next item in the queue if under concurrency limit.
   */
  function processQueue(): void {
    while (canStartQueuedLoad(state.paused, state.activeLoads, MAX_CONCURRENT_LOADS, state.pendingQueue.length)) {
      const next = state.pendingQueue.shift();
      if (next) {
        state.activeLoads++;
        next();
      }
    }
  }

  /**
   * Load an image file and create the cached result.
   */
  async function loadFromFile(
    imageFile: File,
    cacheKey: string,
    generation: number
  ): Promise<T | null> {
    // Helper to clean up load tracking.
    // Only decrement activeLoads if we're still in the same generation.
    // If clear() was called (generation changed), it already reset activeLoads to 0.
    const cleanup = () => {
      if (generation === state.cacheGeneration) {
        state.activeLoads--;
        state.loadingPromises.delete(cacheKey);
        processQueue();
      }
    };

    try {
      // Skip images that have previously failed to decode
      if (hasImageFailed(cacheKey)) {
        cleanup();
        return null;
      }

      if (generation !== state.cacheGeneration) {
        // Don't call cleanup - clear() already reset state
        return null;
      }

      const cached = state.cache.get(cacheKey);
      if (cached) {
        cleanup();
        return cached;
      }

      let bitmap: ImageBitmap;
      try {
        const decodedBitmap = await createImageBitmapWithTimeout(imageFile, DECODE_TIMEOUT);
        bitmap = await resizeImageBitmapToMaxSizeWithTimeout(decodedBitmap, maxSize, DECODE_TIMEOUT);
      } catch (bitmapErr) {
        // Mark as failed so we don't retry (causes OOM with many failures)
        const failedCount = markImageFailed(cacheKey);
        // Only log first 20 failures to avoid console spam
        if (shouldLogDecodeFailure(failedCount)) {
          appLogger.warn(`[decode] Failed: "${cacheKey}" (${(imageFile.size / 1024).toFixed(0)} KB) -`, bitmapErr);
        } else if (shouldLogDecodeFailureSuppression(failedCount)) {
          appLogger.warn(`... suppressing further decode errors (${failedCount} images failed)`);
        }
        cleanup();
        return null;
      }

      if (generation !== state.cacheGeneration) {
        bitmap.close();
        // Don't call cleanup - clear() already reset state
        return null;
      }

      // Return promise that cleans up AFTER idle processing completes
      return new Promise((resolve) => {
        // Backpressure: if too many pending items, process some synchronously
        // to prevent OOM from accumulating full-resolution bitmaps
        if (shouldApplyPendingBackpressure(state.pendingItems.length)) {
          // Process a bounded slice to reduce memory without blocking too long.
          processPendingItems(undefined, PENDING_BACKPRESSURE_BATCH_SIZE);
        }

        state.pendingItems.push({
          bitmap,
          cacheKey,
          resolve: (result: T | null) => {
            cleanup();  // Clean up when idle processing actually finishes
            resolve(result);
          },
        });
        scheduleIdleProcessing();
      });
    } catch (err) {
      appLogger.warn(`Failed to load image "${cacheKey}":`, err);
      cleanup();
      return null;
    }
  }

  /**
   * Queue a load with concurrency limiting.
   */
  function queueLoad(imageFile: File, cacheKey: string): Promise<T | null> {
    const generation = state.cacheGeneration;

    return new Promise((resolve) => {
      const doLoad = () => {
        if (generation !== state.cacheGeneration) {
          // clear() was called - it already reset activeLoads, don't decrement
          resolve(null);
          return;
        }
        loadFromFile(imageFile, cacheKey, generation).then(resolve);
      };

      if (state.activeLoads < MAX_CONCURRENT_LOADS) {
        state.activeLoads++;
        doLoad();
      } else {
        state.pendingQueue.push(() => doLoad());
      }
    });
  }

  return {
    /**
     * Get a cached item synchronously if available.
     */
    getCached(cacheKey: string): T | null {
      return state.cache.get(cacheKey) ?? null;
    },

    /**
     * Load an item, using cache if available.
     */
    load(imageFile: File, cacheKey: string): Promise<T | null> {
      const cached = state.cache.get(cacheKey);
      if (cached) {
        return Promise.resolve(cached);
      }

      let promise = state.loadingPromises.get(cacheKey);
      if (!promise) {
        promise = queueLoad(imageFile, cacheKey);
        state.loadingPromises.set(cacheKey, promise);
      }
      return promise;
    },

    /**
     * Prioritize loading of a specific image.
     * Moves the item to the front of processing queues so it loads sooner.
     * Respects concurrency limits to avoid memory issues.
     */
    prioritize(imageFile: File, cacheKey: string): Promise<T | null> {
      // Already cached - return immediately
      const cached = state.cache.get(cacheKey);
      if (cached) {
        return Promise.resolve(cached);
      }

      // Check if already loading
      const existingPromise = state.loadingPromises.get(cacheKey);

      // Check if it's in pendingItems (waiting for idle processing) - move to front
      if (movePendingImageCacheItemToFront(state.pendingItems, cacheKey)) {
        // Trigger idle processing if not already scheduled
        scheduleIdleProcessing();
        return existingPromise ?? Promise.resolve(null);
      }

      // If already at front or loading, just return existing promise
      if (existingPromise) {
        return existingPromise;
      }

      // Not queued yet - use normal load (respects concurrency limits)
      return this.load(imageFile, cacheKey);
    },

    /**
     * Clear all cached items.
     */
    clear(): void {
      clearAsyncImageCacheState(state, dispose);
    },

    /**
     * Pause cache processing (e.g., during scroll).
     * Queued items remain but won't be processed until resumed.
     */
    pause(): void {
      state.paused = true;
    },

    /**
     * Resume cache processing after pause.
     * Re-triggers idle processing if there are pending items.
     */
    resume(): void {
      if (!state.paused) return;
      state.paused = false;
      // Re-trigger processing for any pending items
      if (state.pendingItems.length > 0) {
        scheduleIdleProcessing();
      }
      if (state.pendingQueue.length > 0) {
        processQueue();
      }
    },

    /**
     * Prefetch items for a list of images.
     * Uses bulk mode for faster initial loading with bounded yielding batches.
     * Uses batched progress updates to avoid excessive re-renders.
     */
    async prefetch(
      images: Array<{ file: File; name: string }>,
      onProgress?: (progress: number) => void
    ): Promise<void> {
      await prefetchAsyncImages({
        images,
        onProgress,
        cache: state.cache,
        loadingPromises: state.loadingPromises,
        queueLoad,
        setBulkMode: (bulkMode) => {
          state.bulkMode = bulkMode;
        },
        maxConcurrentLoads: MAX_CONCURRENT_LOADS,
      });
    },

    /**
     * Get current cache generation (for tracking cache clears).
     */
    getCacheGeneration(): number {
      return state.cacheGeneration;
    },

    /**
     * Get cache statistics (count of loaded items).
     */
    getStats(): { count: number; loading: number; pending: number } {
      return getAsyncImageCacheStats(state);
    },

    /**
     * React hook to use this cache.
     */
    useCache(
      imageFile: File | undefined,
      imageName: string,
      enabled: boolean
    ): T | null {
      return useAsyncImageCacheItem({
        imageFile,
        imageName,
        enabled,
        cache: state.cache,
        loadingPromises: state.loadingPromises,
        cacheGeneration: state.cacheGeneration,
        queueLoad,
      });
    },
  };
}
