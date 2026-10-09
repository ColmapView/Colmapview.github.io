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
import { isDatasetLoadPendingForSplat, isSplatDownloadPending } from '../../../store/reconstructionStore';

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
  setSparkPreloadFailed: SplatBackendState['setSparkPreloadFailed'];
  getUrlProgress: () => ReturnType<typeof useReconstructionStore.getState>['urlProgress'];
  setUrlLoading: ReturnType<typeof useReconstructionStore.getState>['setUrlLoading'];
  setUrlProgress: ReturnType<typeof useReconstructionStore.getState>['setUrlProgress'];
  dropFailedSplat: ReturnType<typeof useReconstructionStore.getState>['dropFailedSplat'];
  /** A pending dataset load has not handed this splat to its renderer yet. */
  isDatasetLoadPendingForSplat: (file: File) => boolean;
  /** A tile download is pending: the overlay, progress and URL error are its own. */
  isSplatDownloadPending: () => boolean;
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
  const dropFailedSplat = useReconstructionStore((s) => s.dropFailedSplat);
  const requestedBackend = useSplatBackendStore((s) => s.requestedBackend);
  const splatBackendAvailability = useSplatBackendStore((s) => s.availability);
  const splatBackendResolution = useSplatBackendStore((s) => s.resolution);
  const setSparkBackendAvailable = useSplatBackendStore((s) => s.setSparkBackendAvailable);
  const setSparkPreloadFailed = useSplatBackendStore((s) => s.setSparkPreloadFailed);

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
      setSparkPreloadFailed,
      getUrlProgress: getCurrentUrlProgress,
      setUrlLoading,
      setUrlProgress,
      dropFailedSplat,
      isDatasetLoadPendingForSplat,
      isSplatDownloadPending,
    },
  };
}
