import { useReconstructionStore } from '../../store/reconstructionStore';

export interface CacheStatsIndicatorStoreFacade {
  reconstruction: ReturnType<typeof useReconstructionStore.getState>['reconstruction'];
  hasSplatFile: boolean;
}

export function useCacheStatsIndicatorStoreFacade(): CacheStatsIndicatorStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const hasSplatFile = useReconstructionStore((s) => Boolean(s.loadedFiles?.splatFile));

  return { reconstruction, hasSplatFile };
}
