import { assertPublicationInputCurrent, captureCurrentView, capturePublicationInput, getHubSource } from '../datasetPublishing/publicationSnapshot';
import { prepareTransferPublication } from '../datasetPublishing/prepareTransferPublication';
import type { PublicationFormat, PublicationImageFormat } from '../datasetPublishing/types';
import { bucketConnection } from './connection';
import { createBucketPublicationController, isBucketPublishing } from './publishDataset';
import { BucketError } from './types';
import { hubPublications } from '../colmapviewHub/publication';
import { bindHubPublication, onPublicationSourceChange } from '../colmapviewHub/bindHubPublication';

export const bucketPublication = createBucketPublicationController();
bindHubPublication(bucketPublication, hubPublications.bucket, current => ({
  uploading: isBucketPublishing(current.phase),
  completed: current.phase === 'completed' && current.viewerUrl ? { viewerUrl: current.viewerUrl, assets: current.assets } : undefined,
}));
onPublicationSourceChange(() => bucketPublication.invalidate());

export function publishCurrentDatasetToBucket(folder: string, format: PublicationFormat = 'folder', imageFormat: PublicationImageFormat = 'original',
  preview: File | null = null): Promise<void> {
  if (imageFormat === 'jpeg' && format !== 'zip') throw new BucketError('JPEG image conversion requires ZIP archive format.');
  const session = bucketConnection.getSession();
  if (!session) throw new BucketError('Connect to a bucket before uploading.');
  const input = capturePublicationInput();
  const assertCurrent = () => assertPublicationInputCurrent(input);
  // The controller checks the folder and write access; the card title is the folder's last segment.
  return hubPublications.bucket.prepare({ title: folder.trim().split('/').filter(Boolean).at(-1) || 'Dataset' },
    { access: 'check', preview, capture: captureCurrentView, source: getHubSource() },
    () => bucketPublication.publish(session, folder,
      (signal, progress) => prepareTransferPublication(input, signal, progress, assertCurrent, { format, imageFormat }), assertCurrent));
}
