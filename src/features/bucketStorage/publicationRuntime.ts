import { useReconstructionStore, useDeletionStore } from '../../store';
import { assertPublicationInputCurrent, capturePublicationInput, getPublicationSourceKey } from '../datasetPublishing/publicationSnapshot';
import { prepareTransferPublication } from '../datasetPublishing/prepareTransferPublication';
import { bucketConnection } from './connection';
import { createBucketPublicationController, isBucketPublishing } from './publishDataset';
import { BucketError } from './types';

export const bucketPublication = createBucketPublicationController();
let sourceKey = getPublicationSourceKey();
let modelRevision = useReconstructionStore.getState().reconstructionEditRevision;
const reconstruction = useReconstructionStore.subscribe(state => {
  const key = getPublicationSourceKey(state);
  if (key !== sourceKey || state.reconstructionEditRevision !== modelRevision) {
    sourceKey = key; modelRevision = state.reconstructionEditRevision; bucketPublication.invalidate();
  }
});
const deletions = useDeletionStore.subscribe(state => { if (state.pendingDeletions.size) bucketPublication.invalidate(); });
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (isBucketPublishing(bucketPublication.getSnapshot().phase)) { event.preventDefault(); event.returnValue = ''; }
};
window.addEventListener('beforeunload', beforeUnload);
if (import.meta.hot) import.meta.hot.dispose(() => {
  reconstruction(); deletions(); window.removeEventListener('beforeunload', beforeUnload);
  bucketPublication.cancel();
});

export function publishCurrentDatasetToBucket(folder: string): Promise<void> {
  const session = bucketConnection.getSession();
  if (!session) throw new BucketError('Connect to a bucket before uploading.');
  const input = capturePublicationInput();
  const assertCurrent = () => assertPublicationInputCurrent(input);
  return bucketPublication.publish(session, folder,
    (signal, progress) => prepareTransferPublication(input, signal, progress, assertCurrent), assertCurrent);
}
