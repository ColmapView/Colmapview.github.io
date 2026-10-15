import { useMemo, useSyncExternalStore } from 'react';
import { useReconstructionStore, useDeletionStore, useExportStore } from '../../store';
import { applyDeletionsToData } from '../../store/actions/deletionActions';
import { googleDriveAuth } from '../../features/googleDrive/auth';
import { drivePublication, publishCurrentDatasetToDrive } from '../../features/googleDrive/publicationRuntime';
import { getPublicationSourceKey, publicationDatasetName } from '../../features/datasetPublishing/publicationSnapshot';

export function useGoogleDrivePublishStoreFacade() {
  const reconstruction = useReconstructionStore(state => state.reconstruction);
  const sourceKey = useReconstructionStore(getPublicationSourceKey);
  const manifestName = useReconstructionStore(state => state.sourceManifest?.name);
  const sourceName = useReconstructionStore(state => state.sourceName);
  const sourceUrl = useReconstructionStore(state => state.sourceUrl);
  const datasetName = useMemo(() => publicationDatasetName(manifestName, sourceName, sourceUrl), [manifestName, sourceName, sourceUrl]);
  const getScreenshotBlob = useExportStore(state => state.getScreenshotBlob);
  const pendingDeletions = useDeletionStore(state => state.pendingDeletions.size);
  const auth = useSyncExternalStore(googleDriveAuth.subscribe, googleDriveAuth.getSnapshot);
  const publish = useSyncExternalStore(drivePublication.subscribe, drivePublication.getSnapshot);
  return { reconstruction, sourceKey, datasetName, getScreenshotBlob, pendingDeletions, auth, publish, applyDeletionsToData,
    publishDataset: publishCurrentDatasetToDrive, publication: drivePublication, googleDriveAuth };
}
