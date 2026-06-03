import { usePointsNode } from '../../../nodes';
import { useReconstructionStore } from '../../../store';

interface SplatLayerDataFacade {
  showSplats: boolean;
  splatFile?: File;
}

export interface SplatLayerStoreFacade {
  data: SplatLayerDataFacade;
}

export function useSplatLayerStoreFacade(): SplatLayerStoreFacade {
  const points = usePointsNode();
  const splatFile = useReconstructionStore((s) => s.loadedFiles?.splatFile);

  return {
    data: {
      showSplats: points.splatsVisible,
      splatFile,
    },
  };
}
