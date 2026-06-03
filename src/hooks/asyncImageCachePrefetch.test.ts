import { describe, expect, it, vi } from 'vitest';
import { prefetchAsyncImages, type AsyncImagePrefetchItem } from './asyncImageCachePrefetch';

function createPrefetchItem(name: string): AsyncImagePrefetchItem {
  return {
    file: new File(['image'], `${name}.jpg`, { type: 'image/jpeg' }),
    name,
  };
}

function getProgressCalls(onProgress: ReturnType<typeof vi.fn>): number[] {
  return onProgress.mock.calls.map(([progress]) => progress);
}

function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('async image cache prefetch', () => {
  it('reports completion immediately for empty prefetch lists', async () => {
    const onProgress = vi.fn();
    const setBulkMode = vi.fn();
    const queueLoad = vi.fn();

    await prefetchAsyncImages<string>({
      images: [],
      onProgress,
      cache: new Map(),
      loadingPromises: new Map(),
      queueLoad,
      setBulkMode,
      maxConcurrentLoads: 2,
    });

    expect(onProgress).toHaveBeenCalledWith(1);
    expect(setBulkMode).not.toHaveBeenCalled();
    expect(queueLoad).not.toHaveBeenCalled();
  });

  it('enables bulk mode while prefetching uncached images and reports progress', async () => {
    const images = [createPrefetchItem('a'), createPrefetchItem('b')];
    const onProgress = vi.fn();
    const bulkModes: boolean[] = [];
    const loadingPromises = new Map<string, Promise<string | null>>();
    const queueLoad = vi.fn(async (_file: File, cacheKey: string) => `loaded-${cacheKey}`);

    await prefetchAsyncImages<string>({
      images,
      onProgress,
      cache: new Map(),
      loadingPromises,
      queueLoad,
      setBulkMode: (bulkMode) => {
        bulkModes.push(bulkMode);
      },
      maxConcurrentLoads: 2,
    });

    expect(bulkModes).toEqual([true, false]);
    expect(queueLoad).toHaveBeenCalledTimes(2);
    expect(loadingPromises.has('a')).toBe(true);
    expect(loadingPromises.has('b')).toBe(true);
    expect(getProgressCalls(onProgress)).toEqual([0.5, 1]);
  });

  it('reuses cached values and in-flight loads before queueing new work', async () => {
    const cached = createPrefetchItem('cached');
    const loading = createPrefetchItem('loading');
    const next = createPrefetchItem('next');
    const onProgress = vi.fn();
    const existingPromise = Promise.resolve('already-loading');
    const loadingPromises = new Map<string, Promise<string | null>>([
      ['loading', existingPromise],
    ]);
    const queueLoad = vi.fn(async (_file: File, cacheKey: string) => `loaded-${cacheKey}`);

    await prefetchAsyncImages<string>({
      images: [cached, loading, next],
      onProgress,
      cache: new Map([['cached', 'cached-value']]),
      loadingPromises,
      queueLoad,
      setBulkMode: vi.fn(),
      maxConcurrentLoads: 2,
    });

    expect(queueLoad).toHaveBeenCalledTimes(1);
    expect(queueLoad).toHaveBeenCalledWith(next.file, 'next');
    expect(loadingPromises.get('loading')).toBe(existingPromise);
    expect(loadingPromises.has('next')).toBe(true);
    expect(getProgressCalls(onProgress)).toEqual([1 / 3, 2 / 3, 1]);
  });

  it('restores normal mode if a prefetch load fails', async () => {
    const bulkModes: boolean[] = [];
    const error = new Error('prefetch failed');

    await expect(prefetchAsyncImages<string>({
      images: [createPrefetchItem('broken')],
      cache: new Map(),
      loadingPromises: new Map(),
      queueLoad: vi.fn(async () => {
        throw error;
      }),
      setBulkMode: (bulkMode) => {
        bulkModes.push(bulkMode);
      },
      maxConcurrentLoads: 2,
    })).rejects.toThrow(error);

    expect(bulkModes).toEqual([true, false]);
  });

  it('waits for a chunk to complete before starting the next one', async () => {
    const images = Array.from({ length: 5 }, (_, index) => createPrefetchItem(`image-${index}`));
    const started: string[] = [];
    const resolvers: Array<() => void> = [];

    const queueLoad = vi.fn((_file: File, cacheKey: string) => {
      started.push(cacheKey);
      return new Promise<string | null>((resolve) => {
        resolvers.push(() => resolve(cacheKey));
      });
    });

    const prefetchPromise = prefetchAsyncImages<string>({
      images,
      cache: new Map(),
      loadingPromises: new Map(),
      queueLoad,
      setBulkMode: vi.fn(),
      maxConcurrentLoads: 1,
    });

    await Promise.resolve();
    expect(started).toEqual(['image-0', 'image-1', 'image-2', 'image-3']);

    for (const resolve of resolvers.splice(0)) {
      resolve();
    }
    await nextMacrotask();

    expect(started).toEqual(['image-0', 'image-1', 'image-2', 'image-3', 'image-4']);

    for (const resolve of resolvers.splice(0)) {
      resolve();
    }
    await prefetchPromise;
  });
});
