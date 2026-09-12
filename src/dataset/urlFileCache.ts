import type { ImageFileCache } from '../utils/imageFileRequestState';

export const URL_FILE_CACHE_BUDGET_BYTES = 128 * 1024 * 1024;
export interface UrlFileCacheStats {
  budgetBytes: number;
  retainedBytes: number;
  count: number;
  evictions: number;
  oversizedBypasses: number;
}

/** Shared ownership budget. Removing a File reference never revokes consumers' URLs. */
export function createUrlFileCache(budgetBytes = URL_FILE_CACHE_BUDGET_BYTES) {
  const budget = Math.max(0, budgetBytes);
  const entries = new Map<string, { file: File; namespace: string }>();
  const totals = new Map<string, { count: number; sizeBytes: number }>();
  let retainedBytes = 0;
  let evictions = 0;
  let oversizedBypasses = 0;

  function remove(key: string) {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    retainedBytes -= entry.file.size;
    const stats = totals.get(entry.namespace)!;
    stats.count -= 1;
    stats.sizeBytes -= entry.file.size;
  }

  return {
    scope(namespace: string): ImageFileCache {
      if (!totals.has(namespace)) totals.set(namespace, { count: 0, sizeBytes: 0 });
      const scopedKey = (key: string) => JSON.stringify([namespace, key]);
      return {
        // Snapshot enumeration must not make unrelated resources recently used.
        peek(key) { return entries.get(scopedKey(key))?.file; },
        get(key) {
          const identity = scopedKey(key);
          const entry = entries.get(identity);
          if (entry) { entries.delete(identity); entries.set(identity, entry); }
          return entry?.file;
        },
        set(key, file) {
          const identity = scopedKey(key);
          remove(identity);
          if (file.size > budget) { oversizedBypasses += 1; return; }
          while (retainedBytes + file.size > budget && entries.size > 0) {
            remove(entries.keys().next().value!);
            evictions += 1;
          }
          entries.set(identity, { file, namespace });
          retainedBytes += file.size;
          const stats = totals.get(namespace)!;
          stats.count += 1;
          stats.sizeBytes += file.size;
        },
        delete(key) { remove(scopedKey(key)); },
        clear() {
          for (const [key, entry] of entries) if (entry.namespace === namespace) remove(key);
        },
        getStats() { return { ...totals.get(namespace)! }; },
      };
    },
    getStats(): UrlFileCacheStats {
      return { budgetBytes: budget, retainedBytes, count: entries.size, evictions, oversizedBypasses };
    },
  };
}
