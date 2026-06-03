import { useUIStore } from '../../store';

export interface FpsTrackerStoreFacade {
  setFps: ReturnType<typeof useUIStore.getState>['setFps'];
}

export function useFpsTrackerStoreFacade(): FpsTrackerStoreFacade {
  const setFps = useUIStore((s) => s.setFps);

  return { setFps };
}
