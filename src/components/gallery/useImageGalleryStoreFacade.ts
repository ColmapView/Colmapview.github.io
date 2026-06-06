import { useDataset, type DatasetManager } from '../../dataset';
import {
  useCameraStore,
  useDeletionStore,
  useImageMetricsStore,
  useReconstructionStore,
  useUIStore,
  type CameraState,
  type DeletionState,
  type UIState,
} from '../../store';
import type { Reconstruction } from '../../types/colmap';

interface ImageGalleryDataFacade {
  reconstruction: Reconstruction | null;
  dataset: DatasetManager;
  showMatches: UIState['showMatches'];
  matchesDisplayMode: UIState['matchesDisplayMode'];
  matchesColor: UIState['matchesColor'];
  touchMode: UIState['touchMode'];
  autoHideButtons: UIState['autoHideElements']['buttons'];
  isIdle: UIState['isIdle'];
  showAutoHideEditor: UIState['showAutoHideEditor'];
  pendingDeletions: DeletionState['pendingDeletions'];
  splatPsnrFrameReady: ReturnType<typeof useImageMetricsStore.getState>['splatPsnrFrameReady'];
  splatPsnrByImage: ReturnType<typeof useImageMetricsStore.getState>['splatPsnrMetrics'];
  selectedImageId: CameraState['selectedImageId'];
  currentViewState: CameraState['currentViewState'];
  navigationHistory: CameraState['navigationHistory'];
}

interface ImageGalleryActionsFacade {
  openImageDetail: UIState['openImageDetail'];
  setMatchedImageId: UIState['setMatchedImageId'];
  setShowMatchesInModal: UIState['setShowMatchesInModal'];
  setSelectedImageId: CameraState['setSelectedImageId'];
  flyToImage: CameraState['flyToImage'];
  pushNavigationHistory: CameraState['pushNavigationHistory'];
  popNavigationHistory: CameraState['popNavigationHistory'];
  peekNavigationHistory: CameraState['peekNavigationHistory'];
  flyToState: CameraState['flyToState'];
}

export interface ImageGalleryStoreFacade {
  data: ImageGalleryDataFacade;
  actions: ImageGalleryActionsFacade;
}

export function useImageGalleryStoreFacade(): ImageGalleryStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const dataset = useDataset();
  const openImageDetail = useUIStore((s) => s.openImageDetail);
  const setMatchedImageId = useUIStore((s) => s.setMatchedImageId);
  const setShowMatchesInModal = useUIStore((s) => s.setShowMatchesInModal);
  const showMatches = useUIStore((s) => s.showMatches);
  const matchesDisplayMode = useUIStore((s) => s.matchesDisplayMode);
  const matchesColor = useUIStore((s) => s.matchesColor);
  const touchMode = useUIStore((s) => s.touchMode);
  const autoHideButtons = useUIStore((s) => s.autoHideElements.buttons);
  const isIdle = useUIStore((s) => s.isIdle);
  const showAutoHideEditor = useUIStore((s) => s.showAutoHideEditor);
  const pendingDeletions = useDeletionStore((s) => s.pendingDeletions);
  const splatPsnrFrameReady = useImageMetricsStore((s) => s.splatPsnrFrameReady);
  const splatPsnrByImage = useImageMetricsStore((s) => s.splatPsnrMetrics);
  const selectedImageId = useCameraStore((s) => s.selectedImageId);
  const setSelectedImageId = useCameraStore((s) => s.setSelectedImageId);
  const flyToImage = useCameraStore((s) => s.flyToImage);
  const currentViewState = useCameraStore((s) => s.currentViewState);
  const pushNavigationHistory = useCameraStore((s) => s.pushNavigationHistory);
  const popNavigationHistory = useCameraStore((s) => s.popNavigationHistory);
  const peekNavigationHistory = useCameraStore((s) => s.peekNavigationHistory);
  const flyToState = useCameraStore((s) => s.flyToState);
  const navigationHistory = useCameraStore((s) => s.navigationHistory);

  return {
    data: {
      reconstruction,
      dataset,
      showMatches,
      matchesDisplayMode,
      matchesColor,
      touchMode,
      autoHideButtons,
      isIdle,
      showAutoHideEditor,
      pendingDeletions,
      splatPsnrFrameReady,
      splatPsnrByImage,
      selectedImageId,
      currentViewState,
      navigationHistory,
    },
    actions: {
      openImageDetail,
      setMatchedImageId,
      setShowMatchesInModal,
      setSelectedImageId,
      flyToImage,
      pushNavigationHistory,
      popNavigationHistory,
      peekNavigationHistory,
      flyToState,
    },
  };
}
