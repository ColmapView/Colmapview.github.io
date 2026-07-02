import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { Camera, ImageId } from '../../types/colmap';
import type { CameraViewState } from '../../store/types';
import type { NavigationNodeActions, SelectionNodeActions } from '../../nodes';
import { getCameraIntrinsics } from '../../utils/cameraIntrinsics';
import { isSphericalCameraModel } from '../../utils/cameraModelRegistry';
import { useGuideStore } from '../../store/stores/guideStore';
import { prioritizeFrustumTexture } from '../../hooks/useFrustumTexture';
import { clearBodyCursor } from '../../utils/bodyCursor';
import { CAMERA_FRUSTUM_CURSOR_OWNER } from './cameraFrustumConstants';
import {
  getArrowContextMenuAction,
  getAutoAdjustedFov,
  getGotoContextMenuAction,
  type CameraFrustumItem,
} from './cameraFrustumViewModel';
import type { CameraFrustumContextMenuState } from './CameraFrustumContextMenuOverlay';

interface CameraFrustumNavigationControls {
  getCurrentViewState?: () => CameraViewState;
}

interface CameraFrustumNavigationHandlersOptions {
  frustums: CameraFrustumItem[];
  selectedImageId: ImageId | null;
  matchedImageIds: Set<ImageId>;
  controls?: CameraFrustumNavigationControls | null;
  viewportSize: {
    width: number;
    height: number;
  };
  cameraFov: number;
  cameraScale: number;
  autoFovEnabled: boolean;
  navActions: NavigationNodeActions;
  selectionActions: SelectionNodeActions;
  openImageDetail: (imageId: ImageId) => void;
  setMatchedImageId: (imageId: ImageId | null) => void;
  setShowMatchesInModal: (show: boolean) => void;
  setHoveredImageId: Dispatch<SetStateAction<ImageId | null>>;
  requestHoverRefresh: () => void;
  clearCursor?: (owner: string) => void;
  prioritizeTexture?: (imageFile: File, imageName: string) => void;
  showUndistortionTip?: (camera: Camera) => void;
  defer?: (callback: () => void) => void;
}

interface CameraFrustumNavigationHandlers {
  contextMenu: CameraFrustumContextMenuState | null;
  setContextMenu: Dispatch<SetStateAction<CameraFrustumContextMenuState | null>>;
  handleArrowClick: (imageId: ImageId) => void;
  handleArrowContextMenu: (imageId: ImageId) => void;
  handleContextMenuSelect: () => void;
  handleContextMenuGoto: () => void;
  handleContextMenuInfo: () => void;
  handleContextMenuClose: () => void;
}

function showUndistortionTipForCamera(camera: Camera): void {
  // Spherical intrinsics are all zeros, so the distortion check below never fires
  // for panoramas. Branch first with its own tip id so this once-only hint is
  // independent of the pinhole 'undistortion' tip (a dataset may have only
  // spherical cameras, and the two describe different features).
  if (isSphericalCameraModel(camera.modelId)) {
    useGuideStore.getState().showTip(
      'sphericalOverlay',
      'Press U to toggle the panorama overlay'
    );
    return;
  }

  const intrinsics = getCameraIntrinsics(camera);
  const hasDistortion = intrinsics.k1 !== 0 || intrinsics.k2 !== 0 ||
                        intrinsics.k3 !== 0 || intrinsics.k4 !== 0 ||
                        intrinsics.p1 !== 0 || intrinsics.p2 !== 0;
  if (!hasDistortion) return;

  useGuideStore.getState().showTip(
    'undistortion',
    'Press U to toggle lens undistortion'
  );
}

