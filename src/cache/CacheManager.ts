/**
 * Centralized cache management system with priority-based disposal.
 *
 * This module provides a registry pattern for managing multiple caches
 * with proper ordering constraints. Caches self-register with a priority
 * level, and clearAll() disposes them in the correct order.
 *
 * Priority ordering (lower = earlier disposal):
 * - TEXTURE (0): THREE.Texture objects must dispose before bitmaps
 * - BITMAP (10): ImageBitmap objects must close before revoking URLs
 * - BLOB_URL (20): Blob URLs revoked after textures/bitmaps
 * - FILE_CACHE (30): Simple file/Map caches
 * - STORE_STATE (40): Zustand store resets
 * - ARCHIVE (50): ZIP archive (last, allows GC)
 */

/** Disposal priority levels */
export const CacheDisposalPriority = {
  /** THREE.Texture objects - must dispose first */
  TEXTURE: 0,
  /** ImageBitmap objects - must close before revoking URLs */
  BITMAP: 10,
  /** Blob URLs - revoke after textures/bitmaps release references */
  BLOB_URL: 20,
  /** Simple file/Map caches */
  FILE_CACHE: 30,
  /** Zustand store state resets */
  STORE_STATE: 40,
  /** ZIP archive - last, allows garbage collection */
  ARCHIVE: 50,
} as const;

export type CacheDisposalPriority = (typeof CacheDisposalPriority)[keyof typeof CacheDisposalPriority];

/** Memory stats returned by a cache */
export interface CacheMemoryStats {
  /** Number of items in cache */
  count: number;
  /** Estimated memory in bytes */
  sizeBytes: number;
}

/** Loading strategy for display purposes */
export type CacheLoadStrategy = 'memory' | 'lazy';

/** Memory type for display purposes */
export type CacheMemoryType = 'wasm' | 'js';

/** Entry in the cache registry */
export interface CacheEntry {
  /** Unique identifier for the cache */
  name: string;
  /** Human-readable label for display */
  label: string;
  /** Disposal priority (lower = cleared earlier) */
  priority: CacheDisposalPriority;
  /** Function to clear/dispose the cache */
  clear: () => void;
  /** Optional dependencies - names of caches that must be cleared first */
  dependsOn?: string[];
  /** Optional function to get memory stats (for stats display) */
  getStats?: () => CacheMemoryStats;
  /** Loading strategy: 'memory' = loaded upfront, 'lazy' = loaded on demand */
  strategy?: CacheLoadStrategy;
  /** Memory type: 'wasm' or 'js' */
  memoryType?: CacheMemoryType;
  /** Whether this cache should be shown in stats display */
  showInStats?: boolean;
}

/** Options for clearAll */
export interface ClearAllOptions {
  /** If true, skip clearing the ZIP archive cache */
  preserveZip?: boolean;
}

/**
 * Singleton registry for centralized cache management.
 *
 * Usage:
 * 1. Register caches at app startup via registerAllCaches()
 * 2. Call clearAllCaches() when loading a new reconstruction
 */
class CacheManagerClass {
  private entries: Map<string, CacheEntry> = new Map();
  private isClearing = false;

  /**
   * Register a cache with the manager.
   * @param entry Cache entry with name, priority, and clear function
   */
  register(entry: CacheEntry): void {
    if (this.entries.has(entry.name)) {
      console.warn(`[CacheManager] Cache "${entry.name}" already registered, overwriting`);
    }
    this.entries.set(entry.name, entry);
  }

  /**
   * Unregister a cache (useful for testing).
   * @param name Cache name to unregister
   */
  unregister(name: string): void {
    this.entries.delete(name);
  }

  /**
   * Clear all registered caches in priority order.
   * Lower priority values are cleared first.
   * @param options Optional configuration
   */
  clearAll(options: ClearAllOptions = {}): void {
    // Guard against re-entry (some clear functions might trigger events)
    if (this.isClearing) {
      console.warn('[CacheManager] clearAll already in progress, skipping');
      return;
    }

    this.isClearing = true;
    const startTime = performance.now();

    try {
      // Build sorted list respecting priorities and dependencies
      const sortedEntries = this.topologicalSort(options);

      // Clear each cache, catching errors to ensure all caches get cleared
      for (const entry of sortedEntries) {
        try {
          entry.clear();
        } catch (err) {
          console.error(`[CacheManager] Error clearing "${entry.name}":`, err);
          // Continue clearing other caches
        }
      }

      const elapsed = performance.now() - startTime;
      console.log(`[CacheManager] Cleared ${sortedEntries.length} caches in ${elapsed.toFixed(1)}ms`);
    } finally {
      this.isClearing = false;
    }
  }

