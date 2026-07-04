import { useMemo } from 'react';
import { useDataset, type DatasetManager } from '../../dataset';
import {
  useCameraStore,
  useDeletionStore,
  useImageMetricsStore,
  useReconstructionStore,
  useSplatBackendStore,
  useUIStore,
  type CameraState,
  type DeletionState,
  type UIState,
} from '../../store';
import { shouldExposeSplatMetricVisualizations } from '../../utils/splatBackendPolicy';
import { reconstructionHasSplatMetricCapableCamera } from '../../splat/splatMetricCapability';
import type { Reconstruction } from '../../types/colmap';

interface ImageGalleryDataFacade {
  reconstruction: Reconstruction | null;
  dataset: DatasetManager;
  showMatches: UIState['showMatches'];
  matchesDisplayMode: UIState['matchesDisplayMode'];
  matchesColor: UIState['matchesColor'];
  galleryViewMode: UIState['galleryViewMode'];
  galleryColumns: UIState['galleryColumns'];
  galleryCameraFilter: UIState['galleryCameraFilter'];
  gallerySortField: UIState['gallerySortField'];
  gallerySortDirection: UIState['gallerySortDirection'];
  galleryBorderColorMode: UIState['galleryBorderColorMode'];
  galleryThumbnailDisplayMode: UIState['galleryThumbnailDisplayMode'];
  touchMode: UIState['touchMode'];
  autoHideButtons: UIState['autoHideElements']['buttons'];
  isIdle: UIState['isIdle'];
  showAutoHideEditor: UIState['showAutoHideEditor'];
  pendingDeletions: DeletionState['pendingDeletions'];
  splatMetricVisualizationsAvailable: boolean;
  splatPsnrFrameReady: ReturnType<typeof useImageMetricsStore.getState>['splatPsnrFrameReady'];
  splatPsnrByImage: ReturnType<typeof useImageMetricsStore.getState>['splatPsnrMetrics'];
  activeSplatFile?: File;
  selectedImageId: CameraState['selectedImageId'];
  currentViewState: CameraState['currentViewState'];
  navigationHistory: CameraState['navigationHistory'];
}

interface ImageGalleryActionsFacade {
  openImageDetail: UIState['openImageDetail'];
  setMatchedImageId: UIState['setMatchedImageId'];
  setShowMatchesInModal: UIState['setShowMatchesInModal'];
  setGalleryViewMode: UIState['setGalleryViewMode'];
  setGalleryColumns: UIState['setGalleryColumns'];
  setGalleryCameraFilter: UIState['setGalleryCameraFilter'];
  setGallerySortField: UIState['setGallerySortField'];
  setGallerySortDirection: UIState['setGallerySortDirection'];
  setGalleryBorderColorMode: UIState['setGalleryBorderColorMode'];
  setGalleryThumbnailDisplayMode: UIState['setGalleryThumbnailDisplayMode'];
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
  const hasMetricCapableCamera = useMemo(
    () => reconstructionHasSplatMetricCapableCamera(reconstruction),
    [reconstruction]
  );
  const dataset = useDataset();
  const openImageDetail = useUIStore((s) => s.openImageDetail);
  const setMatchedImageId = useUIStore((s) => s.setMatchedImageId);
  const setShowMatchesInModal = useUIStore((s) => s.setShowMatchesInModal);
  const showMatches = useUIStore((s) => s.showMatches);
  const matchesDisplayMode = useUIStore((s) => s.matchesDisplayMode);
  const matchesColor = useUIStore((s) => s.matchesColor);
  const galleryViewMode = useUIStore((s) => s.galleryViewMode);
  const galleryColumns = useUIStore((s) => s.galleryColumns);
  const galleryCameraFilter = useUIStore((s) => s.galleryCameraFilter);
  const gallerySortField = useUIStore((s) => s.gallerySortField);
  const gallerySortDirection = useUIStore((s) => s.gallerySortDirection);
  const galleryBorderColorMode = useUIStore((s) => s.galleryBorderColorMode);
  const galleryThumbnailDisplayMode = useUIStore((s) => s.galleryThumbnailDisplayMode);
  const setGalleryViewMode = useUIStore((s) => s.setGalleryViewMode);
  const setGalleryColumns = useUIStore((s) => s.setGalleryColumns);
  const setGalleryCameraFilter = useUIStore((s) => s.setGalleryCameraFilter);
  const setGallerySortField = useUIStore((s) => s.setGallerySortField);
  const setGallerySortDirection = useUIStore((s) => s.setGallerySortDirection);
  const setGalleryBorderColorMode = useUIStore((s) => s.setGalleryBorderColorMode);
  const setGalleryThumbnailDisplayMode = useUIStore((s) => s.setGalleryThumbnailDisplayMode);
  const touchMode = useUIStore((s) => s.touchMode);
  const autoHideButtons = useUIStore((s) => s.autoHideElements.buttons);
  const isIdle = useUIStore((s) => s.isIdle);
  const showAutoHideEditor = useUIStore((s) => s.showAutoHideEditor);
  const pendingDeletions = useDeletionStore((s) => s.pendingDeletions);
  const activeSplatFile = useReconstructionStore((s) => s.loadedFiles?.splatFile);
  const splatBackendResolution = useSplatBackendStore((s) => s.resolution);
  const splatMetricAvailability = useSplatBackendStore((s) => s.metricAvailability);
  const splatMetricCapability = useSplatBackendStore((s) => s.metricCapability);
  const splatPsnrFrameReady = useImageMetricsStore((s) => s.splatPsnrFrameReady);
  const splatPsnrByImage = useImageMetricsStore((s) => s.splatPsnrMetrics);
  const splatMetricVisualizationsAvailable = shouldExposeSplatMetricVisualizations({
    activeSplatFile,
    hasMetricCapableCamera,
    resolution: splatBackendResolution,
    metricAvailability: splatMetricAvailability,
    metricCapability: splatMetricCapability,
  });
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
      galleryViewMode,
      galleryColumns,
      galleryCameraFilter,
      gallerySortField,
      gallerySortDirection,
      galleryBorderColorMode,
      galleryThumbnailDisplayMode,
      touchMode,
      autoHideButtons,
      isIdle,
      showAutoHideEditor,
      pendingDeletions,
      splatMetricVisualizationsAvailable,
      splatPsnrFrameReady,
      splatPsnrByImage,
      activeSplatFile,
      selectedImageId,
      currentViewState,
      navigationHistory,
    },
    actions: {
      openImageDetail,
      setMatchedImageId,
      setShowMatchesInModal,
      setGalleryViewMode,
      setGalleryColumns,
      setGalleryCameraFilter,
      setGallerySortField,
      setGallerySortDirection,
      setGalleryBorderColorMode,
      setGalleryThumbnailDisplayMode,
      setSelectedImageId,
      flyToImage,
      pushNavigationHistory,
      popNavigationHistory,
      peekNavigationHistory,
      flyToState,
    },
  };
}
