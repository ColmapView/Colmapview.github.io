export const MASKED_THUMBNAIL_INACTIVE_BUDGET_BYTES = 64 * 1024 * 1024;

interface Entry {
  key: string;
  consumers: number;
  url: string | null;
  bytes: number;
  loading: boolean;
  ready: Promise<string | null>;
}

export interface MaskedThumbnailLease {
  ready: Promise<string | null>;
  getUrl(): string | null;
  release(): void;
}

/** Active URLs belong to their consumers; only inactive cache ownership is bounded. */
export function createMaskedThumbnailCache(budgetBytes = MASKED_THUMBNAIL_INACTIVE_BUDGET_BYTES) {
  const entries = new Map<string, Entry>();
  const inactive = new Map<Entry, true>();
  const retired = new Set<Entry>();
  const budget = Math.max(0, budgetBytes);
  let inactiveBytes = 0;
  let evictions = 0;

  const dispose = (entry: Entry) => {
    if (entry.url) URL.revokeObjectURL(entry.url);
    entry.url = null;
    entry.bytes = 0;
  };
  function trim() {
    while (inactiveBytes > budget && inactive.size > 0) {
      const entry = inactive.keys().next().value!;
      inactive.delete(entry);
      inactiveBytes -= entry.bytes;
      if (entries.get(entry.key) === entry) entries.delete(entry.key);
      dispose(entry);
      evictions++;
    }
  }
  function makeInactive(entry: Entry) {
    inactive.set(entry, true);
    inactiveBytes += entry.bytes;
    trim();
  }

  return {
    acquire(key: string, load: () => Promise<Blob | null>): MaskedThumbnailLease {
      let entry = entries.get(key);
      if (!entry) {
        entry = { key, consumers: 0, url: null, bytes: 0, loading: true, ready: Promise.resolve(null) };
        const operation = entry;
        entries.set(key, operation);
        operation.ready = Promise.resolve().then(load).then(blob => {
          // The exact entry identity is also its generation token. An old completion
          // cannot publish into or remove a same-key replacement after clear.
          if (!blob || entries.get(key) !== operation) return null;
          operation.url = URL.createObjectURL(blob);
          operation.bytes = blob.size;
          if (operation.consumers === 0) makeInactive(operation);
          return operation.url;
        }).catch(() => null).finally(() => {
          operation.loading = false;
          if (!operation.url && entries.get(key) === operation) entries.delete(key);
        });
      }
      if (inactive.delete(entry)) inactiveBytes -= entry.bytes;
      entry.consumers++;
      const owned = entry;
      let released = false;
      return {
        ready: owned.ready,
        getUrl: () => released ? null : owned.url,
        release() {
          if (released) return;
          released = true;
          owned.consumers--;
          if (owned.consumers !== 0) return;
          if (entries.get(key) !== owned) {
            if (retired.delete(owned)) dispose(owned);
          } else if (owned.url) makeInactive(owned);
        },
      };
    },
    clear() {
      for (const entry of entries.values()) {
        if (entry.url && entry.consumers > 0) retired.add(entry);
        else dispose(entry);
      }
      entries.clear();
      inactive.clear();
      inactiveBytes = 0;
    },
    getStats() {
      let count = 0;
      let loading = 0;
      let pinnedBytes = 0;
      let pinnedCount = 0;
      let retiredBytes = 0;
      for (const entry of entries.values()) {
        if (entry.loading) loading++;
        if (!entry.url) continue;
        count++;
        if (entry.consumers > 0) { pinnedBytes += entry.bytes; pinnedCount++; }
      }
      for (const entry of retired) retiredBytes += entry.bytes;
      return { count, loading, sizeBytes: inactiveBytes + pinnedBytes + retiredBytes,
        inactiveBytes, inactiveCount: inactive.size, pinnedBytes, pinnedCount,
        retiredBytes, retiredCount: retired.size, budgetBytes: budget, evictions };
    },
  };
}
