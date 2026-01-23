/**
 * Dataset module: Unified API for accessing images and masks.
 *
 * Usage:
 *   import { useDataset, getDatasetManager } from '../dataset';
 *
 *   // In React components (subscribes to source changes)
 *   const dataset = useDataset();
 *   const file = await dataset.getImage(imageName);
 *
 *   // Outside React (no subscription)
 *   const dataset = getDatasetManager();
 *   const file = await dataset.getImage(imageName);
 */

import { useReconstructionStore } from '../store/reconstructionStore';
import { DatasetManager } from './DatasetManager';
import type { DatasetState } from './types';

// Re-export types and class
export { DatasetManager } from './DatasetManager';
export type {
  DatasetSource,
  DatasetState,
  DatasetStateReader,
  CacheStats,
  CacheEntryStats,
  DatasetMemoryStats,
  ResourceInfo,
  MemoryItem,
  LoadStrategy,
  MemoryType,
} from './types';

// ===========================================================================
// Singleton Instance
// ===========================================================================

let instance: DatasetManager | null = null;

/**
 * Get the singleton DatasetManager instance.
 * Creates on first call, bound to reconstructionStore.
 *
 * Use this outside of React components where hooks aren't available.
 */
export function getDatasetManager(): DatasetManager {
  if (!instance) {
    instance = new DatasetManager(() => {
      const state = useReconstructionStore.getState();
      return {
        sourceType: state.sourceType,
        imageUrlBase: state.imageUrlBase,
        maskUrlBase: state.maskUrlBase,
        loadedFiles: state.loadedFiles,
      } satisfies DatasetState;
    });
  }
  return instance;
}

// ===========================================================================
// React Hook
// ===========================================================================

/**
 * React hook for accessing the DatasetManager.
 * Subscribes to source type changes to trigger re-renders when dataset changes.
 *
 * Usage:
 *   const dataset = useDataset();
 *   const file = await dataset.getImage(imageName);
 */
export function useDataset(): DatasetManager {
  // Subscribe to relevant state changes to trigger re-renders
  // when the dataset source changes
  useReconstructionStore((s) => s.sourceType);
  useReconstructionStore((s) => s.imageUrlBase);
  useReconstructionStore((s) => s.loadedFiles);

  return getDatasetManager();
}

/**
 * Reset the singleton instance (useful for testing).
 * @internal
 */
export function resetDatasetManager(): void {
  instance = null;
}
