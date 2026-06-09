import { usePointsNode } from '../../../nodes';
import {
  useNotificationStore,
  useReconstructionStore,
  useSplatBackendStore,
} from '../../../store';
import type { NotificationState, SplatBackendState } from '../../../store';
import type {
  SplatBackendAvailability,
  SplatBackendPreference,
  SplatBackendResolution,
} from '../../../utils/splatBackendPolicy';

interface SplatLayerDataFacade {
  showSplats: boolean;
  splatFile?: File;
  requestedBackend: SplatBackendPreference;
  splatBackendAvailability: SplatBackendAvailability;
  splatBackendResolution: SplatBackendResolution;
}

interface SplatLayerActionsFacade {
  addNotification: NotificationState['addNotification'];
  removeNotification: NotificationState['removeNotification'];
  setSparkBackendAvailable: SplatBackendState['setSparkBackendAvailable'];
  getUrlProgress: () => ReturnType<typeof useReconstructionStore.getState>['urlProgress'];
  setUrlLoading: ReturnType<typeof useReconstructionStore.getState>['setUrlLoading'];
  setUrlProgress: ReturnType<typeof useReconstructionStore.getState>['setUrlProgress'];
}

export interface SplatLayerStoreFacade {
  data: SplatLayerDataFacade;
  actions: SplatLayerActionsFacade;
}

const getCurrentUrlProgress = () => useReconstructionStore.getState().urlProgress;

export function useSplatLayerStoreFacade(): SplatLayerStoreFacade {
  const points = usePointsNode();
  const splatFile = useReconstructionStore((s) => s.loadedFiles?.splatFile);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  const setUrlLoading = useReconstructionStore((s) => s.setUrlLoading);
  const setUrlProgress = useReconstructionStore((s) => s.setUrlProgress);
  const requestedBackend = useSplatBackendStore((s) => s.requestedBackend);
  const splatBackendAvailability = useSplatBackendStore((s) => s.availability);
  const splatBackendResolution = useSplatBackendStore((s) => s.resolution);
  const setSparkBackendAvailable = useSplatBackendStore((s) => s.setSparkBackendAvailable);

  return {
    data: {
      showSplats: points.splatsVisible,
      splatFile,
      requestedBackend,
      splatBackendAvailability,
      splatBackendResolution,
    },
    actions: {
      addNotification,
      removeNotification,
      setSparkBackendAvailable,
      getUrlProgress: getCurrentUrlProgress,
      setUrlLoading,
      setUrlProgress,
    },
  };
}
