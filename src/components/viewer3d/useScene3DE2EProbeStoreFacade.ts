import { useCallback } from 'react';
import {
  useCameraStore,
  useDeletionStore,
  useImageMetricsStore,
  useReconstructionStore,
  useSplatBackendStore,
  useTransformStore,
  useUIStore,
  type CameraState,
  type DeletionState,
  type SplatPsnrComputeScope,
  type SplatPsnrMetric,
  type TransformState,
  type UIState,
} from '../../store';
import type {
  SplatBackendAvailability,
  SplatBackendPreference,
  SplatBackendResolution,
  SplatMetricCapability,
} from '../../utils/splatBackendPolicy';
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
  getImageIds: () => number[];
  getSplatPsnrState: (imageId?: number | null) => {
    frameReady: boolean;
    computing: boolean;
    readyCount: number;
    status: string | null;
    error: string | null;
    metric: {
      psnr: number;
      ssim?: number;
      mse: number;
      validPixelCount: number;
      width: number;
      height: number;
      computedAt: number;
      renderBackground?: SplatPsnrMetric['renderBackground'];
    } | null;
  };
  getSelectedImageId: () => CameraState['selectedImageId'];
  getSplatBackendState: () => {
    requestedBackend: SplatBackendPreference;
    availability: SplatBackendAvailability;
    resolution: SplatBackendResolution;
    metricCapability: SplatMetricCapability;
  };
  requestSplatPsnrCompute: (scope: SplatPsnrComputeScope, selectedImageId?: number | null) => void;
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
  const requestSplatPsnrCompute = useImageMetricsStore((state) => state.requestSplatPsnrCompute);

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
  const getImageIds = useCallback(() => {
    const reconstruction = useReconstructionStore.getState().reconstruction;
    return reconstruction ? Array.from(reconstruction.images.keys()) : [];
  }, []);
  const getSplatBackendState = useCallback(() => {
    const state = useSplatBackendStore.getState();
    return {
      requestedBackend: state.requestedBackend,
      availability: state.availability,
      resolution: state.resolution,
      metricCapability: state.metricCapability,
    };
  }, []);

  const getSplatPsnrState = useCallback((imageId?: number | null) => {
    const state = useImageMetricsStore.getState();
    const metric = imageId === undefined || imageId === null
      ? null
      : state.splatPsnrMetrics.get(imageId) ?? null;

    return {
      frameReady: state.splatPsnrFrameReady,
      computing: state.splatPsnrComputing,
      readyCount: state.splatPsnrMetrics.size,
      status: imageId === undefined || imageId === null
        ? null
        : state.splatPsnrStatus.get(imageId) ?? null,
      error: imageId === undefined || imageId === null
        ? null
        : state.splatPsnrError.get(imageId) ?? null,
      metric: metric
        ? {
          psnr: metric.psnr,
          ssim: metric.ssim,
          mse: metric.mse,
          validPixelCount: metric.validPixelCount,
          width: metric.width,
          height: metric.height,
          computedAt: metric.computedAt,
          renderBackground: metric.renderBackground,
        }
        : null,
    };
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
      getImageIds,
      getSplatBackendState,
      getSplatPsnrState,
      getSelectedImageId,
      requestSplatPsnrCompute,
      setCameraDisplayMode: showCameraDisplayMode,
      setCameraScale: setFixedCameraScale,
      setSelectedImageId,
    },
  };
}
