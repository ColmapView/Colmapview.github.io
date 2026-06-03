import {
  useNotificationStore,
  useReconstructionStore,
  type NotificationState,
} from '../../store';
import type { Reconstruction } from '../../types/colmap';

type SetReconstruction = ReturnType<typeof useReconstructionStore.getState>['setReconstruction'];

interface CameraConversionDataFacade {
  reconstruction: Reconstruction | null;
}

interface CameraConversionActionsFacade {
  setReconstruction: SetReconstruction;
  addNotification: NotificationState['addNotification'];
}

export interface CameraConversionStoreFacade {
  data: CameraConversionDataFacade;
  actions: CameraConversionActionsFacade;
}

export function useCameraConversionStoreFacade(): CameraConversionStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const setReconstruction = useReconstructionStore((s) => s.setReconstruction);
  const addNotification = useNotificationStore((s) => s.addNotification);

  return {
    data: { reconstruction },
    actions: {
      setReconstruction,
      addNotification,
    },
  };
}
