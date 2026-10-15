import { useReconstructionStore, useDeletionStore } from '../../store';
import { assertPublicationInputCurrent, captureCurrentView, capturePublicationInput, getHubSource, getPublicationSourceKey } from '../datasetPublishing/publicationSnapshot';
import { prepareTransferPublication } from '../datasetPublishing/prepareTransferPublication';
import type { PublicationFormat, PublicationImageFormat } from '../datasetPublishing/types';
import { bucketConnection } from './connection';
import { createBucketPublicationController, isBucketPublishing } from './publishDataset';
import { BucketError } from './types';
import { bucketFolder } from './paths';
import { hubPublications } from '../colmapviewHub/publication';
import { bindHubPublication } from '../colmapviewHub/bindHubPublication';

export const bucketPublication = createBucketPublicationController();
bindHubPublication(bucketPublication, hubPublications.bucket, current => ({
  uploading: isBucketPublishing(current.phase),
  completed: current.phase === 'completed' && current.viewerUrl ? { viewerUrl: current.viewerUrl, assets: current.assets } : undefined,
}));
let sourceKey = getPublicationSourceKey();
let modelRevision = useReconstructionStore.getState().reconstructionEditRevision;
useReconstructionStore.subscribe(state => {
  const key = getPublicationSourceKey(state);
  if (key !== sourceKey || state.reconstructionEditRevision !== modelRevision) {
    sourceKey = key; modelRevision = state.reconstructionEditRevision; bucketPublication.invalidate();
  }
});
useDeletionStore.subscribe(state => { if (state.pendingDeletions.size) bucketPublication.invalidate(); });

export function publishCurrentDatasetToBucket(folder: string, format: PublicationFormat = 'folder', imageFormat: PublicationImageFormat = 'original',
  preview: File | null = null): Promise<void> {
  if (imageFormat === 'jpeg' && format !== 'zip') throw new BucketError('JPEG image conversion requires ZIP archive format.');
  const session = bucketConnection.getSession();
  if (!session) throw new BucketError('Connect to a bucket before uploading.');
  // Check the input before preparing the Hub, so a typo keeps the previous upload's link.
  if (!session.canWrite) throw new BucketError('Connect with an access key and secret to upload.');
  const destination = bucketFolder(folder);
  const input = capturePublicationInput();
  hubPublications.bucket.prepare({ title: destination.split('/').filter(Boolean).at(-1) || 'Dataset' },
    { access: 'check', preview, capture: captureCurrentView, source: getHubSource() });
  const assertCurrent = () => assertPublicationInputCurrent(input);
  return bucketPublication.publish(session, folder,
    (signal, progress) => prepareTransferPublication(input, signal, progress, assertCurrent, { format, imageFormat }), assertCurrent);
}
