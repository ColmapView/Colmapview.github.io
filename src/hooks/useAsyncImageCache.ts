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
  };

  /**
   * Process pending items during browser idle time.
   */
  function processPendingItems(deadline?: IdleDeadline): void {
    while (state.pendingItems.length > 0) {
      if (deadline && deadline.timeRemaining() < TIMING.idleDeadlineBuffer) {
        break;
      }

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

  /**
   * Schedule processing during idle time.
   */
  function scheduleIdleProcessing(): void {
    if (state.idleCallbackScheduled) return;
    state.idleCallbackScheduled = true;

    if ('requestIdleCallback' in window) {
      requestIdleCallback(processPendingItems, { timeout: idleTimeout });
    } else {
      setTimeout(() => processPendingItems(), idleFallback);
    }
  }

  /**
   * Process the next item in the queue if under concurrency limit.
   */
  function processQueue(): void {
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
    try {
      if (generation !== state.cacheGeneration) {
        return null;
      }

      const cached = state.cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const bitmap = await createImageBitmap(imageFile);

      if (generation !== state.cacheGeneration) {
        bitmap.close();
        return null;
      }

      return new Promise((resolve) => {
        state.pendingItems.push({ bitmap, cacheKey, resolve });
        scheduleIdleProcessing();
      });
    } catch {
      return null;
    } finally {
      state.activeLoads--;
      state.loadingPromises.delete(cacheKey);
      processQueue();
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
          state.activeLoads--;
          processQueue();
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
    },

    /**
     * Prefetch items for a list of images.
     */
    async prefetch(
      images: Array<{ file: File; name: string }>,
      onProgress?: (progress: number) => void
    ): Promise<void> {
      if (images.length === 0) {
        onProgress?.(1);
        return;
      }

      let completed = 0;
      const total = images.length;

      const promises = images.map(async ({ file, name }) => {
        if (state.cache.has(name)) {
          completed++;
          onProgress?.(completed / total);
          return;
        }

        let promise = state.loadingPromises.get(name);
        if (!promise) {
          promise = queueLoad(file, name);
          state.loadingPromises.set(name, promise);
        }

        await promise;
        completed++;
        onProgress?.(completed / total);
      });

      await Promise.all(promises);
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

      useEffect(() => {
        if (!enabled || !imageFile || !imageName) {
          setResult(null);
          return;
        }

        const cached = state.cache.get(imageName);
        if (cached) {
          setResult(cached);
          return;
        }

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
      }, [imageFile, imageName, enabled]);

      return result;
    },
  };
}
