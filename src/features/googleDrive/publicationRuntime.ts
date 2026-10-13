import { useReconstructionStore, useDeletionStore, useDrivePublicationStatus } from '../../store';
import { assertPublicationInputCurrent, capturePublicationInput, getPublicationSourceKey } from '../datasetPublishing/publicationSnapshot';
import { googleDriveAuth } from './auth';
import { createDriveUploadClient } from './upload';
import { createDrivePublicationController, isDrivePublishing } from './publishDataset';
import { prepareDriveArchive } from './prepareArchive';
import { ARCHIVE_SIZE_LIMIT } from '../../utils/zipValidation';
import type { PublicationImageFormat } from '../datasetPublishing/types';
import { hubPublications, type HubPublicationOptions } from '../colmapviewHub/publication';

export const drivePublication = createDrivePublicationController(createDriveUploadClient({
  getAccessToken: googleDriveAuth.getAccessToken, expireSession: googleDriveAuth.expire,
}));
const status = drivePublication.subscribe(() => useDrivePublicationStatus.setState({ active: drivePublication.getSnapshot().phase !== 'idle' }));
const hubStatus = drivePublication.subscribe(() => {
  const current = drivePublication.getSnapshot();
  if (current.phase === 'completed' && current.receipt?.shared) void hubPublications.googleDrive.finish(current.receipt.viewerUrl, current.receipt.assets);
});
let sourceKey = getPublicationSourceKey();
let modelRevision = useReconstructionStore.getState().reconstructionEditRevision;
const reconstruction = useReconstructionStore.subscribe(state => {
  const nextKey = getPublicationSourceKey(state);
  if (nextKey !== sourceKey || state.reconstructionEditRevision !== modelRevision) {
    const change = nextKey !== sourceKey ? 'dataset' : 'edit';
    sourceKey = nextKey; modelRevision = state.reconstructionEditRevision; drivePublication.invalidate(change);
  }
});
const deletions = useDeletionStore.subscribe(state => { if (state.pendingDeletions.size) drivePublication.invalidate('edit'); });
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (isDrivePublishing(drivePublication.getSnapshot().phase) || hubPublications.googleDrive.getSnapshot().phase === 'creating') { event.preventDefault(); event.returnValue = ''; }
};
window.addEventListener('beforeunload', beforeUnload);
if (import.meta.hot) import.meta.hot.dispose(() => {
  status(); hubStatus(); reconstruction(); deletions(); window.removeEventListener('beforeunload', beforeUnload);
  drivePublication.cancel();
});

export function publishCurrentDatasetToDrive(name: string, shared: boolean, imageFormat: PublicationImageFormat = 'original', hub?: HubPublicationOptions): Promise<void> {
  const input = capturePublicationInput();
  hubPublications.googleDrive.prepare({ title: name.trim().replace(/\.zip$/i, '') || 'Dataset',
    description: `${input.reconstruction.images.size} images` }, shared ? { listed: hub?.listed ?? false, preview: hub?.preview } : undefined);
  const assertCurrent = () => assertPublicationInputCurrent(input);
  return drivePublication.publish(name, shared,
    (signal, progress) => prepareDriveArchive(input, signal, progress, assertCurrent, ARCHIVE_SIZE_LIMIT, imageFormat), assertCurrent);
}
