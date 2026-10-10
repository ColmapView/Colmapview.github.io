import { useSyncExternalStore } from 'react';
import { useReconstructionStore, useDeletionStore } from '../../store';
import { bucketConnection } from '../../features/bucketStorage/connection';
import { bucketPublication, publishCurrentDatasetToBucket } from '../../features/bucketStorage/publicationRuntime';
import { startupLinkRetry } from '../../appStartupRetry';

export function useBucketStorageStoreFacade() {
  const reconstruction = useReconstructionStore(state => state.reconstruction);
  const pendingDeletions = useDeletionStore(state => state.pendingDeletions.size);
  const connection = useSyncExternalStore(bucketConnection.subscribe, bucketConnection.getSnapshot);
  const publication = useSyncExternalStore(bucketPublication.subscribe, bucketPublication.getSnapshot);
  const retryLink = useSyncExternalStore(startupLinkRetry.subscribe, startupLinkRetry.getSnapshot);
  return { canPublish: Boolean(reconstruction?.cameras.size) && pendingDeletions === 0, pendingDeletions,
    connection, publication, retryLink, bucketConnection, bucketPublication, publishDataset: publishCurrentDatasetToBucket };
}
