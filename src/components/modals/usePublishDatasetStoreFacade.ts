import { useSyncExternalStore } from 'react';
import { useReconstructionStore, useDeletionStore, useExportStore } from '../../store';
import { applyDeletionsToData } from '../../store/actions/deletionActions';
import { hfAuth } from '../../features/huggingface/auth';
import { publication, publishCurrentDataset, getPublicationSourceKey } from '../../features/datasetPublishing/publicationRuntime';

export function usePublishDatasetStoreFacade() {
  const reconstruction = useReconstructionStore(state => state.reconstruction);
  const sourceKey = useReconstructionStore(getPublicationSourceKey);
  const pendingDeletions = useDeletionStore(state => state.pendingDeletions.size);
  const getScreenshotBlob = useExportStore(state => state.getScreenshotBlob);
  const auth = useSyncExternalStore(hfAuth.subscribe, hfAuth.getSnapshot);
  const publish = useSyncExternalStore(publication.subscribe, publication.getSnapshot);
  return { reconstruction, pendingDeletions, auth, publish, getScreenshotBlob, sourceKey,
    applyDeletionsToData, publishDataset: publishCurrentDataset, publication, hfAuth };
}
