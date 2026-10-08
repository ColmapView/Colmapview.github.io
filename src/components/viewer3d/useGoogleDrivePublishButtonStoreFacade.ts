import { useReconstructionStore, useDrivePublicationStatus } from '../../store';
import { getShareSource } from './panels/sharePanelViewModel';

/** The remote source another host can reopen (local drops have neither a URL nor a manifest), and the Drive job's activity. */
export function useGoogleDrivePublishButtonStoreFacade() {
  const sourceUrl = useReconstructionStore(state => state.sourceUrl);
  const sourceManifest = useReconstructionStore(state => state.sourceManifest);
  const publicationActive = useDrivePublicationStatus(state => state.active);
  return { handoffSource: getShareSource(sourceUrl, sourceManifest), publicationActive };
}
