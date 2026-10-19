import { useDrivePublicationStatus } from '../../store';
import { assertPublicationInputCurrent, captureCurrentView, capturePublicationInput, getHubSource } from '../datasetPublishing/publicationSnapshot';
import { googleDriveAuth } from './auth';
import { createDriveUploadClient } from './upload';
import { createDrivePublicationController, isDrivePublishing } from './publishDataset';
import { prepareDriveArchive } from './prepareArchive';
import { ARCHIVE_SIZE_LIMIT } from '../../utils/zipValidation';
import type { PublicationImageFormat } from '../datasetPublishing/types';
import { hubPublications } from '../colmapviewHub/publication';
import { bindHubPublication, onPublicationSourceChange } from '../colmapviewHub/bindHubPublication';

export const drivePublication = createDrivePublicationController(createDriveUploadClient({
  getAccessToken: googleDriveAuth.ensureAccessToken, expireSession: googleDriveAuth.expire,
}));
drivePublication.subscribe(() => useDrivePublicationStatus.setState({ active: drivePublication.getSnapshot().phase !== 'idle' }));
bindHubPublication(drivePublication, hubPublications.googleDrive, current => ({
  uploading: isDrivePublishing(current.phase),
  completed: current.phase === 'completed' && current.receipt ? { viewerUrl: current.receipt.viewerUrl, assets: current.receipt.assets } : undefined,
}));
onPublicationSourceChange(change => drivePublication.invalidate(change));

export function publishCurrentDatasetToDrive(name: string, shared: boolean, imageFormat: PublicationImageFormat = 'original', preview: File | null = null): Promise<void> {
  const input = capturePublicationInput();
  const assertCurrent = () => assertPublicationInputCurrent(input);
  // The controller checks the name; the card title is the name without the ".zip" it appends.
  return hubPublications.googleDrive.prepare({ title: name.trim().replace(/\.zip$/i, '') || 'Dataset' },
    { access: shared ? 'public' : 'private', preview, capture: captureCurrentView, source: getHubSource() },
    () => drivePublication.publish(name, shared,
      (signal, progress) => prepareDriveArchive(input, signal, progress, assertCurrent, ARCHIVE_SIZE_LIMIT, imageFormat), assertCurrent));
}
