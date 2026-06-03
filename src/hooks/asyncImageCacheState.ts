import { clearFailedImages } from './asyncImageDecode';

export interface AsyncImageCachePendingItem<T> {
  bitmap: ImageBitmap;
  cacheKey: string;
  resolve: (result: T | null) => void;
}

export interface AsyncImageCacheState<T> {
  cache: Map<string, T>;
  loadingPromises: Map<string, Promise<T | null>>;
  pendingQueue: Array<() => void>;
  pendingItems: AsyncImageCachePendingItem<T>[];
  activeLoads: number;
  cacheGeneration: number;
  idleCallbackScheduled: boolean;
  paused: boolean;
  bulkMode: boolean;
}

export interface AsyncImageCacheStats {
  count: number;
  loading: number;
  pending: number;
}

export function createAsyncImageCacheState<T>(): AsyncImageCacheState<T> {
  return {
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
}

export function clearAsyncImageCacheState<T>(
  state: AsyncImageCacheState<T>,
  dispose: (item: T) => void,
  clearFailures: () => void = clearFailedImages
): void {
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
  clearFailures();
}

export function getAsyncImageCacheStats<T>(state: AsyncImageCacheState<T>): AsyncImageCacheStats {
  return {
    count: state.cache.size,
    loading: state.loadingPromises.size,
    pending: state.pendingItems.length,
  };
}

export function movePendingImageCacheItemToFront<T>(
  pendingItems: AsyncImageCachePendingItem<T>[],
  cacheKey: string
): boolean {
  const pendingIndex = pendingItems.findIndex(p => p.cacheKey === cacheKey);
  if (pendingIndex <= 0) {
    return false;
  }

  const [pending] = pendingItems.splice(pendingIndex, 1);
  pendingItems.unshift(pending);
  return true;
}
