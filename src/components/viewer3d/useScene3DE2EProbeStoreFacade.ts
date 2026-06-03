import { useCallback } from 'react';
import {
  useCameraStore,
  useDeletionStore,
  useReconstructionStore,
  useTransformStore,
  useUIStore,
  type CameraState,
  type DeletionState,
  type TransformState,
  type UIState,
} from '../../store';
import type { CameraDisplayMode } from '../../store/types';
import type { Reconstruction } from '../../types/colmap';

interface Scene3DE2EProbeDataFacade {
  reconstruction: Reconstruction | null;
  pendingDeletions: DeletionState['pendingDeletions'];
  showCameras: CameraState['showCameras'];
  cameraDisplayMode: CameraState['cameraDisplayMode'];
  cameraScale: CameraState['cameraScale'];
  cameraScaleFactor: CameraState['cameraScaleFactor'];
  selectedImageId: CameraState['selectedImageId'];
  transform: TransformState['transform'];
  isIdle: UIState['isIdle'];
  showAutoHideEditor: UIState['showAutoHideEditor'];
  autoHideElements: UIState['autoHideElements'];
}

interface Scene3DE2EProbeActionsFacade {
  clearSelectedImage: () => void;
  getSelectedImageId: () => CameraState['selectedImageId'];
  setCameraDisplayMode: (mode: CameraDisplayMode) => void;
  setCameraScale: (scale: number) => void;
  setSelectedImageId: CameraState['setSelectedImageId'];
}

export interface Scene3DE2EProbeStoreFacade {
  data: Scene3DE2EProbeDataFacade;
  actions: Scene3DE2EProbeActionsFacade;
}

export function useScene3DE2EProbeStoreFacade(): Scene3DE2EProbeStoreFacade {
  const reconstruction = useReconstructionStore((state) => state.reconstruction);
  const pendingDeletions = useDeletionStore((state) => state.pendingDeletions);
  const showCameras = useCameraStore((state) => state.showCameras);
  const cameraDisplayMode = useCameraStore((state) => state.cameraDisplayMode);
  const cameraScale = useCameraStore((state) => state.cameraScale);
  const cameraScaleFactor = useCameraStore((state) => state.cameraScaleFactor);
  const selectedImageId = useCameraStore((state) => state.selectedImageId);
  const transform = useTransformStore((state) => state.transform);
  const isIdle = useUIStore((state) => state.isIdle);
  const showAutoHideEditor = useUIStore((state) => state.showAutoHideEditor);
  const autoHideElements = useUIStore((state) => state.autoHideElements);

  const setSelectedImageId = useCameraStore((state) => state.setSelectedImageId);
  const clearFlyTo = useCameraStore((state) => state.clearFlyTo);
  const clearNavigationHistory = useCameraStore((state) => state.clearNavigationHistory);
  const setShowCameras = useCameraStore((state) => state.setShowCameras);
  const setCameraDisplayMode = useCameraStore((state) => state.setCameraDisplayMode);
  const setCameraScaleFactor = useCameraStore((state) => state.setCameraScaleFactor);
  const setCameraScale = useCameraStore((state) => state.setCameraScale);

  const clearSelectedImage = useCallback(() => {
    setSelectedImageId(null);
    clearFlyTo();
    clearNavigationHistory();
  }, [clearFlyTo, clearNavigationHistory, setSelectedImageId]);

  const showCameraDisplayMode = useCallback((mode: CameraDisplayMode) => {
    setShowCameras(true);
    setCameraDisplayMode(mode);
  }, [setCameraDisplayMode, setShowCameras]);

  const setFixedCameraScale = useCallback((scale: number) => {
    setCameraScaleFactor('1');
    setCameraScale(scale);
  }, [setCameraScale, setCameraScaleFactor]);

  const getSelectedImageId = useCallback(() => {
    return useCameraStore.getState().selectedImageId;
  }, []);

  return {
    data: {
      reconstruction,
      pendingDeletions,
      showCameras,
      cameraDisplayMode,
      cameraScale,
      cameraScaleFactor,
      selectedImageId,
      transform,
      isIdle,
      showAutoHideEditor,
      autoHideElements,
    },
    actions: {
      clearSelectedImage,
      getSelectedImageId,
      setCameraDisplayMode: showCameraDisplayMode,
      setCameraScale: setFixedCameraScale,
      setSelectedImageId,
    },
  };
}
