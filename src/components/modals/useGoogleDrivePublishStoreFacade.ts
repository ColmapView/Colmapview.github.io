import { useSyncExternalStore } from 'react';
import { useReconstructionStore, useDeletionStore } from '../../store';
import { applyDeletionsToData } from '../../store/actions/deletionActions';
import { googleDrivePublishAuth } from '../../features/googleDrive/auth';
import { drivePublication, publishCurrentDatasetToDrive } from '../../features/googleDrive/publicationRuntime';

export function useGoogleDrivePublishStoreFacade() {
  const reconstruction = useReconstructionStore(state => state.reconstruction);
  const pendingDeletions = useDeletionStore(state => state.pendingDeletions.size);
  const auth = useSyncExternalStore(googleDrivePublishAuth.subscribe, googleDrivePublishAuth.getSnapshot);
  const publish = useSyncExternalStore(drivePublication.subscribe, drivePublication.getSnapshot);
  return { reconstruction, pendingDeletions, auth, publish, applyDeletionsToData,
    publishDataset: publishCurrentDatasetToDrive, publication: drivePublication, googleDrivePublishAuth };
}
