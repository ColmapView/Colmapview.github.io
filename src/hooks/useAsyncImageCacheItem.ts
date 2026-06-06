import { useEffect, useRef, useSyncExternalStore } from 'react';

interface UseAsyncImageCacheItemOptions<T> {
  imageFile: File | undefined;
  imageName: string;
  enabled: boolean;
  cache: ReadonlyMap<string, T>;
  loadingPromises: Map<string, Promise<T | null>>;
  cacheGeneration: number;
  queueLoad: (imageFile: File, cacheKey: string) => Promise<T | null>;
}

interface AsyncImageCacheItemSnapshot<T> {
  cacheGeneration: number;
  cacheKey: string;
  result: T | null;
}

interface AsyncImageCacheItemResource<T> {
  getSnapshot: () => AsyncImageCacheItemSnapshot<T>;
  subscribe: (listener: () => void) => () => void;
  sync: (options: UseAsyncImageCacheItemOptions<T>) => void;
}

function createAsyncImageCacheItemResource<T>(): AsyncImageCacheItemResource<T> {
  let snapshot: AsyncImageCacheItemSnapshot<T> = {
    cacheGeneration: -1,
    cacheKey: '',
    result: null,
  };
  let requestId = 0;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const publish = (nextSnapshot: AsyncImageCacheItemSnapshot<T>) => {
    if (
      snapshot.cacheGeneration === nextSnapshot.cacheGeneration &&
      snapshot.cacheKey === nextSnapshot.cacheKey &&
      Object.is(snapshot.result, nextSnapshot.result)
    ) {
      return;
    }

    snapshot = nextSnapshot;
    emit();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    sync: ({
      imageFile,
      imageName,
      enabled,
      cache,
      loadingPromises,
      cacheGeneration,
      queueLoad,
    }) => {
      const cacheKey = enabled && imageName ? imageName : '';
      if (!cacheKey) {
        requestId++;
        publish({ cacheGeneration, cacheKey: '', result: null });
        return;
      }

      if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey) ?? null;
        requestId++;
        publish({ cacheGeneration, cacheKey, result: cached });
        return;
      }

      if (!imageFile) {
        requestId++;
        publish({ cacheGeneration, cacheKey: '', result: null });
        return;
      }

      publish({ cacheGeneration, cacheKey, result: null });

      let promise = loadingPromises.get(cacheKey);
      if (!promise) {
        promise = queueLoad(imageFile, cacheKey);
        loadingPromises.set(cacheKey, promise);
      }

      const currentRequestId = ++requestId;
      promise.then((value) => {
        if (requestId !== currentRequestId) return;

        publish({
          cacheGeneration,
          cacheKey,
          result: value,
        });
      });
    },
  };
}

export function useAsyncImageCacheItem<T>({
  imageFile,
  imageName,
  enabled,
  cache,
  loadingPromises,
  cacheGeneration,
  queueLoad,
}: UseAsyncImageCacheItemOptions<T>): T | null {
  const resourceRef = useRef<AsyncImageCacheItemResource<T> | null>(null);
  resourceRef.current ??= createAsyncImageCacheItemResource<T>();
  const resource = resourceRef.current;
  const snapshot = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot
  );

  useEffect(() => {
    resource.sync({
      imageFile,
      imageName,
      enabled,
      cache,
      loadingPromises,
      cacheGeneration,
      queueLoad,
    });
  }, [
    cache,
    cacheGeneration,
    enabled,
    imageFile,
    imageName,
    loadingPromises,
    queueLoad,
    resource,
  ]);

  if (!enabled || !imageName) return null;

  if (cache.has(imageName)) {
    return cache.get(imageName) ?? null;
  }

  if (!imageFile) return null;

  return snapshot.cacheGeneration === cacheGeneration && snapshot.cacheKey === imageName
    ? snapshot.result
    : null;
}
