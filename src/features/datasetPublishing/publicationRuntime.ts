import { useReconstructionStore, usePublicationStatusStore } from '../../store';
import { hfAuth } from '../huggingface/auth';
import { createHubClient } from '../huggingface/hubClient';
import { HfError } from '../huggingface/http';
import { preparePublication } from './preparePublication';
import { assertPublicationInputCurrent, capturePublicationInput, getPublicationSourceKey } from './publicationSnapshot';
export { capturePublicationInput, getPublicationSourceKey } from './publicationSnapshot';
import { createPublicationController, isPublishing } from './publishDataset';
import type { PublicationDetails } from './types';
import { createPublicationVerifier } from './publicationVerification';

const client = createHubClient(username => hfAuth.getAccessToken(username));
export const publication = createPublicationController(client, createPublicationVerifier(client));
const unsubscribeStatus = publication.subscribe(() => usePublicationStatusStore.setState({ phase: publication.getSnapshot().phase }));
let activeSourceKey = getPublicationSourceKey();
const unsubscribe = useReconstructionStore.subscribe(() => {
  const sourceKey = getPublicationSourceKey();
  if (sourceKey !== activeSourceKey) { activeSourceKey = sourceKey; publication.invalidate(); }
});
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (isPublishing(publication.getSnapshot().phase)) { event.preventDefault(); event.returnValue = ''; }
};
window.addEventListener('beforeunload', beforeUnload);
if (import.meta.hot) import.meta.hot.dispose(() => { unsubscribe(); unsubscribeStatus(); window.removeEventListener('beforeunload', beforeUnload); publication.cancel(); hfAuth.disconnect(); });

export function publishCurrentDataset(username: string, details: PublicationDetails, preview: File): Promise<void> {
  return publication.publish(username, details, async (signal, progress) => {
    const input = capturePublicationInput();
    if (!preview) throw new HfError('Choose a preview image before publishing.');
    input.preview = preview;
    return preparePublication(input, signal, { progress, resolveRevision: client.resolveRevision,
      listFiles: (repoId, revision, path, listSignal) => client.files(repoId, revision, listSignal, path),
      assertCurrent: () => assertPublicationInputCurrent(input) });
  });
}
