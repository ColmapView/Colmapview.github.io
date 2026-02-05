import { create } from 'zustand';

/**
 * Deletion Store
 *
 * Manages pending image deletions with an Apply/Reset workflow.
 * Deletions are staged (temporary) until the user clicks "Apply".
 *
 * For cross-store operations (applying deletions to data), use the
 * coordinated actions from `src/store/actions`:
 *
 * ```typescript
 * import { applyDeletionsToData, resetDeletionsWithCleanup, hasPendingDeletions } from '../store/actions';
 *
 * // Apply deletions permanently to reconstruction data
 * applyDeletionsToData();
 *
 * // Reset all pending deletions
 * resetDeletionsWithCleanup();
 * ```
 */
export interface DeletionState {
  /** Image IDs marked for deletion (not yet applied) */
  pendingDeletions: Set<number>;

  /** Mark an image for deletion */
  markForDeletion: (imageId: number) => void;

  /** Remove deletion mark from an image */
  unmarkDeletion: (imageId: number) => void;

  /** Toggle deletion mark for an image */
  toggleDeletion: (imageId: number) => void;

  /** Check if an image is marked for deletion */
  isMarkedForDeletion: (imageId: number) => boolean;

  /** Clear all pending deletions */
  clearPendingDeletions: () => void;
}

export const useDeletionStore = create<DeletionState>()((set, get) => ({
  pendingDeletions: new Set(),

  markForDeletion: (imageId) =>
    set((state) => {
      const newSet = new Set(state.pendingDeletions);
      newSet.add(imageId);
      return { pendingDeletions: newSet };
    }),

  unmarkDeletion: (imageId) =>
    set((state) => {
      const newSet = new Set(state.pendingDeletions);
      newSet.delete(imageId);
      return { pendingDeletions: newSet };
    }),

  toggleDeletion: (imageId) =>
    set((state) => {
      const newSet = new Set(state.pendingDeletions);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return { pendingDeletions: newSet };
    }),

  isMarkedForDeletion: (imageId) => get().pendingDeletions.has(imageId),

  clearPendingDeletions: () => set({ pendingDeletions: new Set() }),
}));
