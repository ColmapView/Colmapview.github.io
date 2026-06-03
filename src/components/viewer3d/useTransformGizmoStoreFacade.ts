import { useFileDropzone } from '../../hooks/useFileDropzone';
import {
  applyTransformToData,
  confirmReload,
  useReconstructionStore,
  useTransformStore,
  useUIStore,
  type TransformState,
  type UIState,
} from '../../store';

type ReconstructionStoreState = ReturnType<typeof useReconstructionStore.getState>;

interface TransformGizmoDataFacade {
  transform: TransformState['transform'];
  droppedFiles: ReconstructionStoreState['droppedFiles'];
}

interface TransformGizmoActionsFacade {
  setTransform: TransformState['setTransform'];
  resetTransform: TransformState['resetTransform'];
  setShowGizmo: UIState['setShowGizmo'];
  applyTransformToData: typeof applyTransformToData;
  confirmReload: typeof confirmReload;
  processFiles: ReturnType<typeof useFileDropzone>['processFiles'];
}

export interface TransformGizmoStoreFacade {
  data: TransformGizmoDataFacade;
  actions: TransformGizmoActionsFacade;
}

export function useTransformGizmoStoreFacade(): TransformGizmoStoreFacade {
  const transform = useTransformStore((s) => s.transform);
  const setTransform = useTransformStore((s) => s.setTransform);
  const resetTransform = useTransformStore((s) => s.resetTransform);
  const droppedFiles = useReconstructionStore((s) => s.droppedFiles);
  const setShowGizmo = useUIStore((s) => s.setShowGizmo);
  const { processFiles } = useFileDropzone();

  return {
    data: {
      transform,
      droppedFiles,
    },
    actions: {
      setTransform,
      resetTransform,
      setShowGizmo,
      applyTransformToData,
      confirmReload,
      processFiles,
    },
  };
}
