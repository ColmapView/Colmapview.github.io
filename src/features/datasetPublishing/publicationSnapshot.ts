import { useReconstructionStore, useTransformStore, useCameraStore, useDeletionStore } from '../../store';
import { isReconstructionSnapshot } from '../../wasm/reconstructionService';
import { collectShareConfig } from '../../hooks/useUrlState';
import { getPublicationViewerBaseUrl } from './publicationMetadata';
import { getActiveSplatSourceId } from '../../utils/splatFileSourcePolicy';
import { getZipImageGeneration } from '../../utils/zipImageFiles';
import { HfError } from '../huggingface/http';
import type { PublicationInput } from './preparePublication';

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
  return {
    sourceKey: getPublicationSourceKey(), modelRevision: state.reconstructionEditRevision,
    reconstruction: state.reconstruction, source: state.wasmReconstruction,
    dataset: { sourceType: state.sourceType, loadedFiles: state.loadedFiles, imageUrlBase: state.imageUrlBase,
      maskUrlBase: state.maskUrlBase, imageNameToUrl: state.imageNameToUrl },
    transform: { ...transform.transform }, splatTransform: { ...transform.splatTransform },
    config: collectShareConfig(), viewState: structuredClone(useCameraStore.getState().currentViewState),
    activeSplatId: getActiveSplatSourceId(state.loadedFiles), appVersion: __APP_VERSION__,
    viewerBaseUrl: getPublicationViewerBaseUrl(window.location),
  };
}

export function assertPublicationInputCurrent(input: PublicationInput): void {
  const current = useReconstructionStore.getState();
  if (getPublicationSourceKey() !== input.sourceKey || current.reconstruction !== input.reconstruction
    || current.reconstructionEditRevision !== input.modelRevision || useDeletionStore.getState().pendingDeletions.size) {
    throw new HfError('The reconstruction changed while preparing. Publish again.');
  }
}
