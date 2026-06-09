import { useCallback, useMemo, useState } from 'react';
import { prioritizeFrustumTexture } from '../../hooks/useFrustumTexture';
import { COLUMNS } from '../../theme';
import { parseSafeIntegerString } from '../../utils/numberParsing';
import { shouldHideChromeWithButtons } from '../layout/autoHideChromePolicy';
import { useImageGalleryStoreFacade } from './useImageGalleryStoreFacade';
import { useImageGalleryThumbnailSettling } from './useImageGalleryThumbnailSettling';
import { getImageGalleryRightClickAction } from './imageGalleryRightClickPolicy';
import { getGalleryMetricBorderColorScale } from './imageGalleryBorderColorViewModel';
import {
  buildGalleryCameras,
  buildGalleryImages,
  buildMatchedImageIds,
  getLastNavigationToImageId,
  type CameraFilter,
  type GalleryBorderColorMode,
  type ViewMode,
} from './imageGalleryDataViewModel';
import type {
  GalleryBorderColorModeSetting,
  GalleryViewModeSetting,
} from '../../types/gallery';
export {
  buildGalleryCameras,
  buildGalleryImages,
  buildImageRows,
  buildListRows,
  buildMatchedImageIds,
  getLastNavigationToImageId,
  type CameraFilter,
  type GalleryBorderColorMode,
  type GalleryThumbnailDisplayMode,
  type ImageData,
  type SortDirection,
  type SortField,
  type ViewMode,
} from './imageGalleryDataViewModel';
export {
  getGalleryKeyboardNavigationImageId,
  isGalleryKeyboardTextTarget,
  isGalleryNavigationKey,
  type GalleryNavigationKey,
} from './imageGalleryKeyboardNavigationPolicy';

function normalizeGalleryColumns(columns: number): number {
  if (!Number.isFinite(columns)) return COLUMNS.default;
  return Math.min(COLUMNS.max, Math.max(COLUMNS.min, Math.round(columns)));
}

function getEffectiveViewMode(
  viewMode: GalleryViewModeSetting,
  touchMode: boolean
): ViewMode {
  return viewMode === 'auto' ? (touchMode ? 'list' : 'gallery') : viewMode;
}

function getEffectiveCameraFilter(
  cameraFilter: string,
  cameras: readonly { cameraId: number }[]
): CameraFilter {
  if (cameraFilter === 'all') return 'all';

  const parsedCameraId = parseSafeIntegerString(String(cameraFilter));
  if (parsedCameraId === null) return 'all';

  return cameras.some(camera => camera.cameraId === parsedCameraId) ? parsedCameraId : 'all';
}

function getEffectiveBorderColorMode(
  borderColorMode: GalleryBorderColorModeSetting,
  hasActiveSplatFile: boolean
): GalleryBorderColorMode {
  if (borderColorMode === 'auto') {
    return hasActiveSplatFile ? 'psnr' : 'none';
  }
  if (!hasActiveSplatFile && (borderColorMode === 'psnr' || borderColorMode === 'ssim')) {
    return 'none';
  }
  return borderColorMode;
}

