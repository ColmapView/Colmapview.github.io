import {
  useNotificationStore,
  useReconstructionStore,
  type NotificationState,
} from '../../store';
import type { Reconstruction } from '../../types/colmap';
import { isReconstructionSnapshot } from '../../wasm/reconstructionService';

type SetReconstruction = (reconstruction: Reconstruction) => void | Promise<boolean>;

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
      setReconstruction: (nextReconstruction) => {
        const source = useReconstructionStore.getState().wasmReconstruction;
        if (!isReconstructionSnapshot(source)) return setReconstruction(nextReconstruction);
        return source.updateCameras(nextReconstruction.cameras).then(snapshot => {
          if (useReconstructionStore.getState().wasmReconstruction !== source) return false;
          useReconstructionStore.getState().setWasmReconstruction(snapshot);
          setReconstruction(snapshot.reconstruction);
          return true;
        }).catch(error => {
          if (useReconstructionStore.getState().wasmReconstruction === source) {
            addNotification('warning', `Camera conversion failed: ${error instanceof Error ? error.message : String(error)}`);
          }
          return false;
        });
      },
      addNotification,
    },
  };
}
