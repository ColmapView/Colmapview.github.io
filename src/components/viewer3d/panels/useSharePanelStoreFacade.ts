import {
  useCameraStore,
  useExportStore,
  useNotificationStore,
  useReconstructionStore,
  useDeletionStore,
  usePublicationStatusStore,
  useDrivePublicationStatus,
  type ExportState,
  type NotificationState,
} from '../../../store';
import type { CameraViewState } from '../../../store/types';
import type { Reconstruction } from '../../../types/colmap';
import type { ColmapManifest } from '../../../types/manifest';

interface SharePanelDataFacade {
  hasEdits: boolean;
  publicationActive: boolean;
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
  const revision = useReconstructionStore((s) => s.reconstructionEditRevision);
  const pending = useDeletionStore((s) => s.pendingDeletions.size);
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const sourceUrl = useReconstructionStore((s) => s.sourceUrl);
  const sourceManifest = useReconstructionStore((s) => s.sourceManifest);
  const currentViewState = useCameraStore((s) => s.currentViewState);
  const getScreenshotBlob = useExportStore((s) => s.getScreenshotBlob);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const hfPublicationActive = usePublicationStatusStore((s) => s.phase !== 'idle');
  const drivePublicationActive = useDrivePublicationStatus((s) => s.active);

  return {
    data: {
      hasEdits: revision > 0 || pending > 0,
      publicationActive: hfPublicationActive || drivePublicationActive,
      reconstruction,
      sourceUrl,
      sourceManifest,
      currentViewState,
      getScreenshotBlob,
    },
    addNotification,
  };
}
