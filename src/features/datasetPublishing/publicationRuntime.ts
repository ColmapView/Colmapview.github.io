import { usePublicationStatusStore } from '../../store';
import { hfAuth } from '../huggingface/auth';
import { createHubClient } from '../huggingface/hubClient';
import { HfError } from '../huggingface/http';
import { prepareTransferPublication } from './prepareTransferPublication';
import { assertPublicationInputCurrent, captureCurrentView, capturePublicationInput, getHubSource } from './publicationSnapshot';
export { getPublicationSourceKey } from './publicationSnapshot';
import { createPublicationController, isPublishing } from './publishDataset';
import type { PublicationDetails } from './types';
import { createPublicationVerifier } from './publicationVerification';
import { publicationLicenseInfo } from './publicationMetadata';
import { hubPublications } from '../colmapviewHub/publication';
import { bindHubPublication, onPublicationSourceChange } from '../colmapviewHub/bindHubPublication';

const client = createHubClient(username => hfAuth.getAccessToken(username));
export const publication = createPublicationController(client, createPublicationVerifier(client));
publication.subscribe(() => usePublicationStatusStore.setState({ phase: publication.getSnapshot().phase }));
bindHubPublication(publication, hubPublications.huggingFace, current => ({
  uploading: isPublishing(current.phase),
  completed: current.phase === 'completed' && current.receipt ? { viewerUrl: current.receipt.viewerUrl, assets: current.receipt.assets } : undefined,
}));
/**
 * Another dataset stops the upload. An edit or deletion mark only makes a finished result stale, while the
 * Hub link stays in Previous upload; a running upload is left alone.
 */
onPublicationSourceChange(change => {
  if (change === 'dataset') publication.invalidate();
  else if (publication.getSnapshot().phase === 'completed') publication.reset();
});

export function publishCurrentDataset(username: string, details: PublicationDetails, preview: File): Promise<void> {
  return hubPublications.huggingFace.prepare({ title: details.name.trim(), description: details.description, license: publicationLicenseInfo(details) },
    { access: details.visibility === 'public' ? 'public' : 'private', preview, capture: captureCurrentView, source: getHubSource() },
    () => publication.publish(username, details, async (signal, progress) => {
      const input = capturePublicationInput();
      if (!preview) throw new HfError('Choose a preview image before publishing.');
      input.preview = preview;
      const assertCurrent = () => assertPublicationInputCurrent(input);
      return prepareTransferPublication(input, signal, progress, assertCurrent,
        { format: details.format, repositorySidecars: true, imageFormat: details.imageFormat });
    }));
}
