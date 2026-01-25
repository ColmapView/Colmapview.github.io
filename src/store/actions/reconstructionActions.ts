/**
 * Reconstruction Actions
 *
 * Coordinates cross-store operations for loading, clearing, and managing reconstructions.
 * These actions replace direct cross-store access patterns with explicit coordination.
 */

import type { Reconstruction } from '../../types/colmap.js';
import type { WasmReconstructionWrapper } from '../../wasm/reconstruction.js';
import { clearAllCaches } from '../../cache/index.js';
import { useReconstructionStore } from '../reconstructionStore.js';
import { useUIStore } from '../stores/uiStore.js';

export interface ClearReconstructionOptions {
  /** If true, preserves the ZIP archive cache for re-processing */
  preserveZip?: boolean;
  /** If true, preserves the current view state (does not reset camera) */
  preserveView?: boolean;
}

export interface SetReconstructionOptions {
  /** If true, preserves the ZIP archive cache */
  preserveZip?: boolean;
  /** If true, does not reset the view after setting reconstruction */
  preserveView?: boolean;
}

export interface SetReconstructionResult {
  success: boolean;
  pointCount: number;
  imageCount: number;
  cameraCount: number;
}

/**
 * Clear the current reconstruction and all associated caches.
 * Coordinates cleanup across reconstruction store and cache system.
 */
export function clearReconstruction(options?: ClearReconstructionOptions): void {
  const { preserveZip = false, preserveView = false } = options ?? {};

  // Clear caches first (before store clear which disposes WASM)
  clearAllCaches({ preserveZip });

  // Clear reconstruction store
  useReconstructionStore.getState().clear();

  // Reset view unless preserving it
  if (!preserveView) {
    useUIStore.getState().resetView();
  }
}

/**
 * Set a new reconstruction with proper coordination.
 * Handles WASM wrapper lifecycle and cache clearing.
 *
 * @param reconstruction - The reconstruction data to set
 * @param wasmWrapper - Optional WASM wrapper for GPU-optimized rendering
 * @param options - Options for the operation
 * @returns Result with success status and counts
 */
export function setNewReconstruction(
  reconstruction: Reconstruction,
  wasmWrapper?: WasmReconstructionWrapper | null,
  options?: SetReconstructionOptions
): SetReconstructionResult {
  const { preserveZip = true, preserveView = false } = options ?? {};

  // Clear caches (preserveZip by default to maintain ZIP archive during reload)
  clearAllCaches({ preserveZip });

  const store = useReconstructionStore.getState();

  // Set WASM wrapper BEFORE reconstruction (order matters for disposal)
  if (wasmWrapper !== undefined) {
    store.setWasmReconstruction(wasmWrapper);
  }

  // Set reconstruction (this will update loading/progress states)
  store.setReconstruction(reconstruction);

  // Reset view unless preserving it
  if (!preserveView) {
    useUIStore.getState().resetView();
  }

  // Get point count from WASM or JS Map
  const pointCount = wasmWrapper?.pointCount ?? reconstruction.points3D?.size ?? 0;

  return {
    success: true,
    pointCount,
    imageCount: reconstruction.images.size,
    cameraCount: reconstruction.cameras.size,
  };
}

/**
 * Get reconstruction data for transform operations.
 * Provides access to both JS reconstruction and WASM wrapper.
 *
 * @returns Object with reconstruction and wasmReconstruction, or null values if not loaded
 */
export function getReconstructionForTransform(): {
  reconstruction: Reconstruction | null;
  wasmReconstruction: WasmReconstructionWrapper | null;
} {
  const state = useReconstructionStore.getState();
  return {
    reconstruction: state.reconstruction,
    wasmReconstruction: state.wasmReconstruction,
  };
}

/**
 * Check if a reconstruction is currently loaded.
 */
export function hasReconstruction(): boolean {
  return useReconstructionStore.getState().reconstruction !== null;
}

/**
 * Get the current point count from WASM or JS Map.
 */
export function getPointCount(): number {
  const state = useReconstructionStore.getState();
  if (state.wasmReconstruction?.hasPoints()) {
    return state.wasmReconstruction.pointCount;
  }
  return state.reconstruction?.points3D?.size ?? 0;
}
