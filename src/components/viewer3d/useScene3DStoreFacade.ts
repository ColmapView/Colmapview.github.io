import {
  useCameraStore,
  useReconstructionStore,
  useTransformStore,
  useUIStore,
  type CameraState,
  type TransformState,
  type UIState,
} from '../../store';
import type { Reconstruction } from '../../types/colmap';
import type { WasmReconstructionWrapper } from '../../wasm/reconstruction';

interface SceneContentDataFacade {
  reconstruction: Reconstruction | null;
  wasmReconstruction: WasmReconstructionWrapper | null;
  splatFile?: File;
  isIdle: UIState['isIdle'];
  autoHideElements: UIState['autoHideElements'];
  showAutoHideEditor: UIState['showAutoHideEditor'];
  viewResetTrigger: UIState['viewResetTrigger'];
  viewDirection: UIState['viewDirection'];
  viewTrigger: UIState['viewTrigger'];
  transform: TransformState['transform'];
}

interface SceneContainerDataFacade {
  reconstruction: Reconstruction | null;
  wasmReconstruction: WasmReconstructionWrapper | null;
  backgroundColor: UIState['backgroundColor'];
  showAutoHideEditor: UIState['showAutoHideEditor'];
}

interface SceneContainerActionsFacade {
  setSelectedImageId: CameraState['setSelectedImageId'];
}

export interface SceneContentStoreFacade {
  data: SceneContentDataFacade;
}

export interface SceneContainerStoreFacade {
  data: SceneContainerDataFacade;
  actions: SceneContainerActionsFacade;
}

export function useSceneContentStoreFacade(): SceneContentStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);
  const splatFile = useReconstructionStore((s) => s.loadedFiles?.splatFile);
  const isIdle = useUIStore((s) => s.isIdle);
  const autoHideElements = useUIStore((s) => s.autoHideElements);
  const showAutoHideEditor = useUIStore((s) => s.showAutoHideEditor);
  const viewResetTrigger = useUIStore((s) => s.viewResetTrigger);
  const viewDirection = useUIStore((s) => s.viewDirection);
  const viewTrigger = useUIStore((s) => s.viewTrigger);
  const transform = useTransformStore((s) => s.transform);

  return {
    data: {
      reconstruction,
      wasmReconstruction,
      splatFile,
      isIdle,
      autoHideElements,
      showAutoHideEditor,
      viewResetTrigger,
      viewDirection,
      viewTrigger,
      transform,
    },
  };
}

export function useSceneContainerStoreFacade(): SceneContainerStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);
  const backgroundColor = useUIStore((s) => s.backgroundColor);
  const showAutoHideEditor = useUIStore((s) => s.showAutoHideEditor);
  const setSelectedImageId = useCameraStore((s) => s.setSelectedImageId);

  return {
    data: {
      reconstruction,
      wasmReconstruction,
      backgroundColor,
      showAutoHideEditor,
    },
    actions: {
      setSelectedImageId,
    },
  };
}
