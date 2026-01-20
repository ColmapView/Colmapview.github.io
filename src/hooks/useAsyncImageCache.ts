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

import { useState, useEffect } from 'react';
import { SIZE, TIMING } from '../theme';

const MAX_CONCURRENT_LOADS = SIZE.maxConcurrentLoads;

// Track images that failed to decode - don't retry them
const failedImages = new Set<string>();

// Timeout for createImageBitmap (some images hang indefinitely)
const DECODE_TIMEOUT = 3000; // 3 seconds - fail fast to avoid blocking other loads

// Max pending items to prevent OOM from accumulating full-res bitmaps
// Each high-res image can be 10-50MB uncompressed in memory
const MAX_PENDING_ITEMS = 50;

/**
 * Placeholder for shared decode cache clear (no-op after simplification).
 */
export function clearSharedDecodeCache(): void {
  // No-op - shared decode cache was removed for simplicity
}

/**
 * createImageBitmap with timeout to prevent hanging.
 */
async function createImageBitmapWithTimeout(file: File, timeout: number): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Image decode timed out after ${timeout}ms`));
      }
    }, timeout);

    createImageBitmap(file)
      .then((bitmap) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(bitmap);
        } else {
          // Timed out already, clean up the bitmap
          bitmap.close();
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

/**
 * Check if an image has previously failed to load.
 */
export function hasImageFailed(cacheKey: string): boolean {
  return failedImages.has(cacheKey);
}

/**
 * Get count of failed images for diagnostics.
 */
export function getFailedImageCount(): number {
  return failedImages.size;
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
 * Internal state for a cache instance.
 */
interface CacheState<T> {
  cache: Map<string, T>;
  loadingPromises: Map<string, Promise<T | null>>;
  pendingQueue: Array<() => void>;
  pendingItems: PendingItem<T>[];
  activeLoads: number;
  cacheGeneration: number;
  idleCallbackScheduled: boolean;
  paused: boolean;
  bulkMode: boolean; // When true, process immediately without idle callbacks
}

interface PendingItem<T> {
  bitmap: ImageBitmap;
  cacheKey: string;
  resolve: (result: T | null) => void;
}

/**
 * Create a new image cache instance with the given configuration.
 * Each cache instance maintains its own state and can be cleared independently.
 */
export function createImageCache<T>(config: ImageCacheConfig<T>) {
  const { maxSize, processCanvas, dispose, idleTimeout = TIMING.textureUploadTimeout, idleFallback = TIMING.textureUploadFallback } = config;

  // Instance state
  const state: CacheState<T> = {
    cache: new Map(),
    loadingPromises: new Map(),
    pendingQueue: [],
    pendingItems: [],
    activeLoads: 0,
    cacheGeneration: 0,
    idleCallbackScheduled: false,
    paused: false,
    bulkMode: false,
  };

  /**
   * Process pending items during browser idle time.
   * Uses deadline-based processing to maximize throughput while avoiding jank.
   * @param deadline - IdleDeadline from requestIdleCallback, or undefined for sync mode
   * @param maxItems - Optional limit on items to process (for backpressure mode)
   */
  function processPendingItems(deadline?: IdleDeadline, maxItems?: number): void {
    // Skip processing if paused (e.g., during scroll)
    if (state.paused) {
      state.idleCallbackScheduled = false;
      return;
    }

    // Process at least 1 item per callback, then check deadline
    // Lower value = more responsive but more callback overhead
    const MIN_ITEMS_PER_CALLBACK = 1;
    let processedCount = 0;

    while (state.pendingItems.length > 0) {
      // Stop if we hit the max items limit (backpressure mode)
      if (maxItems !== undefined && processedCount >= maxItems) {
        break;
      }
      // Stop if we're running low on idle time, BUT only after processing minimum
      if (processedCount >= MIN_ITEMS_PER_CALLBACK &&
          deadline && deadline.timeRemaining() < TIMING.idleDeadlineBuffer) {
        break;
      }
      processedCount++;

      const pending = state.pendingItems.shift()!;

      // Check if already cached
      const cached = state.cache.get(pending.cacheKey);
      if (cached) {
        pending.bitmap.close();
        pending.resolve(cached);
        continue;
      }

      // Resize bitmap while preserving aspect ratio
      const scale = Math.min(
        maxSize / pending.bitmap.width,
        maxSize / pending.bitmap.height,
        1
      );
      const width = Math.round(pending.bitmap.width * scale);
      const height = Math.round(pending.bitmap.height * scale);

      // Use OffscreenCanvas if available
      let canvas: HTMLCanvasElement | OffscreenCanvas;
      let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(width, height);
        ctx = canvas.getContext('2d');
      } else {
        canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        ctx = canvas.getContext('2d');
      }

      if (ctx) {
        ctx.drawImage(pending.bitmap, 0, 0, width, height);
      }
      pending.bitmap.close();

      // Process the canvas and resolve
      const result = processCanvas(canvas);
      if (result instanceof Promise) {
        result.then((value) => {
          if (value !== null) {
            state.cache.set(pending.cacheKey, value);
          }
          pending.resolve(value);
        }).catch(() => {
          pending.resolve(null);
        });
      } else {
        state.cache.set(pending.cacheKey, result);
        pending.resolve(result);
      }
    }

    state.idleCallbackScheduled = false;

    if (state.pendingItems.length > 0) {
      scheduleIdleProcessing();
    }
  }

  // Debug: track idle processing
  let idleCallCount = 0;
  let lastIdleLog = 0;

  /**
   * Schedule processing during idle time.
   * In bulk mode, processes immediately without waiting for idle.
   */
  function scheduleIdleProcessing(): void {
    if (state.idleCallbackScheduled || state.paused) return;
    state.idleCallbackScheduled = true;

    // In bulk mode, process immediately on next microtask (no idle wait)
    if (state.bulkMode) {
      queueMicrotask(() => {
        processPendingItems();
      });
      return;
    }

    if ('requestIdleCallback' in window) {
      requestIdleCallback((deadline) => {
        idleCallCount++;
        // Log every 100 idle calls or every 10 seconds
        const now = Date.now();
        if (idleCallCount % 100 === 0 || (state.pendingItems.length > 0 && now - lastIdleLog > 10000)) {
          lastIdleLog = now;
          console.log(`Idle callback #${idleCallCount}: ${state.pendingItems.length} items to process, ${deadline?.timeRemaining()?.toFixed(0)}ms remaining`);
        }
        processPendingItems(deadline);
      }, { timeout: idleTimeout });
    } else {
      setTimeout(() => {
        idleCallCount++;
        processPendingItems();
      }, idleFallback);
    }
  }

  /**
   * Process the next item in the queue if under concurrency limit.
   */
  function processQueue(): void {
    if (state.paused) return;
    while (state.activeLoads < MAX_CONCURRENT_LOADS && state.pendingQueue.length > 0) {
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
      if (failedImages.has(cacheKey)) {
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
        bitmap = await createImageBitmapWithTimeout(imageFile, DECODE_TIMEOUT);
      } catch (bitmapErr) {
        // Mark as failed so we don't retry (causes OOM with many failures)
        failedImages.add(cacheKey);
        // Only log first 20 failures to avoid console spam
        if (failedImages.size <= 20) {
          console.warn(`[decode] Failed: "${cacheKey}" (${(imageFile.size / 1024).toFixed(0)} KB) -`, bitmapErr);
        } else if (failedImages.size === 21) {
          console.warn(`... suppressing further decode errors (${failedImages.size} images failed)`);
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
        if (state.pendingItems.length >= MAX_PENDING_ITEMS) {
          // Process only 10 items to reduce memory without blocking too long
          processPendingItems(undefined, 10);
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
      console.warn(`Failed to load image "${cacheKey}":`, err);
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
      const pendingIndex = state.pendingItems.findIndex(p => p.cacheKey === cacheKey);
      if (pendingIndex > 0) {
        // Move to front of the array so it processes first
        const [pending] = state.pendingItems.splice(pendingIndex, 1);
        state.pendingItems.unshift(pending);
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
      state.cacheGeneration++;

      for (const pending of state.pendingItems) {
        pending.bitmap.close();
        pending.resolve(null);
      }
      state.pendingItems.length = 0;

      for (const item of state.cache.values()) {
        dispose(item);
      }
      state.cache.clear();
      state.loadingPromises.clear();
      state.pendingQueue.length = 0;
      state.activeLoads = 0;
      state.idleCallbackScheduled = false;
      // Clear failed images to allow retry on new reconstruction
      failedImages.clear();
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
     * Uses bulk mode for faster initial loading (skips idle callbacks).
     * Uses batched progress updates to avoid excessive re-renders.
     */
    async prefetch(
      images: Array<{ file: File; name: string }>,
      onProgress?: (progress: number) => void
    ): Promise<void> {
      if (images.length === 0) {
        onProgress?.(1);
        return;
      }

      // Enable bulk mode - process immediately without waiting for idle
      state.bulkMode = true;

      let completed = 0;
      const total = images.length;
      let lastReportedProgress = 0;

      // Batch progress updates - only report every 5% or 10 items minimum
      const reportProgress = () => {
        const progress = completed / total;
        if (progress - lastReportedProgress >= 0.05 || completed === total) {
          lastReportedProgress = progress;
          onProgress?.(progress);
        }
      };

      try {
        // Larger chunks for faster throughput during prefetch
        const chunkSize = MAX_CONCURRENT_LOADS * 4;
        for (let i = 0; i < images.length; i += chunkSize) {
          const chunk = images.slice(i, i + chunkSize);

          const chunkPromises = chunk.map(async ({ file, name }) => {
            if (state.cache.has(name)) {
              completed++;
              reportProgress();
              return;
            }

            let promise = state.loadingPromises.get(name);
            if (!promise) {
              promise = queueLoad(file, name);
              state.loadingPromises.set(name, promise);
            }

            await promise;
            completed++;
            reportProgress();
          });

          await Promise.all(chunkPromises);
        }
      } finally {
        // Always restore normal mode when done
        state.bulkMode = false;
      }
    },

    /**
     * Get current cache generation (for tracking cache clears).
     */
    getCacheGeneration(): number {
      return state.cacheGeneration;
    },

    /**
     * React hook to use this cache.
     */
    useCache(
      imageFile: File | undefined,
      imageName: string,
      enabled: boolean
    ): T | null {
      const [result, setResult] = useState<T | null>(() => {
        return enabled && imageName ? state.cache.get(imageName) ?? null : null;
      });
      // Track cache generation to detect cache clears
      const [generation, setGeneration] = useState(state.cacheGeneration);

      useEffect(() => {
        if (!enabled || !imageFile || !imageName) {
          setResult(null);
          return;
        }

        // Check if cache was cleared (generation changed)
        // If so, reset result immediately to avoid showing stale data
        if (generation !== state.cacheGeneration) {
          setGeneration(state.cacheGeneration);
          setResult(null);
        }

        const cached = state.cache.get(imageName);
        if (cached) {
          setResult(cached);
          return;
        }

        // Not cached - clear any stale result while loading
        setResult(null);

        let promise = state.loadingPromises.get(imageName);
        if (!promise) {
          promise = queueLoad(imageFile, imageName);
          state.loadingPromises.set(imageName, promise);
        }

        let cancelled = false;
        promise.then((value) => {
          if (!cancelled) {
            setResult(value);
          }
        });

        return () => {
          cancelled = true;
        };
      }, [imageFile, imageName, enabled, generation]);

      return result;
    },
  };
}
