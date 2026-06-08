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
import type { Reconstruction } from '../../types/colmap';
import type { WasmReconstructionWrapper } from '../../wasm/reconstruction';

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
}

interface SceneContentActionsFacade {
  setSparkBackendAvailable: SplatBackendState['setSparkBackendAvailable'];
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
}

interface SceneContainerActionsFacade {
  addNotification: NotificationState['addNotification'];
  removeNotification: NotificationState['removeNotification'];
  setSelectedImageId: CameraState['setSelectedImageId'];
  setWebGpuBackendState: SplatBackendState['setWebGpuBackendState'];
  setWebGpuMetricState: SplatBackendState['setWebGpuMetricState'];
}

export interface SceneContentStoreFacade {
  data: SceneContentDataFacade;
  actions: SceneContentActionsFacade;
}

export interface SceneContainerStoreFacade {
  data: SceneContainerDataFacade;
  actions: SceneContainerActionsFacade;
}

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
  const requestedSplatBackend = useSplatBackendStore((s) => s.requestedBackend);
  const splatBackendAvailability = useSplatBackendStore((s) => s.availability);
  const splatBackendResolution = useSplatBackendStore((s) => s.resolution);
  const setSparkBackendAvailable = useSplatBackendStore((s) => s.setSparkBackendAvailable);
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
      splatTransform,
      requestedSplatBackend,
      splatBackendAvailability,
      splatBackendResolution,
      splatsVisible: points.splatsVisible,
    },
    actions: {
      setSparkBackendAvailable,
    },
  };
}

export function useSceneContainerStoreFacade(): SceneContainerStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const wasmReconstruction = useReconstructionStore((s) => s.wasmReconstruction);
  const splatFile = useReconstructionStore((s) => s.loadedFiles?.splatFile);
  const backgroundColor = useUIStore((s) => s.backgroundColor);
  const showAutoHideEditor = useUIStore((s) => s.showAutoHideEditor);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  const setSelectedImageId = useCameraStore((s) => s.setSelectedImageId);
  const requestedSplatBackend = useSplatBackendStore((s) => s.requestedBackend);
  const splatBackendAvailability = useSplatBackendStore((s) => s.availability);
  const splatBackendResolution = useSplatBackendStore((s) => s.resolution);
  const setWebGpuBackendState = useSplatBackendStore((s) => s.setWebGpuBackendState);
  const setWebGpuMetricState = useSplatBackendStore((s) => s.setWebGpuMetricState);
  const points = usePointsNode();

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
    },
    actions: {
      addNotification,
      removeNotification,
      setSelectedImageId,
      setWebGpuBackendState,
      setWebGpuMetricState,
    },
  };
}
