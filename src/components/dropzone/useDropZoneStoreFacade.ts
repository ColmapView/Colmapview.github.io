import { hasUrlToLoad, useReconstructionStore, useUIStore } from '../../store';

export interface DropZoneStoreFacadeData {
  error: ReturnType<typeof useReconstructionStore.getState>['error'];
  reconstruction: ReturnType<typeof useReconstructionStore.getState>['reconstruction'];
  touchMode: ReturnType<typeof useUIStore.getState>['touchMode'];
  hasUrlLoadRequest: boolean;
}

export interface DropZoneStoreFacadeActions {
  setError: ReturnType<typeof useReconstructionStore.getState>['setError'];
  cancelLoading: ReturnType<typeof useReconstructionStore.getState>['cancelLoading'];
}

export interface DropZoneStoreFacade {
  data: DropZoneStoreFacadeData;
  actions: DropZoneStoreFacadeActions;
}

export function useDropZoneStoreFacade(): DropZoneStoreFacade {
  const error = useReconstructionStore((s) => s.error);
  const setError = useReconstructionStore((s) => s.setError);
  const cancelLoading = useReconstructionStore((s) => s.cancelLoading);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const urlError = useReconstructionStore((s) => s.urlError);
  const touchMode = useUIStore((s) => s.touchMode);

  return {
    data: {
      error,
      reconstruction,
      touchMode,
      // Failed shared links must expose the load page so users can sign in and retry.
      hasUrlLoadRequest: hasUrlToLoad() && !urlError,
    },
    actions: {
      setError,
      cancelLoading,
    },
  };
}
