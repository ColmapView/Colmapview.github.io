import {
  useCameraStore,
  useNotificationStore,
  useReconstructionStore,
  useSplatBackendStore,
  useTransformStore,
  useUIStore,
  type CameraState,
  type NotificationState,
  type SplatBackendState,
  type TransformState,
  type UIState,
} from '../../store';
import { usePointsNode } from '../../nodes';
import type {
  SplatBackendAvailability,
  SplatBackendPreference,
  SplatBackendResolution,
} from '../../utils/splatBackendPolicy';
import type { UrlLoadProgress } from '../../types/manifest';
import type { Reconstruction } from '../../types/colmap';
import type { WasmReconstructionWrapper } from '../../wasm/reconstruction';
import { shouldHideSceneAutoHideElement } from './scene3dViewModel';
import { getSplatSourceTransform } from '../../utils/splatSourceTransform';
import { useMemo } from 'react';

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
  splatTransform: TransformState['splatTransform'];
  requestedSplatBackend: SplatBackendPreference;
  splatBackendAvailability: SplatBackendAvailability;
  splatBackendResolution: SplatBackendResolution;
  splatsVisible: boolean;
  urlProgress: UrlLoadProgress | null;
}

interface SceneContentActionsFacade {
  setSparkBackendAvailable: SplatBackendState['setSparkBackendAvailable'];
  setSparkPreloadFailed: SplatBackendState['setSparkPreloadFailed'];
}

interface SceneContainerDataFacade {
  reconstruction: Reconstruction | null;
  wasmReconstruction: WasmReconstructionWrapper | null;
  splatFile?: File;
  backgroundColor: UIState['backgroundColor'];
  showAutoHideEditor: UIState['showAutoHideEditor'];
  requestedSplatBackend: SplatBackendPreference;
  splatBackendAvailability: SplatBackendAvailability;
  splatBackendResolution: SplatBackendResolution;
  splatsVisible: boolean;
  pointsLayerVisible: boolean;
  urlLoading: boolean;
  urlProgress: UrlLoadProgress | null;
}

interface SceneContainerActionsFacade {
  addNotification: NotificationState['addNotification'];
  removeNotification: NotificationState['removeNotification'];
  setSelectedImageId: CameraState['setSelectedImageId'];
  setWebGpuBackendState: SplatBackendState['setWebGpuBackendState'];
  setWebGpuMetricState: SplatBackendState['setWebGpuMetricState'];
  getUrlProgress: () => ReturnType<typeof useReconstructionStore.getState>['urlProgress'];
  setUrlLoading: ReturnType<typeof useReconstructionStore.getState>['setUrlLoading'];
  setUrlProgress: ReturnType<typeof useReconstructionStore.getState>['setUrlProgress'];
}

export interface SceneContentStoreFacade {
  data: SceneContentDataFacade;
  actions: SceneContentActionsFacade;
}

export interface SceneContainerStoreFacade {
  data: SceneContainerDataFacade;
  actions: SceneContainerActionsFacade;
}

const getCurrentUrlProgress = () => useReconstructionStore.getState().urlProgress;

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
  const splatTransform = useTransformStore((s) => s.splatTransform);
  const loadedFiles = useReconstructionStore((s) => s.loadedFiles);
  const sourceTransform = useMemo(() => getSplatSourceTransform(splatTransform, loadedFiles), [splatTransform, loadedFiles]);
  const requestedSplatBackend = useSplatBackendStore((s) => s.requestedBackend);
  const splatBackendAvailability = useSplatBackendStore((s) => s.availability);
  const splatBackendResolution = useSplatBackendStore((s) => s.resolution);
  const urlProgress = useReconstructionStore((s) => s.urlProgress);
  const setSparkBackendAvailable = useSplatBackendStore((s) => s.setSparkBackendAvailable);
  const setSparkPreloadFailed = useSplatBackendStore((s) => s.setSparkPreloadFailed);
  const points = usePointsNode();

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
      splatTransform: sourceTransform,
      requestedSplatBackend,
      splatBackendAvailability,
      splatBackendResolution,
      splatsVisible: points.splatsVisible,
      urlProgress,
    },
    actions: {
      setSparkBackendAvailable,
      setSparkPreloadFailed,
    },
  };
}

export function useSceneContainerStoreFacade(): SceneContainerStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);
  const splatFile = useReconstructionStore((s) => s.loadedFiles?.splatFile);
  const backgroundColor = useUIStore((s) => s.backgroundColor);
  const isIdle = useUIStore((s) => s.isIdle);
  const autoHideElements = useUIStore((s) => s.autoHideElements);
  const showAutoHideEditor = useUIStore((s) => s.showAutoHideEditor);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  const setSelectedImageId = useCameraStore((s) => s.setSelectedImageId);
  const requestedSplatBackend = useSplatBackendStore((s) => s.requestedBackend);
  const splatBackendAvailability = useSplatBackendStore((s) => s.availability);
  const splatBackendResolution = useSplatBackendStore((s) => s.resolution);
  const setWebGpuBackendState = useSplatBackendStore((s) => s.setWebGpuBackendState);
  const setWebGpuMetricState = useSplatBackendStore((s) => s.setWebGpuMetricState);
  const setUrlLoading = useReconstructionStore((s) => s.setUrlLoading);
  const setUrlProgress = useReconstructionStore((s) => s.setUrlProgress);
  // Reactive copies (the getter above is for effects only): the notice layer
  // has to know whether the DropZone progress overlay is on screen right now.
  const urlLoading = useReconstructionStore((s) => s.urlLoading);
  const urlProgress = useReconstructionStore((s) => s.urlProgress);
  const points = usePointsNode();
  const pointsLayerVisible = !shouldHideSceneAutoHideElement(
    isIdle,
    showAutoHideEditor,
    autoHideElements.points
  );

  return {
    data: {
      reconstruction,
      wasmReconstruction,
      splatFile,
      backgroundColor,
      showAutoHideEditor,
      requestedSplatBackend,
      splatBackendAvailability,
      splatBackendResolution,
      splatsVisible: points.splatsVisible,
      pointsLayerVisible,
      urlLoading,
      urlProgress,
    },
    actions: {
      addNotification,
      removeNotification,
      setSelectedImageId,
      setWebGpuBackendState,
      setWebGpuMetricState,
      getUrlProgress: getCurrentUrlProgress,
      setUrlLoading,
      setUrlProgress,
    },
  };
}
