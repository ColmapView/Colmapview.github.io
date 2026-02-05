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

import type { Reconstruction, Image, Camera, ImageStats, ConnectedImagesIndex, ImageToPoint3DIdsMap, Point3D, Point3DId } from '../../types/colmap.js';
import { useReconstructionStore } from '../reconstructionStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useCameraStore } from '../stores/cameraStore.js';
import { useDeletionStore } from '../stores/deletionStore.js';
import { useFloorPlaneStore } from '../stores/floorPlaneStore.js';

/**
 * Pure function: Filter a reconstruction to remove specified images.
 * This is the core logic that can be reused by higher-level functions.
 *
 * @param reconstruction - The source reconstruction data
 * @param imageIdsToRemove - Set of image IDs to remove
 * @returns A new Reconstruction with the specified images removed, or null if no changes
 */
export function filterReconstructionByImageIds(
  reconstruction: Reconstruction,
  imageIdsToRemove: Set<number>
): Reconstruction | null {
  if (imageIdsToRemove.size === 0) return null;

  // Create new images Map excluding deleted IDs
  const newImages = new Map<number, Image>();
  for (const [id, image] of reconstruction.images) {
    if (!imageIdsToRemove.has(id)) {
      newImages.set(id, image);
    }
  }

  // Filter cameras - only keep cameras that are still used by remaining images
  const usedCameraIds = new Set<number>();
  for (const image of newImages.values()) {
    usedCameraIds.add(image.cameraId);
  }
  const newCameras = new Map<number, Camera>();
  for (const [id, camera] of reconstruction.cameras) {
    if (usedCameraIds.has(id)) {
      newCameras.set(id, camera);
    }
  }

  // Rebuild imageStats for remaining images
  const newImageStats = new Map<number, ImageStats>();
  for (const [id, stats] of reconstruction.imageStats) {
    if (!imageIdsToRemove.has(id)) {
      newImageStats.set(id, stats);
    }
  }

  // Rebuild connectedImagesIndex (matches) excluding deleted images
  const newConnectedImagesIndex: ConnectedImagesIndex = new Map();
  for (const [imageId, connections] of reconstruction.connectedImagesIndex) {
    if (!imageIdsToRemove.has(imageId)) {
      const newConnections = new Map<number, number>();
      for (const [connectedId, count] of connections) {
        if (!imageIdsToRemove.has(connectedId)) {
          newConnections.set(connectedId, count);
        }
      }
      if (newConnections.size > 0) {
        newConnectedImagesIndex.set(imageId, newConnections);
      }
    }
  }

  // Rebuild imageToPoint3DIds excluding deleted images
  const newImageToPoint3DIds: ImageToPoint3DIdsMap = new Map();
  for (const [imageId, pointIds] of reconstruction.imageToPoint3DIds) {
    if (!imageIdsToRemove.has(imageId)) {
      newImageToPoint3DIds.set(imageId, pointIds);
    }
  }

  // Rebuild points3D (tracks): filter track elements but keep all points
  // Points are kept even with 0 remaining observations - their 3D positions are still valid for visualization
  let newPoints3D: Map<Point3DId, Point3D> | undefined;
  if (reconstruction.points3D) {
    newPoints3D = new Map();
    for (const [pointId, point] of reconstruction.points3D) {
      // Filter track elements to remove references to deleted images
      const newTrack = point.track.filter(elem => !imageIdsToRemove.has(elem.imageId));

      newPoints3D.set(pointId, {
        ...point,
        track: newTrack,
      });
    }

    // Also update imageToPoint3DIds to remove orphaned point references
    for (const [imageId, pointIds] of newImageToPoint3DIds) {
      const filteredPointIds = new Set<Point3DId>();
      for (const pointId of pointIds) {
        if (newPoints3D.has(pointId)) {
          filteredPointIds.add(pointId);
        }
      }
      if (filteredPointIds.size > 0) {
        newImageToPoint3DIds.set(imageId, filteredPointIds);
      } else {
        newImageToPoint3DIds.delete(imageId);
      }
    }
  }

  // Create the new reconstruction object
  return {
    cameras: newCameras,
    images: newImages,
    points3D: newPoints3D,
    imageStats: newImageStats,
    connectedImagesIndex: newConnectedImagesIndex,
    globalStats: reconstruction.globalStats, // Stats are approximations, keep as-is
    imageToPoint3DIds: newImageToPoint3DIds,
    rigData: reconstruction.rigData,
  };
}

/**
 * Store action: Apply pending deletions to the reconstruction data permanently.
 * This coordinates across stores and clears pending deletions.
 *
 * @returns true if deletions were applied, false if no reconstruction or no pending deletions
 */
export function applyDeletionsToData(): boolean {
  const reconstructionStore = useReconstructionStore.getState();
  const { reconstruction } = reconstructionStore;
  if (!reconstruction) return false;

  const deletionStore = useDeletionStore.getState();
  const { pendingDeletions } = deletionStore;
  if (pendingDeletions.size === 0) return false;

  // Filter JS reconstruction data (images, cameras, stats, matches, imageToPoint3DIds).
  // WASM is kept alive — point positions/colors/errors are unchanged by image deletion.
  // Only WASM track data becomes slightly stale (contains refs to deleted images),
  // but this doesn't affect rendering.
  const newReconstruction = filterReconstructionByImageIds(reconstruction, pendingDeletions);
  if (!newReconstruction) return false;

  // Clear floor plane distances (stale after index changes)
  useFloorPlaneStore.getState().setPointDistances(null);

  // Update reconstruction
  reconstructionStore.setReconstruction(newReconstruction);

  // Clear pending deletions
  deletionStore.clearPendingDeletions();

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

  return true;
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
