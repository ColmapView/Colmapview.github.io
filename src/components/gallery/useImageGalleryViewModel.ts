import { useCallback, useMemo, useState } from 'react';
import { useResetKeyedState } from '../../hooks/useResetKeyedState';
import { prioritizeFrustumTexture } from '../../hooks/useFrustumTexture';
import { COLUMNS } from '../../theme';
import { useImageGalleryStoreFacade } from './useImageGalleryStoreFacade';
import { useImageGalleryThumbnailSettling } from './useImageGalleryThumbnailSettling';
import { getImageGalleryRightClickAction } from './imageGalleryRightClickPolicy';
import {
  buildGalleryCameras,
  buildGalleryImages,
  buildMatchedImageIds,
  getLastNavigationToImageId,
  type CameraFilter,
  type SortDirection,
  type SortField,
  type ViewMode,
} from './imageGalleryDataViewModel';
export {
  buildGalleryCameras,
  buildGalleryImages,
  buildImageRows,
  buildListRows,
  buildMatchedImageIds,
  getLastNavigationToImageId,
  type CameraFilter,
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

export function useImageGalleryViewModel() {
  const {
    data: {
      reconstruction,
      dataset,
      showMatches,
      matchesDisplayMode,
      matchesColor,
      touchMode,
      pendingDeletions,
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
  } = useImageGalleryStoreFacade();
  const [viewMode, setViewMode] = useState<ViewMode>(touchMode ? 'list' : 'gallery');
  const [galleryColumns, setGalleryColumns] = useState<number>(COLUMNS.default);
  const [cameraFilter, setCameraFilter] = useResetKeyedState<CameraFilter>(reconstruction, 'all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [imageCacheVersion, setImageCacheVersion] = useState(0);

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

    if (action.type === 'restoreNavigation') {
      const entry = popNavigationHistory();
      if (entry) {
        flyToState(entry.fromState);
        setSelectedImageId(entry.fromImageId);
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
    sortDirection,
    sortField,
  }, 50);

  const cameras = useMemo(() => buildGalleryCameras(reconstruction), [reconstruction]);

  const images = useMemo(() => {
    void imageCacheVersion;
    return buildGalleryImages({
      reconstruction,
      imageSource: {
        getImageSync: (imageName) => dataset.getImageSync(imageName),
      },
      cameraFilter,
      sortField,
      sortDirection,
    });
  }, [reconstruction, dataset, cameraFilter, sortField, sortDirection, imageCacheVersion]);

  const refreshImageCacheVersion = useCallback(() => {
    setImageCacheVersion(v => v + 1);
  }, []);

  return {
    cameraFilter,
    cameras,
    dataset,
    galleryColumns,
    handleClick,
    handleDoubleClick,
    handleRightClick,
    images,
    isSettling,
    lastNavigationToImageId,
    matchedImageIds,
    matchesColor,
    matchesDisplayMode,
    pendingDeletions,
    reconstruction,
    refreshImageCacheVersion,
    selectedImageId,
    setCameraFilter,
    setGalleryColumns,
    setSortDirection,
    setSortField,
    setViewMode,
    showMatches,
    sortDirection,
    sortField,
    touchMode,
    viewMode,
  };
}
