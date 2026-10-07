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
import type { Sim3dEuler } from '../../types/sim3d.js';
import { createIdentityEuler } from '../../utils/sim3dTransforms.js';
import { requestConfirmation } from '../../utils/confirmation.js';
import { findDatasetViewerSettingsEntry, parseDatasetViewerSettings } from '../../utils/datasetViewerSettings.js';
import { MAX_VIEWER_STATE_BYTES, type PublishedViewerState } from '../../utils/publishedViewerState.js';

/** The scene and splat alignment that Reload re-applies. */
export type ReloadBaseline = Pick<TransformState, 'transform' | 'splatTransform'>;

const ALIGNMENT_KEYS = Object.keys(createIdentityEuler()) as (keyof Sim3dEuler)[];

// isIdentityEuler's tolerance, so the identity baseline behaves exactly as that check did.
const sameAlignment = (current: Sim3dEuler, baseline: Sim3dEuler) =>
  ALIGNMENT_KEYS.every(key => Math.abs(current[key] - baseline[key]) < 1e-9);

/**
 * Reloading discards both pending changes and committed in-memory edits. An alignment is lost only
 * where it differs from what Reload re-applies; synchronous callers without that baseline get identity.
 */
export function hasUnsavedReloadState(
  baseline: ReloadBaseline = { transform: createIdentityEuler(), splatTransform: createIdentityEuler() },
): boolean {
  if (useReconstructionStore.getState().reconstructionEditRevision > 0) return true;
  const { transform, splatTransform } = useTransformStore.getState();
  if (!sameAlignment(transform, baseline.transform)) return true;
  if (!sameAlignment(splatTransform, baseline.splatTransform)) return true;
  const pending = useDeletionStore.getState().pendingDeletions;
  if (pending && pending.size > 0) return true;
  return false;
}

/** A settings file Reload cannot read or parse is skipped, as the load skips it. */
async function readDatasetViewerSettings(files: Map<string, File>): Promise<PublishedViewerState | null> {
  const file = findDatasetViewerSettingsEntry(files)?.[1];
  if (!file || file.size > MAX_VIEWER_STATE_BYTES) return null;
  try {
    return parseDatasetViewerSettings(await file.text());
  } catch {
    return null;
  }
}

/**
 * Read from Reload's own inputs when asked, never recorded as settings are applied: merges and
 * settings-only imports apply settings that Reload does not bring back.
 */
async function getReloadBaseline(): Promise<ReloadBaseline> {
  const { droppedFiles, sourceViewerState } = useReconstructionStore.getState();
  // A URL dataset's settings are retained beside its files (an archive's own YAML included);
  // a local project's are among them.
  const saved = sourceViewerState && sourceViewerState.files === droppedFiles
    ? sourceViewerState.state
    : droppedFiles && await readDatasetViewerSettings(droppedFiles);
  return {
    transform: saved?.config.transform ?? createIdentityEuler(),
    splatTransform: saved?.config.splat?.transform ?? createIdentityEuler(),
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
