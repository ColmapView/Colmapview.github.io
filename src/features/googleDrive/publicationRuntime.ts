import { useReconstructionStore, useDeletionStore, useDrivePublicationStatus } from '../../store';
import { assertPublicationInputCurrent, capturePublicationInput, getPublicationSourceKey } from '../datasetPublishing/publicationSnapshot';
import { googleDrivePublishAuth } from './auth';
import { createDriveUploadClient } from './upload';
import { createDrivePublicationController, isDrivePublishing } from './publishDataset';
import { prepareDriveArchive } from './prepareArchive';

export const drivePublication = createDrivePublicationController(createDriveUploadClient({
  getAccessToken: googleDrivePublishAuth.getAccessToken, expireSession: googleDrivePublishAuth.expire,
}));
const status = drivePublication.subscribe(() => useDrivePublicationStatus.setState({ active: drivePublication.getSnapshot().phase !== 'idle' }));
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
  if (isDrivePublishing(drivePublication.getSnapshot().phase)) { event.preventDefault(); event.returnValue = ''; }
};
window.addEventListener('beforeunload', beforeUnload);
if (import.meta.hot) import.meta.hot.dispose(() => {
  status(); reconstruction(); deletions(); window.removeEventListener('beforeunload', beforeUnload);
  drivePublication.cancel(); googleDrivePublishAuth.disconnect();
});

export function publishCurrentDatasetToDrive(name: string, shared: boolean): Promise<void> {
  const input = capturePublicationInput();
  const assertCurrent = () => assertPublicationInputCurrent(input);
  return drivePublication.publish(name, shared, (signal, progress) => prepareDriveArchive(input, signal, progress, assertCurrent), assertCurrent);
}