  /**
   * Clear specific caches by name.
   * @param names Array of cache names to clear
   */
  clearByNames(names: string[]): void {
    if (this.isClearing) {
      console.warn('[CacheManager] clearAll already in progress, skipping clearByNames');
      return;
    }

    this.isClearing = true;

    try {
      // Get matching entries sorted by priority
      const entries = names
        .map((name) => this.entries.get(name))
        .filter((entry): entry is CacheEntry => entry !== undefined)
        .sort((a, b) => a.priority - b.priority);

      for (const entry of entries) {
        try {
          entry.clear();
        } catch (err) {
          console.error(`[CacheManager] Error clearing "${entry.name}":`, err);
        }
      }
    } finally {
      this.isClearing = false;
    }
  }

  /**
   * Get list of registered cache names (for debugging).
   */
  getRegisteredNames(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Get all cache entries that have stats enabled.
   * Returns entries with their current stats for display in CacheStatsIndicator.
   */
  getStatsEntries(): Array<{
    name: string;
    label: string;
    strategy: CacheLoadStrategy;
    memoryType: CacheMemoryType;
    stats: CacheMemoryStats;
  }> {
    const result: Array<{
      name: string;
      label: string;
      strategy: CacheLoadStrategy;
      memoryType: CacheMemoryType;
      stats: CacheMemoryStats;
    }> = [];

    for (const entry of this.entries.values()) {
      if (entry.showInStats && entry.getStats) {
        try {
          const stats = entry.getStats();
          result.push({
            name: entry.name,
            label: entry.label,
            strategy: entry.strategy ?? 'memory',
            memoryType: entry.memoryType ?? 'js',
            stats,
          });
        } catch (err) {
          console.error(`[CacheManager] Error getting stats for "${entry.name}":`, err);
        }
      }
    }

    return result;
  }

  /**
   * Get a specific cache entry by name.
   */
  getEntry(name: string): CacheEntry | undefined {
    return this.entries.get(name);
  }

  /**
   * Topological sort respecting both priority and dependencies.
   * Returns entries in the order they should be cleared.
   */
  private topologicalSort(options: ClearAllOptions): CacheEntry[] {
    // Filter out ZIP archive if preserveZip is true
    let entries = Array.from(this.entries.values());
    if (options.preserveZip) {
      entries = entries.filter((e) => e.name !== 'zipCache');
    }

    // Group by priority first
    const byPriority = new Map<number, CacheEntry[]>();
    for (const entry of entries) {
      const group = byPriority.get(entry.priority) || [];
      group.push(entry);
      byPriority.set(entry.priority, group);
    }

    // Sort priorities and flatten
    const priorities = Array.from(byPriority.keys()).sort((a, b) => a - b);
    const result: CacheEntry[] = [];

    for (const priority of priorities) {
      const group = byPriority.get(priority)!;

      // Within same priority, respect dependencies via topological sort
      const sorted = this.sortGroupByDependencies(group);
      result.push(...sorted);
    }

    return result;
  }

  /**
   * Sort a group of entries by their dependencies.
   * Uses Kahn's algorithm for topological sort.
   */
  private sortGroupByDependencies(group: CacheEntry[]): CacheEntry[] {
    // Build dependency graph for this group
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    // Initialize
    for (const entry of group) {
      inDegree.set(entry.name, 0);
      dependents.set(entry.name, []);
    }

    // Count dependencies within the group
    for (const entry of group) {
      if (entry.dependsOn) {
        for (const dep of entry.dependsOn) {
          // Only count if dependency is in this group
          if (inDegree.has(dep)) {
            inDegree.set(entry.name, (inDegree.get(entry.name) || 0) + 1);
            dependents.get(dep)?.push(entry.name);
          }
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0) {
        queue.push(name);
      }
    }

    const result: CacheEntry[] = [];
    const nameToEntry = new Map(group.map((e) => [e.name, e]));

    while (queue.length > 0) {
      const name = queue.shift()!;
      result.push(nameToEntry.get(name)!);

      for (const dependent of dependents.get(name) || []) {
        const newDegree = (inDegree.get(dependent) || 1) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    // Handle any remaining entries (circular dependencies - shouldn't happen)
    for (const entry of group) {
      if (!result.includes(entry)) {
        console.warn(`[CacheManager] Circular dependency detected for "${entry.name}"`);
        result.push(entry);
      }
    }

    return result;
  }

  /**
   * Reset the manager (for testing).
   */
  reset(): void {
    this.entries.clear();
    this.isClearing = false;
  }
}

/** Singleton instance of the cache manager */
export const CacheManager = new CacheManagerClass();
