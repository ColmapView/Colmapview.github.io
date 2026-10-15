import { useMemo, useSyncExternalStore } from 'react';
import { useReconstructionStore, useDeletionStore, useExportStore } from '../../store';
import { applyDeletionsToData } from '../../store/actions/deletionActions';
import { getPublicationSourceKey, publicationDatasetName } from '../../features/datasetPublishing/publicationSnapshot';
import { bucketConnection } from '../../features/bucketStorage/connection';
import { bucketPublication, publishCurrentDatasetToBucket } from '../../features/bucketStorage/publicationRuntime';

export function useBucketPublishStoreFacade() {
  const reconstruction = useReconstructionStore(state => state.reconstruction);
  const sourceKey = useReconstructionStore(getPublicationSourceKey);
  const manifestName = useReconstructionStore(state => state.sourceManifest?.name);
  const sourceName = useReconstructionStore(state => state.sourceName);
  const sourceUrl = useReconstructionStore(state => state.sourceUrl);
  const datasetName = useMemo(() => publicationDatasetName(manifestName, sourceName, sourceUrl), [manifestName, sourceName, sourceUrl]);
  const pendingDeletions = useDeletionStore(state => state.pendingDeletions.size);
  const getScreenshotBlob = useExportStore(state => state.getScreenshotBlob);
  const connection = useSyncExternalStore(bucketConnection.subscribe, bucketConnection.getSnapshot);
  const publication = useSyncExternalStore(bucketPublication.subscribe, bucketPublication.getSnapshot);
  return { canPublish: Boolean(reconstruction?.cameras.size) && pendingDeletions === 0, reconstruction, pendingDeletions,
    sourceKey, datasetName, getScreenshotBlob, applyDeletionsToData, connection, publication, bucketConnection, bucketPublication,
    publishDataset: publishCurrentDatasetToBucket };
}
