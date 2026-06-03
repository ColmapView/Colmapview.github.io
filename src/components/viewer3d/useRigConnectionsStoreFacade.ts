import { useReconstructionStore } from '../../store';

export interface RigConnectionsStoreFacade {
  reconstruction: ReturnType<typeof useReconstructionStore.getState>['reconstruction'];
}

export function useRigConnectionsStoreFacade(): RigConnectionsStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);

  return { reconstruction };
}