export function useImageGalleryViewModel() {
  const {
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
      activeSplatFile,
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
  } = useImageGalleryStoreFacade();
  const cameras = useMemo(() => buildGalleryCameras(reconstruction), [reconstruction]);
  const viewMode = getEffectiveViewMode(galleryViewMode, touchMode);
  const effectiveGalleryColumns = normalizeGalleryColumns(galleryColumns);
  const cameraFilter = useMemo(
    () => getEffectiveCameraFilter(galleryCameraFilter, cameras),
    [galleryCameraFilter, cameras]
  );
  const hasMasks = dataset.hasMasks();
  const effectiveThumbnailDisplayMode = hasMasks ? galleryThumbnailDisplayMode : 'image';
  const borderColorMode = getEffectiveBorderColorMode(
    galleryBorderColorMode,
    Boolean(activeSplatFile)
  );
  const [imageCacheVersion, setImageCacheVersion] = useState(0);
  const showSplatMetrics = splatPsnrFrameReady && splatPsnrByImage.size > 0;
  const isSplatMetricSort = gallerySortField === 'splatPsnr' || gallerySortField === 'splatSsim';
  const effectiveSortField = showSplatMetrics || !isSplatMetricSort ? gallerySortField : 'name';

  const setViewMode = useCallback((nextViewMode: ViewMode) => {
    setGalleryViewMode(nextViewMode);
  }, [setGalleryViewMode]);

  const setEffectiveGalleryColumns = useCallback((nextColumns: number) => {
    setGalleryColumns(normalizeGalleryColumns(nextColumns));
  }, [setGalleryColumns]);

  const setCameraFilter = useCallback((nextCameraFilter: CameraFilter) => {
    setGalleryCameraFilter(String(nextCameraFilter));
  }, [setGalleryCameraFilter]);

  const setBorderColorMode = useCallback((nextBorderColorMode: GalleryBorderColorMode) => {
    setGalleryBorderColorMode(nextBorderColorMode);
  }, [setGalleryBorderColorMode]);

  const matchedImageIds = useMemo(
    () => buildMatchedImageIds(reconstruction, selectedImageId, showMatches),
    [reconstruction, selectedImageId, showMatches]
  );

  const handleClick = useCallback((imageId: number) => {
    setSelectedImageId(imageId);
  }, [setSelectedImageId]);

  const handleDoubleClick = useCallback((imageId: number) => {
    openImageDetail(imageId);
  }, [openImageDetail]);

  const handleRightClick = useCallback((imageId: number) => {
    const action = getImageGalleryRightClickAction({
      imageId,
      selectedImageId,
      isMatchedImage: matchedImageIds.has(imageId),
      currentViewState,
      lastNavigationEntry: peekNavigationHistory(),
    });

    if (action.type === 'openMatchedImageDetail') {
      setShowMatchesInModal(true);
      setMatchedImageId(action.matchedImageId);
      openImageDetail(action.selectedImageId);
      setTimeout(() => setMatchedImageId(action.matchedImageId), 0);
      return;
    }

    if (action.type === 'deselect') {
      setSelectedImageId(null);
      return;
    }

    if (action.type === 'restoreNavigation') {
      const entry = popNavigationHistory();
      if (entry) {
        flyToState(entry.fromState);
        setSelectedImageId(null);
      }
      return;
    }

    const image = reconstruction?.images.get(action.imageId);
    if (image) {
      const cachedFile = dataset.getImageSync(image.name);
      if (cachedFile) {
        prioritizeFrustumTexture(cachedFile, image.name);
      }
    }

    if (action.navigationEntry) {
      pushNavigationHistory(action.navigationEntry);
    }
    setSelectedImageId(action.imageId);
    flyToImage(action.imageId);
  }, [
    setSelectedImageId,
    flyToImage,
    currentViewState,
    peekNavigationHistory,
    popNavigationHistory,
    pushNavigationHistory,
    flyToState,
    selectedImageId,
    matchedImageIds,
    setShowMatchesInModal,
    setMatchedImageId,
    openImageDetail,
    reconstruction,
    dataset,
  ]);

  const lastNavigationToImageId = useMemo(
    () => getLastNavigationToImageId(navigationHistory),
    [navigationHistory]
  );

  const isSettling = useImageGalleryThumbnailSettling({
    cameraFilter,
    selectedImageId,
    sortDirection: gallerySortDirection,
    sortField: effectiveSortField,
  }, 50);

  const images = useMemo(() => {
    void imageCacheVersion;
    void hasMasks;
    return buildGalleryImages({
      reconstruction,
      imageSource: {
        getImageSync: (imageName) => dataset.getImageSync(imageName),
        getMaskSync: (imageName) => dataset.getMaskSync(imageName),
      },
      splatPsnrByImage: showSplatMetrics ? splatPsnrByImage : undefined,
      cameraFilter,
      sortField: effectiveSortField,
      sortDirection: gallerySortDirection,
    });
  }, [
    reconstruction,
    dataset,
    hasMasks,
    showSplatMetrics,
    splatPsnrByImage,
    cameraFilter,
    effectiveSortField,
    gallerySortDirection,
    imageCacheVersion,
  ]);
  const metricBorderColorScale = useMemo(
    () => getGalleryMetricBorderColorScale(images, borderColorMode),
    [images, borderColorMode]
  );

  const refreshImageCacheVersion = useCallback(() => {
    setImageCacheVersion(v => v + 1);
  }, []);

  const hideImageOverlay = shouldHideChromeWithButtons({
    autoHideButtons,
    isIdle,
    showAutoHideEditor,
  });

  return {
    cameraFilter,
    borderColorMode,
    cameras,
    dataset,
    galleryColumns: effectiveGalleryColumns,
    handleClick,
    handleDoubleClick,
    handleRightClick,
    hasMasks,
    images,
    isSettling,
    lastNavigationToImageId,
    matchedImageIds,
    matchesColor,
    matchesDisplayMode,
    metricBorderColorScale,
    pendingDeletions,
    reconstruction,
    refreshImageCacheVersion,
    selectedImageId,
    setBorderColorMode,
    setCameraFilter,
    setGalleryColumns: setEffectiveGalleryColumns,
    setSortDirection: setGallerySortDirection,
    setSortField: setGallerySortField,
    setThumbnailDisplayMode: setGalleryThumbnailDisplayMode,
    setViewMode,
    hideImageOverlay,
    hideToolbar: false,
    showSplatMetrics,
    showMatches,
    sortDirection: gallerySortDirection,
    sortField: effectiveSortField,
    thumbnailDisplayMode: effectiveThumbnailDisplayMode,
    touchMode,
    viewMode,
  };
}
