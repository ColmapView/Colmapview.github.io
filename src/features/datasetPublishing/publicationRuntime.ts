import { useDeletionStore, useReconstructionStore, usePublicationStatusStore } from '../../store';
import { hfAuth } from '../huggingface/auth';
import { createHubClient } from '../huggingface/hubClient';
import { HfError } from '../huggingface/http';
import { prepareTransferPublication } from './prepareTransferPublication';
import { assertPublicationInputCurrent, captureCurrentView, capturePublicationInput, getHubSource, getPublicationSourceKey } from './publicationSnapshot';
export { getPublicationSourceKey } from './publicationSnapshot';
import { createPublicationController, isPublishing } from './publishDataset';
import type { PublicationDetails } from './types';
import { createPublicationVerifier } from './publicationVerification';
import { publicationLicenseInfo } from './publicationMetadata';
import { hubPublications } from '../colmapviewHub/publication';
import { bindHubPublication } from '../colmapviewHub/bindHubPublication';

const client = createHubClient(username => hfAuth.getAccessToken(username));
export const publication = createPublicationController(client, createPublicationVerifier(client));
publication.subscribe(() => usePublicationStatusStore.setState({ phase: publication.getSnapshot().phase }));
bindHubPublication(publication, hubPublications.huggingFace, current => ({
  uploading: isPublishing(current.phase),
  completed: current.phase === 'completed' && current.receipt ? { viewerUrl: current.receipt.viewerUrl, assets: current.receipt.assets } : undefined,
}));
let activeSourceKey = getPublicationSourceKey();
let editRevision = useReconstructionStore.getState().reconstructionEditRevision;
/** An edit or deletion mark makes a finished result stale, while the Hub link stays in Previous upload. A running upload is left alone. */
const clearFinishedResult = () => { if (publication.getSnapshot().phase === 'completed') publication.reset(); };
useReconstructionStore.subscribe(state => {
  const sourceKey = getPublicationSourceKey(state);
  if (sourceKey !== activeSourceKey) {
    activeSourceKey = sourceKey; editRevision = state.reconstructionEditRevision; publication.invalidate();
  } else if (state.reconstructionEditRevision !== editRevision) {
    editRevision = state.reconstructionEditRevision; clearFinishedResult();
  }
});
useDeletionStore.subscribe(state => { if (state.pendingDeletions.size) clearFinishedResult(); });

export function publishCurrentDataset(username: string, details: PublicationDetails, preview: File): Promise<void> {
  hubPublications.huggingFace.prepare({ title: details.title, description: details.description, license: publicationLicenseInfo(details) },
    { access: details.visibility === 'public' ? 'public' : 'private', preview, capture: captureCurrentView, source: getHubSource() });
  return publication.publish(username, details, async (signal, progress) => {
    const input = capturePublicationInput();
    if (!preview) throw new HfError('Choose a preview image before publishing.');
    input.preview = preview;
    const assertCurrent = () => assertPublicationInputCurrent(input);
    return prepareTransferPublication(input, signal, progress, assertCurrent,
      { format: details.format, repositorySidecars: true, imageFormat: details.imageFormat });
  });
}
