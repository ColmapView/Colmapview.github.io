import type { DatasetAccessError, DatasetAccessOptions, MediaPriority } from '../dataset/types';
import { getFileMapStats, type CacheInfo } from './imageFileCachePolicy';

export interface FileRequestContext {
  readonly token: symbol;
  readonly generation: number;
  readonly signal: AbortSignal;
  getPriority(): MediaPriority;
  isCurrent(): boolean;
  reportFailure(error: DatasetAccessError): void;
}

interface RequestOptions extends DatasetAccessOptions {
  getPriority?: () => MediaPriority;
}
interface Consumer<Result> {
  settle(result: Result, error?: DatasetAccessError): void;
  getPriority: () => MediaPriority;
}
interface Operation<Result> {
  token: symbol;
  generation: number;
  controller: AbortController;
  consumers: Set<Consumer<Result>>;
  failure?: DatasetAccessError;
}

export const MEDIA_PRIORITY_ORDER: Record<MediaPriority, number> = {
  selected: 0, visible: 1, metric: 2, prefetch: 3,
};

export interface ImageFileCache {
  get(key: string): File | undefined;
  peek?(key: string): File | undefined;
  set(key: string, file: File): void;
  delete(key: string): unknown;
  clear(): void;
  getStats(): CacheInfo;
}

/** Operation identity owns publication and cleanup; callers never settle by key alone. */
export function createCoalescedRequestState<Result>(emptyResult: Result) {
  const pending = new Map<string, Operation<Result>>();
  let generation = 0;

  const isCurrent = (key: string, operation: Operation<Result>) =>
    operation.generation === generation && pending.get(key) === operation && !operation.controller.signal.aborted;

  function finish(key: string, operation: Operation<Result>, file: Result) {
    if (!isCurrent(key, operation)) return;
    pending.delete(key);
    for (const consumer of [...operation.consumers]) consumer.settle(file, operation.failure);
  }

  return {
    isRequestPending: (key: string) => pending.has(key),
    getGeneration: () => generation,
    request(
      key: string,
      load: (context: FileRequestContext) => Promise<Result>,
      options: RequestOptions = {},
    ): Promise<Result> {
      if (options.signal?.aborted) return Promise.resolve(emptyResult);
      let operation = pending.get(key);
      const isNew = !operation;
      if (!operation) {
        operation = {
          token: Symbol(key), generation, controller: new AbortController(),
          consumers: new Set(),
        };
        pending.set(key, operation);
      }
      const ownedOperation = operation;
      const promise = new Promise<Result>(resolve => {
        let settled = false;
        const consumer: Consumer<Result> = {
          getPriority: options.getPriority ?? (() => options.priority ?? 'visible'),
          settle(file, error) {
            if (settled) return;
            settled = true;
            options.signal?.removeEventListener('abort', cancel);
            ownedOperation.consumers.delete(consumer);
            // A consumer callback cannot prevent another consumer from settling.
            try { if (error) options.onError?.(error); } catch { /* Preserve File|null settlement. */ }
            resolve(file);
          },
        };
        const cancel = () => {
          consumer.settle(emptyResult, { kind: 'aborted', message: 'Media request cancelled.' });
          if (ownedOperation.consumers.size === 0 && isCurrent(key, ownedOperation)) {
            pending.delete(key);
            ownedOperation.controller.abort();
          }
        };
        ownedOperation.consumers.add(consumer);
        options.signal?.addEventListener('abort', cancel, { once: true });
      });
      if (isNew) {
        const context: FileRequestContext = {
          token: operation.token, generation: operation.generation, signal: operation.controller.signal,
          getPriority: () => {
            let priority: MediaPriority = 'prefetch';
            for (const consumer of ownedOperation.consumers) {
              const demand = consumer.getPriority();
              if (demand && MEDIA_PRIORITY_ORDER[demand] < MEDIA_PRIORITY_ORDER[priority]) priority = demand;
            }
            return priority;
          },
          isCurrent: () => isCurrent(key, ownedOperation),
          reportFailure: error => { if (isCurrent(key, ownedOperation)) ownedOperation.failure = error; },
        };
        // Invoke immediately so uncancellable ZIP extraction snapshots its source now.
        void (async () => {
          let result = emptyResult;
          try {
            result = await load(context);
          } catch (error) {
            context.reportFailure({ kind: 'network', message: error instanceof Error ? error.message : 'Media request failed.' });
            result = emptyResult;
          } finally {
            finish(key, ownedOperation, result);
          }
        })();
      }
      return promise;
    },
    clear() {
      generation += 1;
      const obsolete = [...pending.values()];
      pending.clear();
      for (const operation of obsolete) {
        for (const consumer of [...operation.consumers]) consumer.settle(emptyResult, { kind: 'aborted', message: 'Media request cancelled.' });
        operation.controller.abort();
      }
    },
  };
}

/** File retention is opt-in policy, separate from transient operation ownership. */
export function createImageFileRequestState(externalCache?: ImageFileCache) {
  const files = new Map<string, File>();
  const cache: ImageFileCache = externalCache ?? {
    get: key => files.get(key), set: (key, file) => { files.set(key, file); },
    delete: key => files.delete(key), clear: () => files.clear(),
    getStats: () => getFileMapStats(files),
  };
  const requests = createCoalescedRequestState<File | null>(null);
  return {
    hasCached: (key: string) => cache.get(key) !== undefined,
    getCached: (key: string) => cache.get(key),
    peekCached: (key: string) => cache.peek ? cache.peek(key) : cache.get(key),
    setCached: (key: string, file: File) => cache.set(key, file),
    deleteCached: (key: string) => cache.delete(key),
    isRequestPending: requests.isRequestPending,
    getStats: () => cache.getStats(),
    getGeneration: requests.getGeneration,
    request(key: string, load: (context: FileRequestContext) => Promise<File | null>, options: RequestOptions = {}, retain = true): Promise<File | null> {
      if (options.signal?.aborted) return Promise.resolve(null);
      const cached = retain ? cache.get(key) : undefined;
      if (cached) return Promise.resolve(cached);
      return requests.request(key, async context => {
        const file = await load(context);
        if (file && retain && context.isCurrent()) cache.set(key, file);
        return file;
      }, options);
    },
    clear() { cache.clear(); requests.clear(); },
  };
}
