/**
 * Store Actions
 *
 * Centralized action modules for coordinated cross-store operations.
 * These actions replace direct cross-store access patterns with explicit coordination.
 *
 * Usage:
 * ```typescript
 * import { deselectAll, applyTransformPreset, resetSession } from './store/actions';
 *
 * // Clear the current selection
 * deselectAll();
 *
 * // Apply transform preset
 * applyTransformPreset('centerAtOrigin');
 *
 * // Reset entire session
 * resetSession();
 * ```
 */

// Transform actions
export {
  applyTransformPreset,
  applyTransformToData,
  resetTransformWithCleanup,
  getCurrentTransform,
} from './transformActions.js';

// Session actions
export {
  resetSession,
  resetViewToDefault,
  deselectAll,
  clearTransientState,
  closeAllModals,
  confirmReload,
  hasUnsavedReloadState,
} from './sessionActions.js';

// Deletion actions
export {
  applyDeletionsToData,
  resetDeletionsWithCleanup,
  hasPendingDeletions,
  getPendingDeletionCount,
  getPendingDeletions,
} from './deletionActions.js';
