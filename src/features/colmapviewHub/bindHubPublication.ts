import type { PublicationAssetSummary } from '../datasetPublishing/types';
import type { HubPublication } from './publication';
import { useDeletionStore, useReconstructionStore } from '../../store';
import { getPublicationSourceKey } from '../datasetPublishing/publicationSnapshot';

export interface CompletedUpload { viewerUrl: string; assets?: PublicationAssetSummary }
interface UploadController<S> { getSnapshot(): S; subscribe(listener: () => void): () => void }

/**
 * Commits the Hub draft when an upload starts, finishes the Hub link when it completes, and warns before
 * leaving while the upload or its Hub link still needs the tab.
 */
export function bindHubPublication<S>(controller: UploadController<S>, hub: HubPublication,
  select: (snapshot: S) => { uploading: boolean; completed?: CompletedUpload }): () => void {
  let uploading = select(controller.getSnapshot()).uploading;
  const unsubscribe = controller.subscribe(() => {
    const current = select(controller.getSnapshot());
    // A prepared draft replaces the previous link only once its upload is under way.
    if (current.uploading && !uploading) hub.commit();
    uploading = current.uploading;
    if (current.completed) void hub.finish(current.completed.viewerUrl, current.completed.assets);
  });
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!select(controller.getSnapshot()).uploading && !hub.blocksUnload()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', beforeUnload);
  return () => { unsubscribe(); window.removeEventListener('beforeunload', beforeUnload); };
}

/**
 * Calls `onChange` with 'dataset' when another dataset loads, and with 'edit' when the model is edited or
 * deletions are marked, so each upload runtime can stop or clear work made for the previous state.
 */
export function onPublicationSourceChange(onChange: (change: 'dataset' | 'edit') => void): () => void {
  let sourceKey = getPublicationSourceKey();
  let revision = useReconstructionStore.getState().reconstructionEditRevision;
  const unsubscribeModel = useReconstructionStore.subscribe(state => {
    const nextKey = getPublicationSourceKey(state);
    if (nextKey === sourceKey && state.reconstructionEditRevision === revision) return;
    const change = nextKey !== sourceKey ? 'dataset' : 'edit';
    sourceKey = nextKey;
    revision = state.reconstructionEditRevision;
    onChange(change);
  });
  const unsubscribeDeletions = useDeletionStore.subscribe(state => { if (state.pendingDeletions.size) onChange('edit'); });
  return () => { unsubscribeModel(); unsubscribeDeletions(); };
}
