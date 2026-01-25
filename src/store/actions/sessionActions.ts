/**
 * Session Actions
 *
 * Coordinates cross-store operations for session lifecycle management.
 * These actions provide clean reset and deselection patterns across multiple stores.
 */

import { clearAllCaches } from '../../cache/index.js';
import { useReconstructionStore } from '../reconstructionStore.js';
import { useUIStore } from '../stores/uiStore.js';
import { useCameraStore } from '../stores/cameraStore.js';
import { useTransformStore } from '../stores/transformStore.js';
import { usePointPickingStore } from '../stores/pointPickingStore.js';

/**
 * Reset the entire session to initial state.
 * Clears reconstruction, caches, selections, and view state.
 */
export function resetSession(): void {
  // Clear all caches (including ZIP)
  clearAllCaches();

  // Clear reconstruction store
  useReconstructionStore.getState().clear();

  // Reset transform state
  useTransformStore.getState().resetTransform();

  // Reset point picking state
  usePointPickingStore.getState().reset();

  // Clear camera selections and navigation history
  const cameraStore = useCameraStore.getState();
  cameraStore.setSelectedImageId(null);
  cameraStore.clearFlyTo();
  cameraStore.clearNavigationHistory();
  cameraStore.clearFlyToViewState();

  // Close any open modals
  const uiStore = useUIStore.getState();
  uiStore.closeImageDetail();
  uiStore.closeContextMenu();
  uiStore.closeContextMenuEditor();

  // Reset view
  uiStore.resetView();
}

/**
 * Reset the 3D view to default camera position.
 * Does not clear data, only resets the camera view.
 */
export function resetViewToDefault(): void {
  // Trigger view reset
  useUIStore.getState().resetView();

  // Clear any pending fly-to operations
  const cameraStore = useCameraStore.getState();
  cameraStore.clearFlyTo();
  cameraStore.clearFlyToViewState();
}

/**
 * Deselect all selections across stores.
 * Clears camera selection, point picking, and matched images.
 */
export function deselectAll(): void {
  // Clear camera selection
  useCameraStore.getState().setSelectedImageId(null);

  // Clear point picking selections
  usePointPickingStore.getState().clearSelectedPoints();

  // Clear matched image in UI
  const uiStore = useUIStore.getState();
  uiStore.setMatchedImageId(null);

  // Close context menu if open
  uiStore.closeContextMenu();
}

/**
 * Clear only transient session state without clearing reconstruction data.
 * Useful for preparing to load a new reconstruction while keeping UI settings.
 */
export function clearTransientState(): void {
  // Clear camera selection and navigation
  const cameraStore = useCameraStore.getState();
  cameraStore.setSelectedImageId(null);
  cameraStore.clearFlyTo();
  cameraStore.clearNavigationHistory();
  cameraStore.clearFlyToViewState();

  // Reset point picking
  usePointPickingStore.getState().reset();

  // Reset transform
  useTransformStore.getState().resetTransform();

  // Close modals
  const uiStore = useUIStore.getState();
  uiStore.closeImageDetail();
  uiStore.closeContextMenu();
}

/**
 * Close all open modals and popups.
 */
export function closeAllModals(): void {
  const uiStore = useUIStore.getState();
  uiStore.closeImageDetail();
  uiStore.closeContextMenu();
  uiStore.closeContextMenuEditor();
  usePointPickingStore.getState().setShowDistanceModal(false);
}
