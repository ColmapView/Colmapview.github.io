import { getFileMapStats, type CacheInfo } from './imageFileCachePolicy';

type FileRequestCallback = (file: File | null) => void;

export interface ImageFileRequestState {
  hasCached(cacheKey: string): boolean;
  getCached(cacheKey: string): File | undefined;
  setCached(cacheKey: string, file: File): void;
  deleteCached(cacheKey: string): void;
  isRequestPending(requestKey: string): boolean;
  startRequest(requestKey: string): void;
  waitForRequest(requestKey: string): Promise<File | null>;
  completeRequest(requestKey: string, file: File | null): void;
  clear(): void;
  getStats(): CacheInfo;
}

export function createImageFileRequestState(): ImageFileRequestState {
  const cache = new Map<string, File>();
  const pendingRequests = new Set<string>();
  const requestCallbacks = new Map<string, FileRequestCallback[]>();

  return {
    hasCached(cacheKey: string): boolean {
      return cache.has(cacheKey);
    },

    getCached(cacheKey: string): File | undefined {
      return cache.get(cacheKey);
    },

    setCached(cacheKey: string, file: File): void {
      cache.set(cacheKey, file);
    },

    deleteCached(cacheKey: string): void {
      cache.delete(cacheKey);
    },

    isRequestPending(requestKey: string): boolean {
      return pendingRequests.has(requestKey);
    },

    startRequest(requestKey: string): void {
      pendingRequests.add(requestKey);
    },

    waitForRequest(requestKey: string): Promise<File | null> {
      return new Promise((resolve) => {
        const callbacks = requestCallbacks.get(requestKey) || [];
        callbacks.push(resolve);
        requestCallbacks.set(requestKey, callbacks);
      });
    },

    completeRequest(requestKey: string, file: File | null): void {
      const callbacks = requestCallbacks.get(requestKey) || [];
      for (const callback of callbacks) {
        callback(file);
      }
      requestCallbacks.delete(requestKey);
      pendingRequests.delete(requestKey);
    },

    clear(): void {
      cache.clear();
      pendingRequests.clear();
      requestCallbacks.clear();
    },

    getStats(): CacheInfo {
      return getFileMapStats(cache);
    },
  };
}
