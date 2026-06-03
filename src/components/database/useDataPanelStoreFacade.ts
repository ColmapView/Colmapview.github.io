import { useReconstructionStore } from '../../store';

export type DataPanelReconstruction = ReturnType<typeof useReconstructionStore.getState>['reconstruction'];

export interface DataPanelStoreFacade {
  reconstruction: DataPanelReconstruction;
}

export function useDataPanelStoreFacade(): DataPanelStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);

  return { reconstruction };
}
