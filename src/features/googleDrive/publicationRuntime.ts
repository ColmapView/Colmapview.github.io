import { useReconstructionStore, useDeletionStore, useDrivePublicationStatus } from '../../store';
import { assertPublicationInputCurrent, captureCurrentView, capturePublicationInput, getHubSource, getPublicationSourceKey } from '../datasetPublishing/publicationSnapshot';
import { googleDriveAuth } from './auth';
import { createDriveUploadClient } from './upload';
import { createDrivePublicationController, isDrivePublishing, normalizeDriveArchiveName } from './publishDataset';
import { prepareDriveArchive } from './prepareArchive';
import { ARCHIVE_SIZE_LIMIT } from '../../utils/zipValidation';
import type { PublicationImageFormat } from '../datasetPublishing/types';
import { hubPublications } from '../colmapviewHub/publication';
import { bindHubPublication } from '../colmapviewHub/bindHubPublication';

export const drivePublication = createDrivePublicationController(createDriveUploadClient({
  getAccessToken: googleDriveAuth.getAccessToken, expireSession: googleDriveAuth.expire,
}));
drivePublication.subscribe(() => useDrivePublicationStatus.setState({ active: drivePublication.getSnapshot().phase !== 'idle' }));
bindHubPublication(drivePublication, hubPublications.googleDrive, current => ({
  uploading: isDrivePublishing(current.phase),
  completed: current.phase === 'completed' && current.receipt ? { viewerUrl: current.receipt.viewerUrl, assets: current.receipt.assets } : undefined,
}));
let sourceKey = getPublicationSourceKey();
let modelRevision = useReconstructionStore.getState().reconstructionEditRevision;
useReconstructionStore.subscribe(state => {
  const nextKey = getPublicationSourceKey(state);
  if (nextKey !== sourceKey || state.reconstructionEditRevision !== modelRevision) {
    const change = nextKey !== sourceKey ? 'dataset' : 'edit';
    sourceKey = nextKey; modelRevision = state.reconstructionEditRevision; drivePublication.invalidate(change);
  }
});
useDeletionStore.subscribe(state => { if (state.pendingDeletions.size) drivePublication.invalidate('edit'); });

export function publishCurrentDatasetToDrive(name: string, shared: boolean, imageFormat: PublicationImageFormat = 'original', preview: File | null = null): Promise<void> {
  // Check the name before preparing the Hub, so a typo keeps the previous upload's link.
  const archiveName = normalizeDriveArchiveName(name);
  const input = capturePublicationInput();
  hubPublications.googleDrive.prepare({ title: archiveName.replace(/\.zip$/i, '') || 'Dataset' },
    { access: shared ? 'public' : 'private', preview, capture: captureCurrentView, source: getHubSource() });
  const assertCurrent = () => assertPublicationInputCurrent(input);
  return drivePublication.publish(name, shared,
    (signal, progress) => prepareDriveArchive(input, signal, progress, assertCurrent, ARCHIVE_SIZE_LIMIT, imageFormat), assertCurrent);
}
