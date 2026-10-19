import { useEffect, useId, useRef, useState } from 'react';
import { runStartupLoadPlan, type StartupLoaders } from '../../appStartupLoad';
import { getAppStartupLoadPlan } from '../../appStartupPolicy';
import { googleDriveAuth } from '../../features/googleDrive/auth';
import { getGoogleDriveHostingConfig } from '../../features/googleDrive/config';
import { googleDriveOpenWithHandoff, googleDriveOpenWithViewerUrl, parseGoogleDriveOpenWith } from '../../features/googleDrive/openWith';
import { getButtonClass } from '../../theme';
import { AccountDialog } from '../ui/AccountDialog';
import { DatasetAccountDialog } from './DatasetAccountDialog';

interface GoogleDriveOpenWithProps extends StartupLoaders {
  onOpenUrlModal: () => void;
  onLoadRemoteDataset: (url: string) => void;
}

/** Drive chooses the file; a user gesture authorizes that account before loading it. */
export function GoogleDriveOpenWith({ loadFromUrl, loadFromManifest, onOpenUrlModal, onLoadRemoteDataset }: GoogleDriveOpenWithProps) {
  const id = useId();
  const [request] = useState(() => parseGoogleDriveOpenWith(window.location.search));
  const [dismissed, setDismissed] = useState(false);
  const prepared = useRef(false);
  const hosting = getGoogleDriveHostingConfig();
  useEffect(() => {
    if (request.kind === 'none' || prepared.current) return;
    prepared.current = true;
    // The tab may have a token for a different account than the Drive launch.
    googleDriveAuth.disconnect();
    window.history.replaceState(window.history.state, '', googleDriveOpenWithViewerUrl(window.location.href, request));
  }, [request]);

  if (dismissed || request.kind === 'none') return null;
  const close = () => setDismissed(true);
  if (request.kind === 'error' || !hosting.enabled) return <AccountDialog id={id} isOpen onClose={close}
    title="Google Drive" connected={false} status={null}
    description={request.kind === 'error' ? request.message : 'Open this archive on colmapview.opsiclear.com to use Google Drive.'}>
    <button type="button" className={getButtonClass('ghost', 'sm')} onClick={close}>Close</button>
    {request.kind === 'open' && <a className={getButtonClass('primary', 'sm')}
      href={googleDriveOpenWithHandoff(request.file)}>Open ColmapView</a>}
  </AccountDialog>;

  return <DatasetAccountDialog provider="google" onClose={close}
    onOpenUrlModal={onOpenUrlModal} onLoadRemoteDataset={onLoadRemoteDataset}
    driveOpenFile={request.file} retryLoad={() => runStartupLoadPlan(getAppStartupLoadPlan({
      shareData: null, legacyManifestUrl: request.file.sourceUrl,
    }), { loadFromUrl, loadFromManifest })} />;
}
