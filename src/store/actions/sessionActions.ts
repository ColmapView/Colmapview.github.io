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
import { useTransformStore, type TransformState } from '../stores/transformStore.js';
import { usePointPickingStore } from '../stores/pointPickingStore.js';
import { useDeletionStore } from '../stores/deletionStore.js';
import { useImageMetricsStore } from '../stores/imageMetricsStore.js';
import { createIdentityEuler, isSameEuler } from '../../utils/sim3dTransforms.js';
import { requestConfirmation } from '../../utils/confirmation.js';
import { resolveDatasetViewerSettings } from '../../utils/datasetViewerSettings.js';

/** The scene and splat alignment that Reload re-applies. */
type ReloadBaseline = Pick<TransformState, 'transform' | 'splatTransform'>;

/**
 * Reloading discards both pending changes and committed in-memory edits. An alignment is lost only
 * where it differs from what Reload re-applies; callers without a baseline (tests) get identity.
 */
export function hasUnsavedReloadState(
  baseline: ReloadBaseline = { transform: createIdentityEuler(), splatTransform: createIdentityEuler() },
): boolean {
  if (useReconstructionStore.getState().reconstructionEditRevision > 0) return true;
  const { transform, splatTransform } = useTransformStore.getState();
  if (!isSameEuler(transform, baseline.transform)) return true;
  if (!isSameEuler(splatTransform, baseline.splatTransform)) return true;
  const pending = useDeletionStore.getState().pendingDeletions;
  if (pending && pending.size > 0) return true;
  return false;
}

/**
 * Read from Reload's own inputs when asked, never recorded as settings are applied: merges and
 * settings-only imports apply settings that Reload does not bring back.
 */
async function getReloadBaseline(): Promise<ReloadBaseline> {
  const { droppedFiles, getBoundSourceViewerState } = useReconstructionStore.getState();
  // Reload hands the load these files and the settings retained beside exactly them (a URL dataset's).
  const saved = droppedFiles && await resolveDatasetViewerSettings(droppedFiles, getBoundSourceViewerState(droppedFiles));
  // Files replaced during the read make that reading another dataset's: fall back to identity.
  const current = useReconstructionStore.getState().droppedFiles === droppedFiles ? saved : null;
  return {
    transform: current?.config.transform ?? createIdentityEuler(),
    splatTransform: current?.config.splat?.transform ?? createIdentityEuler(),
  };
}

/**
 * Prompt the user before a destructive reload. Returns true if the caller
 * should proceed. Skips the prompt when there's nothing to lose.
 */
export async function confirmReload(): Promise<boolean> {
  if (!hasUnsavedReloadState(await getReloadBaseline())) return true;
  return requestConfirmation({
    title: 'Reload data?',
    message: 'Reloading re-reads the dataset: transforms, camera conversions, and pending or applied image deletions '
      + 'are discarded, and any settings saved with the dataset (alignment, view and display) are applied again.',
    confirmLabel: 'Reload',
    tone: 'danger',
  });
}

/**
 * Reset the entire session to initial state.
 * Clears reconstruction, caches, selections, and view state.
 */
export function resetSession(): void {
  // Clear all caches (including ZIP)
  clearAllCaches();

  // Clear reconstruction store
  useReconstructionStore.getState().clear();
  useImageMetricsStore.getState().clearSplatPsnr();

  // Reset transform state
  const transformStore = useTransformStore.getState();
  transformStore.resetTransform();
  transformStore.resetSplatTransform();

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
  const transformStore = useTransformStore.getState();
  transformStore.resetTransform();
  transformStore.resetSplatTransform();

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
