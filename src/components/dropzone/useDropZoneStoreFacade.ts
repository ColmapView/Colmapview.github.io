import { hasUrlToLoad, useReconstructionStore, useUIStore } from '../../store';

export interface DropZoneStoreFacadeData {
  error: ReturnType<typeof useReconstructionStore.getState>['error'];
  reconstruction: ReturnType<typeof useReconstructionStore.getState>['reconstruction'];
  touchMode: ReturnType<typeof useUIStore.getState>['touchMode'];
  hasUrlLoadRequest: boolean;
}

export interface DropZoneStoreFacadeActions {
  setError: ReturnType<typeof useReconstructionStore.getState>['setError'];
}

export interface DropZoneStoreFacade {
  data: DropZoneStoreFacadeData;
  actions: DropZoneStoreFacadeActions;
}

export function useDropZoneStoreFacade(): DropZoneStoreFacade {
  const error = useReconstructionStore((s) => s.error);
  const setError = useReconstructionStore((s) => s.setError);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const touchMode = useUIStore((s) => s.touchMode);

  return {
    data: {
      error,
      reconstruction,
      touchMode,
      hasUrlLoadRequest: hasUrlToLoad(),
    },
    actions: {
      setError,
    },
  };
}
