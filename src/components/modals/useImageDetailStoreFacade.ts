import { useDataset, type DatasetManager } from '../../dataset';
import { useReconstructionStore, useUIStore, type UIState } from '../../store';
import type { ImageId, Reconstruction } from '../../types/colmap';
import type { WasmReconstructionWrapper } from '../../wasm/reconstruction';

interface ImageDetailDataFacade {
  dataset: DatasetManager;
  reconstruction: Reconstruction | null;
  wasmReconstruction: WasmReconstructionWrapper | null;
}

interface ImageDetailUiFacade {
  imageDetailId: ImageId | null;
  showPoints2D: boolean;
  showPoints3D: boolean;
  showMatchesInModal: boolean;
  matchedImageId: ImageId | null;
  touchMode: boolean;
  showModalControls: boolean;
  openImageDetail: UIState['openImageDetail'];
  closeImageDetail: UIState['closeImageDetail'];
  setShowPoints2D: UIState['setShowPoints2D'];
  setShowPoints3D: UIState['setShowPoints3D'];
  setShowMatchesInModal: UIState['setShowMatchesInModal'];
  setMatchedImageId: UIState['setMatchedImageId'];
}

export interface ImageDetailStoreFacade {
  data: ImageDetailDataFacade;
  ui: ImageDetailUiFacade;
}

export function useImageDetailStoreFacade(): ImageDetailStoreFacade {
  const dataset = useDataset();
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);

  const imageDetailId = useUIStore((s) => s.imageDetailId);
  const closeImageDetail = useUIStore((s) => s.closeImageDetail);
  const openImageDetail = useUIStore((s) => s.openImageDetail);
  const showPoints2D = useUIStore((s) => s.showPoints2D);
  const showPoints3D = useUIStore((s) => s.showPoints3D);
  const setShowPoints2D = useUIStore((s) => s.setShowPoints2D);
  const setShowPoints3D = useUIStore((s) => s.setShowPoints3D);
  const showMatchesInModal = useUIStore((s) => s.showMatchesInModal);
  const setShowMatchesInModal = useUIStore((s) => s.setShowMatchesInModal);
  const matchedImageId = useUIStore((s) => s.matchedImageId);
  const setMatchedImageId = useUIStore((s) => s.setMatchedImageId);
  const touchMode = useUIStore((s) => s.touchMode);
  const showModalControls = useUIStore((s) => s.touchUI.modalControls);

  return {
    data: {
      dataset,
      reconstruction,
      wasmReconstruction,
    },
    ui: {
      imageDetailId,
      showPoints2D,
      showPoints3D,
      showMatchesInModal,
      matchedImageId,
      touchMode,
      showModalControls,
      openImageDetail,
      closeImageDetail,
      setShowPoints2D,
      setShowPoints3D,
      setShowMatchesInModal,
      setMatchedImageId,
    },
  };
}
