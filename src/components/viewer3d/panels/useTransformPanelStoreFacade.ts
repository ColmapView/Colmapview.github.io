import {
  applyTransformPreset,
  applyTransformToData,
  usePointPickingStore,
  useReconstructionStore,
  useTransformStore,
  useUIStore,
  type PointPickingState,
  type TransformState,
  type UIState,
} from '../../../store';
import type { Reconstruction } from '../../../types/colmap';
import type { WasmReconstructionWrapper } from '../../../wasm/reconstruction';

interface TransformPanelDataFacade {
  reconstruction: Reconstruction | null;
  wasmReconstruction: WasmReconstructionWrapper | null;
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

interface TransformPanelPointPickingFacade {
  pickingMode: PointPickingState['pickingMode'];
  setPickingMode: PointPickingState['setPickingMode'];
}

interface TransformPanelActionFacade {
  applyTransformPreset: typeof applyTransformPreset;
  applyTransformToData: typeof applyTransformToData;
}

export interface TransformPanelStoreFacade {
  data: TransformPanelDataFacade;
  transform: TransformPanelTransformFacade;
  ui: TransformPanelUiFacade;
  pointPicking: TransformPanelPointPickingFacade;
  actions: TransformPanelActionFacade;
}

export function useTransformPanelStoreFacade(): TransformPanelStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);
  const droppedFiles = useReconstructionStore((s) => s.droppedFiles);

  const transform = useTransformStore((s) => s.transform);
  const setTransform = useTransformStore((s) => s.setTransform);
  const resetTransform = useTransformStore((s) => s.resetTransform);

  const showGizmo = useUIStore((s) => s.showGizmo);
  const toggleGizmo = useUIStore((s) => s.toggleGizmo);

  const pickingMode = usePointPickingStore((s) => s.pickingMode);
  const setPickingMode = usePointPickingStore((s) => s.setPickingMode);

  return {
    data: {
      reconstruction,
      wasmReconstruction,
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
    pointPicking: {
      pickingMode,
      setPickingMode,
    },
    actions: {
      applyTransformPreset,
      applyTransformToData,
    },
  };
}
