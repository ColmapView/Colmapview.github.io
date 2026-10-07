import { useReconstructionStore } from '../../store';
import { getShareSource } from './panels/sharePanelViewModel';

/** The remote source another host can reopen; local drops have neither a URL nor a manifest. */
export function useGoogleDrivePublishButtonStoreFacade() {
  const sourceUrl = useReconstructionStore(state => state.sourceUrl);
  const sourceManifest = useReconstructionStore(state => state.sourceManifest);
  return { handoffSource: getShareSource(sourceUrl, sourceManifest) };
}
