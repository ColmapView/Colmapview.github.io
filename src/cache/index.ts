/**
 * Centralized cache management system.
 *
 * Usage:
 *
 * 1. At app startup (main.tsx):
 *    ```
 *    import { registerAllCaches } from './cache';
 *    registerAllCaches();
 *    ```
 *
 * 2. When loading a new reconstruction:
 *    ```
 *    import { clearAllCaches } from './cache';
 *    clearAllCaches();  // Clears everything including ZIP
 *    clearAllCaches({ preserveZip: true });  // Keep ZIP for re-processing
 *    ```
 */

export { CacheManager, CacheDisposalPriority } from './CacheManager';
export type {
  CacheEntry,
  ClearAllOptions,
  CacheMemoryStats,
  CacheLoadStrategy,
  CacheMemoryType,
} from './CacheManager';
export { registerAllCaches, resetCacheRegistration } from './registerCaches';

import { CacheManager, type ClearAllOptions, type CacheLoadStrategy, type CacheMemoryType, type CacheMemoryStats } from './CacheManager';

/** Stats entry for a single cache */
export interface CacheStatsEntry {
  name: string;
  label: string;
  strategy: CacheLoadStrategy;
  memoryType: CacheMemoryType;
  stats: CacheMemoryStats;
}

/**
 * Get stats from all registered caches that have stats enabled.
 * Used by CacheStatsIndicator to display memory usage.
 */
export function getCacheStatsEntries(): CacheStatsEntry[] {
  return CacheManager.getStatsEntries();
}

/**
 * Clear all registered caches in priority order.
 *
 * This is the main entry point for clearing caches when loading a new reconstruction.
 * It replaces the scattered manual clear calls and ensures proper ordering.
 *
 * @param options.preserveZip - If true, keeps the ZIP archive cache (for re-processing ZIP files)
 *
 * @example
 * // Full clear (when loading from URL or new files)
 * clearAllCaches();
 *
 * @example
 * // Preserve ZIP (when re-processing already-loaded ZIP)
 * clearAllCaches({ preserveZip: true });
 */
export function clearAllCaches(options?: ClearAllOptions): void {
  CacheManager.clearAll(options ?? {});
}
