import { useReconstructionStore } from '../../store';

export interface CameraMatchesStoreFacade {
  reconstruction: ReturnType<typeof useReconstructionStore.getState>['reconstruction'];
}

export function useCameraMatchesStoreFacade(): CameraMatchesStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);

  return { reconstruction };
}
