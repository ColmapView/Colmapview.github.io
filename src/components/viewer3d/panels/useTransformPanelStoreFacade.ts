import {
  applyTransformToData,
  confirmReload,
  useReconstructionStore,
  useTransformStore,
  useUIStore,
  type TransformState,
  type UIState,
} from '../../../store';
import type { Reconstruction } from '../../../types/colmap';

interface TransformPanelDataFacade {
  reconstruction: Reconstruction | null;
  droppedFiles: Map<string, File> | null;
}

interface TransformPanelTransformFacade {
  transform: TransformState['transform'];
  setTransform: TransformState['setTransform'];
  resetTransform: TransformState['resetTransform'];
}

interface TransformPanelUiFacade {
  showGizmo: boolean;
  toggleGizmo: UIState['toggleGizmo'];
}

interface TransformPanelActionFacade {
  /**
   * The commit. `applyTransformPreset` is deliberately absent: the panel's two
   * preset buttons moved to Align, which is where a transform gets COMPUTED —
   * this panel only edits one by hand and commits it.
   */
  applyTransformToData: typeof applyTransformToData;
  /** Asked before Reload, like every other Reload entry point. */
  confirmReload: typeof confirmReload;
}

export interface TransformPanelStoreFacade {
  data: TransformPanelDataFacade;
  transform: TransformPanelTransformFacade;
  ui: TransformPanelUiFacade;
  actions: TransformPanelActionFacade;
}

export function useTransformPanelStoreFacade(): TransformPanelStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const droppedFiles = useReconstructionStore((s) => s.droppedFiles);

  const transform = useTransformStore((s) => s.transform);
  const setTransform = useTransformStore((s) => s.setTransform);
  const resetTransform = useTransformStore((s) => s.resetTransform);

  const showGizmo = useUIStore((s) => s.showGizmo);
  const toggleGizmo = useUIStore((s) => s.toggleGizmo);

  return {
    data: {
      reconstruction,
      droppedFiles,
    },
    transform: {
      transform,
      setTransform,
      resetTransform,
    },
    ui: {
      showGizmo,
      toggleGizmo,
    },
    actions: {
      applyTransformToData,
      confirmReload,
    },
  };
}
