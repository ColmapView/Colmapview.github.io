import { useDataset, type DatasetManager } from '../../dataset';
import {
  selectCameraCount,
  useCameraStore,
  useReconstructionStore,
  type CameraState,
} from '../../store';

interface FrustumPlaneDataFacade {
  cameraFov: CameraState['cameraFov'];
  cameraProjection: CameraState['cameraProjection'];
  dataset: DatasetManager;
  flyTransitionDuration: CameraState['flyTransitionDuration'];
  multiCamera: boolean;
  selectionAnimationSpeed: CameraState['selectionAnimationSpeed'];
  selectionColorMode: CameraState['selectionColorMode'];
}

interface FrustumPlaneActionsFacade {
  setCameraFov: CameraState['setCameraFov'];
}

export interface FrustumPlaneStoreFacade {
  data: FrustumPlaneDataFacade;
  actions: FrustumPlaneActionsFacade;
}

export function useFrustumPlaneStoreFacade(): FrustumPlaneStoreFacade {
  const cameraCount = useReconstructionStore(selectCameraCount);
  const dataset = useDataset();
  const cameraProjection = useCameraStore((s) => s.cameraProjection);
  const cameraFov = useCameraStore((s) => s.cameraFov);
  const flyTransitionDuration = useCameraStore((s) => s.flyTransitionDuration);
  const setCameraFov = useCameraStore((s) => s.setCameraFov);
  const selectionColorMode = useCameraStore((s) => s.selectionColorMode);
  const selectionAnimationSpeed = useCameraStore((s) => s.selectionAnimationSpeed);

  return {
    data: {
      cameraFov,
      cameraProjection,
      dataset,
      flyTransitionDuration,
      multiCamera: cameraCount > 1,
      selectionAnimationSpeed,
      selectionColorMode,
    },
    actions: {
      setCameraFov,
    },
  };
}
