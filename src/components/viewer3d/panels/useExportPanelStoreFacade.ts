import {
  applyDeletionsToData,
  confirmReload,
  useDeletionStore,
  useNotificationStore,
  useReconstructionStore,
  useTransformStore,
  type DeletionState,
  type NotificationState,
  type TransformState,
} from '../../../store';
import type { LoadedFiles, Reconstruction } from '../../../types/colmap';
import type { WasmReconstructionWrapper } from '../../../wasm/reconstruction';

interface ExportPanelLiveReconstruction {
  reconstruction: Reconstruction | null;
  wasmReconstruction: WasmReconstructionWrapper | null;
}

interface ExportPanelDataFacade {
  reconstruction: Reconstruction | null;
  loadedFiles: LoadedFiles | null;
  droppedFiles: Map<string, File> | null;
  getLiveReconstruction: () => ExportPanelLiveReconstruction;
}

interface ExportPanelTransformFacade {
  resetTransform: TransformState['resetTransform'];
  getTransform: () => TransformState['transform'];
}

interface ExportPanelDeletionFacade {
  pendingDeletions: DeletionState['pendingDeletions'];
  getPendingDeletionCount: () => number;
  applyDeletionsToData: typeof applyDeletionsToData;
}

interface ExportPanelActionsFacade {
  addNotification: NotificationState['addNotification'];
  confirmReload: typeof confirmReload;
}

export interface ExportPanelStoreFacade {
  data: ExportPanelDataFacade;
  transform: ExportPanelTransformFacade;
  deletion: ExportPanelDeletionFacade;
  actions: ExportPanelActionsFacade;
}

export function useExportPanelStoreFacade(): ExportPanelStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);
  const droppedFiles = useReconstructionStore((s) => s.droppedFiles);
  const resetTransform = useTransformStore((s) => s.resetTransform);
  const pendingDeletions = useDeletionStore((s) => s.pendingDeletions);
  const addNotification = useNotificationStore((s) => s.addNotification);

  return {
    data: {
      reconstruction,
      loadedFiles,
      droppedFiles,
      getLiveReconstruction: () => {
        const liveStore = useReconstructionStore.getState();
        return {
          reconstruction: liveStore.reconstruction,
          wasmReconstruction: liveStore.wasmReconstruction,
        };
      },
    },
    transform: {
      resetTransform,
      getTransform: () => useTransformStore.getState().transform,
    },
    deletion: {
      pendingDeletions,
      getPendingDeletionCount: () => useDeletionStore.getState().pendingDeletions.size,
      applyDeletionsToData,
    },
    actions: {
      addNotification,
      confirmReload,
    },
  };
}
