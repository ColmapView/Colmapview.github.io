import { useSyncExternalStore } from 'react';
import {
  useCameraStore,
  useNotificationStore,
  useReconstructionStore,
  useDeletionStore,
  usePublicationStatusStore,
  useDrivePublicationStatus,
  type NotificationState,
} from '../../../store';
import type { CameraViewState } from '../../../store/types';
import type { Reconstruction } from '../../../types/colmap';
import type { ColmapManifest } from '../../../types/manifest';
import { hubShareLinks } from '../../../features/colmapviewHub/hubShareLinks';
import { getHubSourceKey } from '../../../features/datasetPublishing/publicationSnapshot';

interface SharePanelDataFacade {
  hasEdits: boolean;
  publicationActive: boolean;
  reconstruction: Reconstruction | null;
  sourceUrl: string | null;
  sourceManifest: ColmapManifest | null;
  currentViewState: CameraViewState | null;
  hubLink: string | null;
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
  const addNotification = useNotificationStore((s) => s.addNotification);
  const hfPublicationActive = usePublicationStatusStore((s) => s.phase !== 'idle');
  const drivePublicationActive = useDrivePublicationStatus((s) => s.active);
  const sourceKey = useReconstructionStore(getHubSourceKey);
  useSyncExternalStore(hubShareLinks.subscribe, hubShareLinks.getVersion);
  // The Hub link opens the view saved at upload, so it is offered only for that exact dataset state.
  const hubLink = hubShareLinks.match({ key: sourceKey, revision }, pending);

  return {
    data: {
      hasEdits: revision > 0 || pending > 0,
      publicationActive: hfPublicationActive || drivePublicationActive,
      reconstruction,
      sourceUrl,
      sourceManifest,
      currentViewState,
      hubLink,
    },
    addNotification,
  };
}
