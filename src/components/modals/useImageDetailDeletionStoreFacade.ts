import {
  selectCameraCount,
  useDeletionStore,
  useReconstructionStore,
  type DeletionState,
} from '../../store';

interface ImageDetailDeletionDataFacade {
  multiCamera: boolean;
  pendingDeletions: DeletionState['pendingDeletions'];
}

interface ImageDetailDeletionActionsFacade {
  markBulkForDeletion: DeletionState['markBulkForDeletion'];
  toggleDeletion: DeletionState['toggleDeletion'];
  unmarkBulkDeletion: DeletionState['unmarkBulkDeletion'];
}

export interface ImageDetailDeletionStoreFacade {
  data: ImageDetailDeletionDataFacade;
  actions: ImageDetailDeletionActionsFacade;
}

export function useImageDetailDeletionStoreFacade(): ImageDetailDeletionStoreFacade {
  const pendingDeletions = useDeletionStore((state) => state.pendingDeletions);
  const toggleDeletion = useDeletionStore((state) => state.toggleDeletion);
  const markBulkForDeletion = useDeletionStore((state) => state.markBulkForDeletion);
  const unmarkBulkDeletion = useDeletionStore((state) => state.unmarkBulkDeletion);
  const cameraCount = useReconstructionStore(selectCameraCount);

  return {
    data: {
      multiCamera: cameraCount > 1,
      pendingDeletions,
    },
    actions: {
      markBulkForDeletion,
      toggleDeletion,
      unmarkBulkDeletion,
    },
  };
}
