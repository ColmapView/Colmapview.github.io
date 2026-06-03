import {
  applyDeletionsToData,
  resetDeletionsWithCleanup,
  useDeletionStore,
  useReconstructionStore,
  useUIStore,
  type DeletionState,
  type UIState,
} from '../../store';
import type { Reconstruction } from '../../types/colmap';

interface DeletionModalDataFacade {
  reconstruction: Reconstruction | null;
  pendingDeletions: DeletionState['pendingDeletions'];
}

interface DeletionModalActionsFacade {
  unmarkDeletion: DeletionState['unmarkDeletion'];
  markBulkForDeletion: DeletionState['markBulkForDeletion'];
  openImageDetail: UIState['openImageDetail'];
  applyDeletions: typeof applyDeletionsToData;
  resetDeletions: typeof resetDeletionsWithCleanup;
}

export interface DeletionModalStoreFacade {
  data: DeletionModalDataFacade;
  actions: DeletionModalActionsFacade;
}

export function useDeletionModalStoreFacade(): DeletionModalStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const pendingDeletions = useDeletionStore((s) => s.pendingDeletions);
  const unmarkDeletion = useDeletionStore((s) => s.unmarkDeletion);
  const markBulkForDeletion = useDeletionStore((s) => s.markBulkForDeletion);
  const openImageDetail = useUIStore((s) => s.openImageDetail);

  return {
    data: {
      reconstruction,
      pendingDeletions,
    },
    actions: {
      unmarkDeletion,
      markBulkForDeletion,
      openImageDetail,
      applyDeletions: applyDeletionsToData,
      resetDeletions: resetDeletionsWithCleanup,
    },
  };
}
