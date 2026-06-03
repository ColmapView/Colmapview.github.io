import {
  useCameraStore,
  useExportStore,
  useNotificationStore,
  useReconstructionStore,
  type ExportState,
  type NotificationState,
} from '../../../store';
import type { CameraViewState } from '../../../store/types';
import type { Reconstruction } from '../../../types/colmap';
import type { ColmapManifest } from '../../../types/manifest';

interface SharePanelDataFacade {
  reconstruction: Reconstruction | null;
  sourceUrl: string | null;
  sourceManifest: ColmapManifest | null;
  currentViewState: CameraViewState | null;
  getScreenshotBlob: ExportState['getScreenshotBlob'];
}

export interface SharePanelStoreFacade {
  data: SharePanelDataFacade;
  addNotification: NotificationState['addNotification'];
}

export function useSharePanelStoreFacade(): SharePanelStoreFacade {
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const sourceUrl = useReconstructionStore((s) => s.sourceUrl);
  const sourceManifest = useReconstructionStore((s) => s.sourceManifest);
  const currentViewState = useCameraStore((s) => s.currentViewState);
  const getScreenshotBlob = useExportStore((s) => s.getScreenshotBlob);
  const addNotification = useNotificationStore((s) => s.addNotification);

  return {
    data: {
      reconstruction,
      sourceUrl,
      sourceManifest,
      currentViewState,
      getScreenshotBlob,
    },
    addNotification,
  };
}
