import { useReconstructionStore, useDeletionStore } from '../../store';
import { assertPublicationInputCurrent, capturePublicationInput, getPublicationSourceKey } from '../datasetPublishing/publicationSnapshot';
import { prepareTransferPublication } from '../datasetPublishing/prepareTransferPublication';
import type { PublicationFormat, PublicationImageFormat } from '../datasetPublishing/types';
import { bucketConnection } from './connection';
import { createBucketPublicationController, isBucketPublishing } from './publishDataset';
import { BucketError } from './types';
import { hubPublications, type HubPublicationOptions } from '../colmapviewHub/publication';

export const bucketPublication = createBucketPublicationController();
const hubStatus = bucketPublication.subscribe(() => {
  const current = bucketPublication.getSnapshot();
  if (current.phase === 'completed' && current.viewerUrl) void hubPublications.bucket.finish(current.viewerUrl);
});
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
  if (isBucketPublishing(bucketPublication.getSnapshot().phase) || hubPublications.bucket.getSnapshot().phase === 'creating') { event.preventDefault(); event.returnValue = ''; }
};
window.addEventListener('beforeunload', beforeUnload);
if (import.meta.hot) import.meta.hot.dispose(() => {
  reconstruction(); deletions(); hubStatus(); window.removeEventListener('beforeunload', beforeUnload);
  bucketPublication.cancel();
});

export function publishCurrentDatasetToBucket(folder: string, format: PublicationFormat = 'folder', imageFormat: PublicationImageFormat = 'original', hub?: HubPublicationOptions): Promise<void> {
  if (imageFormat === 'jpeg' && format !== 'zip') throw new BucketError('JPEG image conversion requires ZIP archive format.');
  const session = bucketConnection.getSession();
  if (!session) throw new BucketError('Connect to a bucket before uploading.');
  const input = capturePublicationInput();
  hubPublications.bucket.prepare({ title: folder.split('/').filter(Boolean).at(-1) || 'Dataset',
    description: `${input.reconstruction.images.size} images` }, { listed: hub?.listed ?? false, preview: hub?.preview });
  const assertCurrent = () => assertPublicationInputCurrent(input);
  return bucketPublication.publish(session, folder,
    (signal, progress) => prepareTransferPublication(input, signal, progress, assertCurrent, { format, imageFormat }), assertCurrent);
}
