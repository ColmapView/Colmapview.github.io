import { useReconstructionStore, usePublicationStatusStore } from '../../store';
import { hfAuth } from '../huggingface/auth';
import { createHubClient } from '../huggingface/hubClient';
import { HfError } from '../huggingface/http';
import { prepareTransferPublication } from './prepareTransferPublication';
import { assertPublicationInputCurrent, capturePublicationInput, getPublicationSourceKey } from './publicationSnapshot';
export { getPublicationSourceKey } from './publicationSnapshot';
import { createPublicationController, isPublishing } from './publishDataset';
import type { PublicationDetails } from './types';
import { createPublicationVerifier } from './publicationVerification';
import { hubPublications, type HubPublicationOptions } from '../colmapviewHub/publication';

const client = createHubClient(username => hfAuth.getAccessToken(username));
export const publication = createPublicationController(client, createPublicationVerifier(client));
const unsubscribeStatus = publication.subscribe(() => usePublicationStatusStore.setState({ phase: publication.getSnapshot().phase }));
const unsubscribeHub = publication.subscribe(() => {
  const current = publication.getSnapshot();
  if (current.phase === 'completed' && current.receipt?.visibility === 'public') void hubPublications.huggingFace.finish(current.receipt.viewerUrl, current.receipt.assets);
});
let activeSourceKey = getPublicationSourceKey();
const unsubscribe = useReconstructionStore.subscribe(() => {
  const sourceKey = getPublicationSourceKey();
  if (sourceKey !== activeSourceKey) { activeSourceKey = sourceKey; publication.invalidate(); }
});
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (isPublishing(publication.getSnapshot().phase) || hubPublications.huggingFace.getSnapshot().phase === 'creating') { event.preventDefault(); event.returnValue = ''; }
};
window.addEventListener('beforeunload', beforeUnload);
if (import.meta.hot) import.meta.hot.dispose(() => { unsubscribe(); unsubscribeStatus(); unsubscribeHub(); window.removeEventListener('beforeunload', beforeUnload); publication.cancel(); hfAuth.disconnect(); });

export function publishCurrentDataset(username: string, details: PublicationDetails, preview: File, hub?: HubPublicationOptions): Promise<void> {
  hubPublications.huggingFace.prepare({ title: details.title, description: details.description,
    ...(details.license ? { license: details.license === 'other'
      ? { name: details.licenseName?.trim().slice(0, 160), url: details.licenseUrl }
      : { id: details.license } } : {}) }, details.visibility === 'public' ? { listed: hub?.listed ?? false, preview: hub?.preview ?? preview } : undefined);
  return publication.publish(username, details, async (signal, progress) => {
    const input = capturePublicationInput();
    if (!preview) throw new HfError('Choose a preview image before publishing.');
    input.preview = preview;
    const assertCurrent = () => assertPublicationInputCurrent(input);
    return prepareTransferPublication(input, signal, progress, assertCurrent,
      { format: details.format, repositorySidecars: true, imageFormat: details.imageFormat });
  });
}
