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

import { useMemo } from 'react';
import { useReconstructionStore } from '../store/reconstructionStore';
import { DatasetManager } from './DatasetManager';
import { DatasetDiagnostics } from './DatasetDiagnostics';
import type { DatasetState } from './types';

// Re-export types and class
export { DatasetManager } from './DatasetManager';
export { DatasetDiagnostics } from './DatasetDiagnostics';
export type { DatasetDiagnosticsState, DatasetDiagnosticsStateReader } from './DatasetDiagnostics';
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
let diagnosticsInstance: DatasetDiagnostics | null = null;

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

export function getDatasetDiagnostics(): DatasetDiagnostics {
  if (!diagnosticsInstance) {
    diagnosticsInstance = new DatasetDiagnostics(() => {
      const state = useReconstructionStore.getState();
      return {
        sourceType: state.sourceType,
        imageUrlBase: state.imageUrlBase,
        maskUrlBase: state.maskUrlBase,
        loadedFiles: state.loadedFiles,
        reconstruction: state.reconstruction,
        wasmReconstruction: state.wasmReconstruction,
      };
    });
  }
  return diagnosticsInstance;
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
  const sourceType = useReconstructionStore((s) => s.sourceType);
  const imageUrlBase = useReconstructionStore((s) => s.imageUrlBase);
  const maskUrlBase = useReconstructionStore((s) => s.maskUrlBase);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);

  return useMemo(
    () => new DatasetManager(() => ({
      sourceType,
      imageUrlBase,
      maskUrlBase,
      loadedFiles,
    })),
    [sourceType, imageUrlBase, maskUrlBase, loadedFiles]
  );
}

export function useDatasetDiagnostics(): DatasetDiagnostics {
  const sourceType = useReconstructionStore((s) => s.sourceType);
  const imageUrlBase = useReconstructionStore((s) => s.imageUrlBase);
  const maskUrlBase = useReconstructionStore((s) => s.maskUrlBase);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);

  return useMemo(
    () => new DatasetDiagnostics(() => ({
      sourceType,
      imageUrlBase,
      maskUrlBase,
      loadedFiles,
      reconstruction,
      wasmReconstruction,
    })),
    [sourceType, imageUrlBase, maskUrlBase, loadedFiles, reconstruction, wasmReconstruction]
  );
}

/**
 * Reset the singleton instance (useful for testing).
 * @internal
 */
export function resetDatasetManager(): void {
  instance = null;
  diagnosticsInstance = null;
}
