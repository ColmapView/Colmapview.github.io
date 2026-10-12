import { useSyncExternalStore } from 'react';
import { useReconstructionStore, useDeletionStore, useExportStore } from '../../store';
import { applyDeletionsToData } from '../../store/actions/deletionActions';
import { getPublicationSourceKey } from '../../features/datasetPublishing/publicationSnapshot';
import { bucketConnection } from '../../features/bucketStorage/connection';
import { bucketPublication, publishCurrentDatasetToBucket } from '../../features/bucketStorage/publicationRuntime';

export function useBucketPublishStoreFacade() {
  const reconstruction = useReconstructionStore(state => state.reconstruction);
  const sourceKey = useReconstructionStore(getPublicationSourceKey);
  const pendingDeletions = useDeletionStore(state => state.pendingDeletions.size);
  const getScreenshotBlob = useExportStore(state => state.getScreenshotBlob);
  const connection = useSyncExternalStore(bucketConnection.subscribe, bucketConnection.getSnapshot);
  const publication = useSyncExternalStore(bucketPublication.subscribe, bucketPublication.getSnapshot);
  return { canPublish: Boolean(reconstruction?.cameras.size) && pendingDeletions === 0, reconstruction, pendingDeletions,
    sourceKey, getScreenshotBlob, applyDeletionsToData, connection, publication, bucketConnection, bucketPublication,
    publishDataset: publishCurrentDatasetToBucket };
}
