import type { PublicationAssetSummary } from '../datasetPublishing/types';
import type { HubPublication } from './publication';

export interface CompletedUpload { viewerUrl: string; assets?: PublicationAssetSummary }
interface UploadController<S> { getSnapshot(): S; subscribe(listener: () => void): () => void }

/** Finishes the Hub link when an upload completes, and warns before leaving while the upload or its Hub link still needs the tab. */
export function bindHubPublication<S>(controller: UploadController<S>, hub: HubPublication,
  select: (snapshot: S) => { uploading: boolean; completed?: CompletedUpload }): () => void {
  const unsubscribe = controller.subscribe(() => {
    const { completed } = select(controller.getSnapshot());
    if (completed) void hub.finish(completed.viewerUrl, completed.assets);
  });
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!select(controller.getSnapshot()).uploading && !hub.blocksUnload()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', beforeUnload);
  return () => { unsubscribe(); window.removeEventListener('beforeunload', beforeUnload); };
}
