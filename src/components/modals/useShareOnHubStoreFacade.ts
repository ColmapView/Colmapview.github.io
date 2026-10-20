import { useCameraStore, useDeletionStore, useExportStore, useReconstructionStore } from '../../store';
import { getHubSource } from '../../features/datasetPublishing/publicationSnapshot';
import { getPublicationDatasetName } from '../../features/datasetPublishing/publicationDatasetName';

/** Select a primitive so snapshot identity stays stable across renders. */
export function useShareOnHubSourceKey() {
  return useReconstructionStore(state => getHubSource(state).key);
}

const getCurrentView = () => useCameraStore.getState().currentViewState;

export function useShareOnHubStoreFacade() {
  const sourceKey = useShareOnHubSourceKey();
  const sourceUrl = useReconstructionStore(state => state.sourceUrl);
  const sourceName = useReconstructionStore(getPublicationDatasetName);
  const revision = useReconstructionStore(state => state.reconstructionEditRevision);
  const pending = useDeletionStore(state => state.pendingDeletions.size);
  const getScreenshot = useExportStore(state => state.getScreenshotBlob);
  return { source: { key: sourceKey, revision }, sourceUrl, sourceName, pending, getScreenshot, getCurrentView };
}
