import { useEffect, useId, useRef, useState } from 'react';
import { runStartupLoadPlan, type StartupLoaders } from '../../appStartupLoad';
import { getAppStartupLoadPlan } from '../../appStartupPolicy';
import { googleDriveAuth } from '../../features/googleDrive/auth';
import { getGoogleDriveHostingConfig } from '../../features/googleDrive/config';
import { googleDriveOpenWithHandoff, googleDriveOpenWithViewerUrl, parseGoogleDriveOpenWith } from '../../features/googleDrive/openWith';
import { getButtonClass } from '../../theme';
import { AccountDialog } from '../ui/AccountDialog';
import { DatasetAccountDialog } from './DatasetAccountDialog';
import { accountSessions, accountSessionsSupported } from '../../features/accountSessions/api';

interface GoogleDriveOpenWithProps extends StartupLoaders {
  onOpenUrlModal: () => void;
  onLoadRemoteDataset: (url: string) => void;
}

/** Drive chooses the file; restore its account or complete one authorization before loading it. */
export function GoogleDriveOpenWith({ loadFromUrl, loadFromManifest, onOpenUrlModal, onLoadRemoteDataset }: GoogleDriveOpenWithProps) {
  const id = useId();
  const [request] = useState(() => parseGoogleDriveOpenWith(window.location.search));
  const [returned] = useState(() => new URLSearchParams(window.location.search).has('account_result'));
  const [dismissed, setDismissed] = useState(false);
  const [checking, setChecking] = useState(() => accountSessionsSupported() && request.kind === 'open');
  const [sessionError, setSessionError] = useState<string | null>(null);
  const prepared = useRef(false);
  const restoration = useRef<Promise<boolean> | null>(null);
  const redirectStarted = useRef(false);
  const hosting = getGoogleDriveHostingConfig();
  useEffect(() => {
    if (request.kind === 'none' || dismissed) return;
    if (!prepared.current) {
      prepared.current = true;
      // Replace only the in-memory token. A Drive launch must not delete the browser's saved connection.
      googleDriveAuth.clear();
      window.history.replaceState(window.history.state, '', googleDriveOpenWithViewerUrl(window.location.href, request));
    }
    if (request.kind !== 'open' || !hosting.enabled || !accountSessionsSupported()) return;
    let cancelled = false;
    const controller = new AbortController();
    restoration.current ??= accountSessions.load().then(state => state.capabilities.google ? googleDriveAuth.restore(request.file.userId) : false);
    void restoration.current.then(async restored => {
      if (cancelled) return;
      if (restored) {
        setDismissed(true);
        await runStartupLoadPlan(getAppStartupLoadPlan({ shareData: null, legacyManifestUrl: request.file.sourceUrl }), { loadFromUrl, loadFromManifest });
      } else if (accountSessions.getSnapshot().capabilities.google && !returned && !redirectStarted.current) {
        redirectStarted.current = true;
        await accountSessions.connectRedirect('google', { loginHint: request.file.userId,
          returnTo: googleDriveOpenWithHandoff(request.file) }, controller.signal);
      } else setChecking(false);
    }).catch(error => {
      if (!cancelled) { setSessionError(error instanceof Error ? error.message : 'Could not open this Drive connection. Try again.'); setChecking(false); }
    });
    return () => { cancelled = true; controller.abort(); };
  }, [request, returned, dismissed, hosting.enabled, loadFromUrl, loadFromManifest]);

  if (dismissed || request.kind === 'none') return null;
  const close = () => setDismissed(true);
  if (checking && request.kind === 'open' && hosting.enabled) return <AccountDialog id={id} isOpen onClose={close}
    title="Google Drive" connected={false} status="Opening archive…" description="Opening the archive selected in Google Drive.">{null}</AccountDialog>;
  if (request.kind === 'error' || !hosting.enabled) return <AccountDialog id={id} isOpen onClose={close}
    title="Google Drive" connected={false} status={null}
    description={request.kind === 'error' ? request.message : 'Open this archive on colmapview.opsiclear.com to use Google Drive.'}>
    <button type="button" className={getButtonClass('ghost', 'sm')} onClick={close}>Close</button>
    {request.kind === 'open' && <a className={getButtonClass('primary', 'sm')}
      href={googleDriveOpenWithHandoff(request.file)}>Open ColmapView</a>}
  </AccountDialog>;

  return <DatasetAccountDialog provider="google" onClose={close}
    accessMessage={sessionError ?? undefined}
    onOpenUrlModal={onOpenUrlModal} onLoadRemoteDataset={onLoadRemoteDataset}
    driveOpenFile={request.file} retryLoad={() => runStartupLoadPlan(getAppStartupLoadPlan({
      shareData: null, legacyManifestUrl: request.file.sourceUrl,
    }), { loadFromUrl, loadFromManifest })} />;
}
