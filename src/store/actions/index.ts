/**
 * Store Actions
 *
 * Centralized action modules for coordinated cross-store operations.
 * These actions replace direct cross-store access patterns with explicit coordination.
 *
 * Usage:
 * ```typescript
 * import { clearReconstruction, applyTransformPreset, resetSession } from './store/actions';
 *
 * // Clear with options
 * clearReconstruction({ preserveZip: true });
 *
 * // Apply transform preset
 * applyTransformPreset('centerAtOrigin');
 *
 * // Reset entire session
 * resetSession();
 * ```
 */

// Reconstruction actions
export {
  clearReconstruction,
  setNewReconstruction,
  getReconstructionForTransform,
  hasReconstruction,
  getPointCount,
  type ClearReconstructionOptions,
  type SetReconstructionOptions,
  type SetReconstructionResult,
} from './reconstructionActions.js';

// Transform actions
export {
  applyTransformPreset,
  applyTransformToData,
  resetTransformWithCleanup,
  hasActiveTransform,
  getCurrentTransform,
} from './transformActions.js';

// Session actions
export {
  resetSession,
  resetViewToDefault,
  deselectAll,
  clearTransientState,
  closeAllModals,
} from './sessionActions.js';
