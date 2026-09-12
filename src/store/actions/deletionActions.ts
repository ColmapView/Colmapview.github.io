/**
 * Deletion Actions
 *
 * Coordinates cross-store operations for image deletion management.
 * These actions replace direct cross-store access with explicit coordination.
 *
 * Architecture:
 * - Pure functions (filterReconstructionByImageIds) for reusable logic
 * - Store actions (applyDeletionsToData) for UI coordination
 */

import { filterReconstructionByImageIds } from '../../utils/filterReconstruction';
export { filterReconstructionByImageIds } from '../../utils/filterReconstruction';
import { useReconstructionStore } from '../reconstructionStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useCameraStore } from '../stores/cameraStore.js';
import { useDeletionStore } from '../stores/deletionStore.js';
import { useFloorPlaneStore } from '../stores/floorPlaneStore.js';
import { removeZipMaskCacheEntries } from '../../utils/zipImageFiles.js';
import { isReconstructionSnapshot } from '../../wasm/reconstructionService';
import { useNotificationStore } from '../stores/notificationStore';
import type { Reconstruction } from '../../types/colmap';

/**
 * Store action: Apply pending deletions to the reconstruction data permanently.
 * This coordinates across stores and clears pending deletions.
 *
 * @returns true if deletions were applied, false if no reconstruction or no pending deletions
 */
export function applyDeletionsToData(): boolean | Promise<boolean> {
  const reconstructionStore = useReconstructionStore.getState();
  const { reconstruction, wasmReconstruction } = reconstructionStore;
  if (!reconstruction) return false;

  const deletionStore = useDeletionStore.getState();
  const { pendingDeletions } = deletionStore;
  if (pendingDeletions.size === 0) return false;

  if (isReconstructionSnapshot(wasmReconstruction)) {
    return wasmReconstruction.deleteImages([...pendingDeletions]).then(snapshot => {
      if (useReconstructionStore.getState().wasmReconstruction !== wasmReconstruction) return false;
      reconstructionStore.setWasmReconstruction(snapshot);
      finishDeletions(reconstruction, snapshot.reconstruction, pendingDeletions);
      return true;
    }).catch(error => {
      if (useReconstructionStore.getState().wasmReconstruction === wasmReconstruction) {
        useNotificationStore.getState().addNotification('warning', `Deletion failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return false;
    });
  }

  // In WASM mode reconstruction.points3D is empty — build it from WASM so
  // filterReconstructionByImageIds can strip track elements referencing
  // deleted images. Otherwise the exported points3D.bin would keep those
  // dangling track refs and pycolmap would IndexError on load.
  const sourceReconstruction =
    reconstruction.points3D && reconstruction.points3D.size > 0
      ? reconstruction
      : wasmReconstruction?.hasPoints()
        ? { ...reconstruction, points3D: wasmReconstruction.buildPoints3DMap() }
        : reconstruction;

  // Filter JS reconstruction data (images, cameras, stats, matches, imageToPoint3DIds).
  // WASM is kept alive — point positions/colors/errors are unchanged by image deletion.
  const newReconstruction = filterReconstructionByImageIds(sourceReconstruction, pendingDeletions);
  if (!newReconstruction) return false;

  finishDeletions(reconstruction, newReconstruction, pendingDeletions);
  return true;
}

function finishDeletions(reconstruction: Reconstruction, newReconstruction: Reconstruction, pendingDeletions: Set<number>): void {
  const reconstructionStore = useReconstructionStore.getState();
  const deletionStore = useDeletionStore.getState();

  // Clear floor plane distances (stale after index changes)
  useFloorPlaneStore.getState().setPointDistances(null);

  // Clean up mask cache entries for deleted images
  const deletedImageNames = Array.from(pendingDeletions)
    .map(id => reconstruction.images.get(id)?.name)
    .filter((name): name is string => name !== undefined);
  removeZipMaskCacheEntries(deletedImageNames);

  // Update reconstruction
  reconstructionStore.setReconstruction(newReconstruction);

  // Clear pending deletions
  // Preserve any new marks added while an asynchronous worker edit was running.
  deletionStore.unmarkBulkDeletion([...pendingDeletions]);

  // Clear selection if the selected image was deleted
  const cameraStore = useCameraStore.getState();
  if (cameraStore.selectedImageId !== null && pendingDeletions.has(cameraStore.selectedImageId)) {
    cameraStore.setSelectedImageId(null);
  }

  // Close image detail modal if viewing a deleted image
  const uiStore = useUIStore.getState();
  if (uiStore.imageDetailId !== null && pendingDeletions.has(uiStore.imageDetailId)) {
    uiStore.closeImageDetail();
  }

  // Clear matched image if it was deleted
  if (uiStore.matchedImageId !== null && pendingDeletions.has(uiStore.matchedImageId)) {
    uiStore.setMatchedImageId(null);
  }

}

/**
 * Reset pending deletions and cleanup any related state.
 * Clears all pending deletions without applying them.
 */
export function resetDeletionsWithCleanup(): void {
  // Clear pending deletions
  useDeletionStore.getState().clearPendingDeletions();
}

/**
 * Check if there are any pending deletions.
 */
export function hasPendingDeletions(): boolean {
  return useDeletionStore.getState().pendingDeletions.size > 0;
}

/**
 * Get the count of pending deletions.
 */
export function getPendingDeletionCount(): number {
  return useDeletionStore.getState().pendingDeletions.size;
}

/**
 * Get the set of pending deletion IDs.
 */
export function getPendingDeletions(): Set<number> {
  return useDeletionStore.getState().pendingDeletions;
}
