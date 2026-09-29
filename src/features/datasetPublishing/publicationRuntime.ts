import { useReconstructionStore, useTransformStore, useCameraStore, useDeletionStore, usePublicationStatusStore } from '../../store';
import { isReconstructionSnapshot } from '../../wasm/reconstructionService';
import { collectShareConfig } from '../../hooks/useUrlState';
import { getShareBaseUrl } from '../../utils/shareUrl';
import { getActiveSplatSourceId } from '../../utils/splatFileSourcePolicy';
import { getZipImageGeneration } from '../../utils/zipImageFiles';
import { hfAuth } from '../huggingface/auth';
import { createHubClient } from '../huggingface/hubClient';
import { HfError } from '../huggingface/http';
import { preparePublication, type PublicationInput } from './preparePublication';
import { createPublicationController, isPublishing } from './publishDataset';
import type { PublicationDetails } from './types';
import { createPublicationVerifier } from './publicationVerification';

const identities = new WeakMap<object, number>();
let nextIdentity = 0;
export function getPublicationSourceKey(state = useReconstructionStore.getState()): string {
  if (!state.reconstruction) return '';
  const identity = isReconstructionSnapshot(state.wasmReconstruction) ? state.wasmReconstruction.service
    : state.loadedFiles?.camerasFile ?? state.reconstruction;
  if (!identities.has(identity)) identities.set(identity, ++nextIdentity);
  return `${identities.get(identity)}:${state.sourceType}:${state.sourceUrl ?? ''}:${state.sourceType === 'zip' ? getZipImageGeneration() : ''}`;
}

export function capturePublicationInput(): PublicationInput {
  const state = useReconstructionStore.getState();
  const transform = useTransformStore.getState();
  if (!state.reconstruction || (!state.reconstruction.cameras.size && !state.loadedFiles?.camerasFile)) throw new HfError('Load a COLMAP reconstruction before publishing. Splat-only publication is not supported yet.');
  if (useDeletionStore.getState().pendingDeletions.size) throw new HfError('Apply or clear pending deletions before publishing.');
  const viewerBaseUrl = window.location.hostname === 'colmapview.github.io' && window.location.pathname.startsWith('/dev/')
    ? window.location.origin + '/dev/' : getShareBaseUrl(window.location, __APP_VERSION__);
  return {
    sourceKey: getPublicationSourceKey(), modelRevision: state.reconstructionEditRevision,
    reconstruction: state.reconstruction, source: state.wasmReconstruction,
    dataset: { sourceType: state.sourceType, loadedFiles: state.loadedFiles, imageUrlBase: state.imageUrlBase,
      maskUrlBase: state.maskUrlBase, imageNameToUrl: state.imageNameToUrl },
    transform: { ...transform.transform }, splatTransform: { ...transform.splatTransform },
    config: collectShareConfig(), viewState: structuredClone(useCameraStore.getState().currentViewState),
    activeSplatId: getActiveSplatSourceId(state.loadedFiles), appVersion: __APP_VERSION__, viewerBaseUrl,
  };
}

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
      assertCurrent: () => {
        const current = useReconstructionStore.getState();
        if (getPublicationSourceKey() !== input.sourceKey || current.reconstruction !== input.reconstruction
          || current.reconstructionEditRevision !== input.modelRevision || useDeletionStore.getState().pendingDeletions.size) {
          throw new HfError('The reconstruction changed while preparing. Publish again.');
        }
      } });
  });
}