export function useCameraFrustumNavigationHandlers({
  frustums,
  selectedImageId,
  matchedImageIds,
  controls,
  viewportSize,
  cameraFov,
  cameraScale,
  autoFovEnabled,
  navActions,
  selectionActions,
  openImageDetail,
  setMatchedImageId,
  setShowMatchesInModal,
  setHoveredImageId,
  requestHoverRefresh,
  clearCursor = clearBodyCursor,
  prioritizeTexture = prioritizeFrustumTexture,
  showUndistortionTip = showUndistortionTipForCamera,
  defer = (callback) => { setTimeout(callback, 0); },
}: CameraFrustumNavigationHandlersOptions): CameraFrustumNavigationHandlers {
  const [contextMenu, setContextMenu] = useState<CameraFrustumContextMenuState | null>(null);

  const clearHoverBeforeNavigation = useCallback(() => {
    setHoveredImageId(null);
    clearCursor(CAMERA_FRUSTUM_CURSOR_OWNER);
    requestHoverRefresh();
  }, [clearCursor, requestHoverRefresh, setHoveredImageId]);

  const goBackToHistoryEntry = useCallback((entry: NonNullable<ReturnType<NavigationNodeActions['popNavigationHistory']>>) => {
    clearHoverBeforeNavigation();
    navActions.flyToState(entry.fromState);
    selectionActions.setSelectedImageId(entry.fromImageId);
  }, [clearHoverBeforeNavigation, navActions, selectionActions]);

  const prioritizeTextureForImage = useCallback((imageId: ImageId) => {
    const frustum = frustums.find(f => f.image.imageId === imageId);
    if (frustum?.imageFile) {
      prioritizeTexture(frustum.imageFile, frustum.image.name);
    }
  }, [frustums, prioritizeTexture]);

  const handleArrowClick = useCallback((imageId: ImageId) => {
    setContextMenu(null);
    if (imageId === selectedImageId) {
      openImageDetail(imageId);
    } else {
      selectionActions.setSelectedImageId(imageId);
    }
  }, [openImageDetail, selectedImageId, selectionActions]);

  const handleArrowContextMenu = useCallback((imageId: ImageId) => {
    const frustum = frustums.find(f => f.image.imageId === imageId);
    const getCurrentViewState = controls?.getCurrentViewState;
    const lastEntry = navActions.peekNavigationHistory();
    const action = getArrowContextMenuAction({
      frustumExists: Boolean(frustum),
      imageId,
      selectedImageId,
      matchedImageIds,
      lastEntry,
      canReadCurrentViewState: Boolean(getCurrentViewState),
    });

    if (action === 'none' || !frustum) return;

    if (action === 'goBack') {
      const entry = navActions.popNavigationHistory();
      if (entry) {
        goBackToHistoryEntry(entry);
      }
      return;
    }

    if (action === 'deselect') {
      selectionActions.setSelectedImageId(null);
      return;
    }

    if (action === 'openMatchedDetail' && selectedImageId !== null) {
      setShowMatchesInModal(true);
      setMatchedImageId(imageId);
      openImageDetail(selectedImageId);
      defer(() => setMatchedImageId(imageId));
      return;
    }

    prioritizeTextureForImage(imageId);

    if (getCurrentViewState) {
      const currentViewState = getCurrentViewState();
      navActions.pushNavigationHistory({
        fromState: currentViewState,
        fromImageId: selectedImageId,
        toImageId: imageId,
      });
    }
    clearHoverBeforeNavigation();

    if (autoFovEnabled) {
      const adjustedFov = getAutoAdjustedFov({
        camera: frustum.camera,
        cameraScale,
        viewportWidth: viewportSize.width,
        viewportHeight: viewportSize.height,
        currentFov: cameraFov,
      });
      if (adjustedFov !== null) {
        navActions.setFov(adjustedFov);
      }
    }

    selectionActions.setSelectedImageId(imageId);
    navActions.flyToImage(imageId);
    showUndistortionTip(frustum.camera);
  }, [
    autoFovEnabled,
    cameraFov,
    cameraScale,
    clearHoverBeforeNavigation,
    controls,
    defer,
    frustums,
    goBackToHistoryEntry,
    matchedImageIds,
    navActions,
    openImageDetail,
    prioritizeTextureForImage,
    selectedImageId,
    selectionActions,
    setMatchedImageId,
    setShowMatchesInModal,
    showUndistortionTip,
    viewportSize.height,
    viewportSize.width,
  ]);

  const handleContextMenuSelect = useCallback(() => {
    if (!contextMenu) return;
    prioritizeTextureForImage(contextMenu.imageId);
    selectionActions.setSelectedImageId(contextMenu.imageId);
    setContextMenu(null);
  }, [contextMenu, prioritizeTextureForImage, selectionActions]);

  const handleContextMenuGoto = useCallback(() => {
    if (!contextMenu) return;

    const targetImageId = contextMenu.imageId;
    prioritizeTextureForImage(targetImageId);
    const getCurrentViewState = controls?.getCurrentViewState;
    clearHoverBeforeNavigation();

    if (!getCurrentViewState) {
      navActions.flyToImage(targetImageId);
      setContextMenu(null);
      return;
    }

    const currentViewState = getCurrentViewState();
    const lastEntry = navActions.peekNavigationHistory();
    const action = getGotoContextMenuAction({
      targetImageId,
      lastEntry,
      canReadCurrentViewState: true,
    });

    if (action === 'goBack') {
      const entry = navActions.popNavigationHistory();
      if (entry) {
        navActions.flyToState(entry.fromState);
        selectionActions.setSelectedImageId(entry.fromImageId);
      }
    } else {
      navActions.pushNavigationHistory({
        fromState: currentViewState,
        fromImageId: selectedImageId,
        toImageId: targetImageId,
      });
      navActions.flyToImage(targetImageId);
    }

    setContextMenu(null);
  }, [
    clearHoverBeforeNavigation,
    contextMenu,
    controls,
    navActions,
    prioritizeTextureForImage,
    selectedImageId,
    selectionActions,
  ]);

  const handleContextMenuInfo = useCallback(() => {
    if (!contextMenu) return;
    openImageDetail(contextMenu.imageId);
    setContextMenu(null);
  }, [contextMenu, openImageDetail]);

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  return {
    contextMenu,
    setContextMenu,
    handleArrowClick,
    handleArrowContextMenu,
    handleContextMenuSelect,
    handleContextMenuGoto,
    handleContextMenuInfo,
    handleContextMenuClose,
  };
}
