import {
  useReconstructionStore,
  useUIStore,
  type UIState,
} from '../../../store';
import type { Reconstruction } from '../../../types/colmap';
import type { ReconstructionSource } from '../../../wasm/reconstructionService';

interface SettingsPanelDataFacade {
  reconstruction: Reconstruction | null;
  wasmReconstruction: ReconstructionSource | null;
}

interface SettingsPanelUiFacade {
  idleHideTimeout: number;
  setIdleHideTimeout: UIState['setIdleHideTimeout'];
  setShowAutoHideEditor: UIState['setShowAutoHideEditor'];
  openContextMenuEditor: UIState['openContextMenuEditor'];
  // Tool windows listed in the panel's Tools section. These are the uiStore
  // flags rendered by ViewerToolModals — note floorPlaneStore declares a
  // same-named setShowFloorModal that drives the floor ALIGN window instead.
  setShowDeletionModal: UIState['setShowDeletionModal'];
  setShowConversionModal: UIState['setShowConversionModal'];
  setShowFloorModal: UIState['setShowFloorModal'];
}

export interface SettingsPanelStoreFacade {
  data: SettingsPanelDataFacade;
  ui: SettingsPanelUiFacade;
}

export function useSettingsPanelStoreFacade(): SettingsPanelStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);

  const idleHideTimeout = useUIStore((s) => s.idleHideTimeout);
  const setIdleHideTimeout = useUIStore((s) => s.setIdleHideTimeout);
  const setShowAutoHideEditor = useUIStore((s) => s.setShowAutoHideEditor);
  const openContextMenuEditor = useUIStore((s) => s.openContextMenuEditor);
  const setShowDeletionModal = useUIStore((s) => s.setShowDeletionModal);
  const setShowConversionModal = useUIStore((s) => s.setShowConversionModal);
  const setShowFloorModal = useUIStore((s) => s.setShowFloorModal);

  return {
    data: {
      reconstruction,
      wasmReconstruction,
    },
    ui: {
      idleHideTimeout,
      setIdleHideTimeout,
      setShowAutoHideEditor,
      openContextMenuEditor,
      setShowDeletionModal,
      setShowConversionModal,
      setShowFloorModal,
    },
  };
}
