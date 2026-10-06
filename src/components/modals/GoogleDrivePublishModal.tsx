import { useEffect, useId, useState } from 'react';
import { ModalDialogShell } from '../ui/ModalDialogShell';
import { getGoogleDriveClientId, loadGoogleOAuthSdk, type GoogleOAuthSdk } from '../../features/googleDrive/auth';
import { drivePublicationErrorMessage, isDrivePublishing } from '../../features/googleDrive/publishDataset';
import { useGoogleDrivePublishStoreFacade } from './useGoogleDrivePublishStoreFacade';
import { copyToClipboard } from '../../utils/clipboard';
import { CloseIcon, GoogleDriveIcon } from '../../icons';
import { getButtonClass, inputStyles, modalStyles, panelStyles, Z_INDEX } from '../../theme';
import './publishDataset.css';

const fieldClass = `${inputStyles.base} ${inputStyles.sizes.sm} w-full`;
const secondary = getButtonClass('secondary', 'sm');
const primary = getButtonClass('primary', 'sm');
const bytes = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MiB`;

export function GoogleDrivePublishModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const facade = useGoogleDrivePublishStoreFacade();
  const { auth, publish, publication, googleDrivePublishAuth } = facade;
  const id = useId();
  const clientId = getGoogleDriveClientId();
  const [name, setName] = useState('dataset.zip');
  const [shared, setShared] = useState(false);
  const [sdk, setSdk] = useState<GoogleOAuthSdk | null>(null);
  const [sdkAttempt, setSdkAttempt] = useState(0);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const busy = isDrivePublishing(publish.phase);
  const selecting = publish.phase === 'idle';
  useEffect(() => {
    if (!isOpen || !clientId) return;
    let cancelled = false;
    void loadGoogleOAuthSdk().then(value => { if (!cancelled) { setSdk(value); setSdkError(null); } }, () => {
      if (!cancelled) setSdkError('Could not load Google sign-in. Check your connection and retry.');
    });
    return () => { cancelled = true; };
  }, [isOpen, clientId, sdkAttempt]);
  const publishNow = async () => {
    setFormError(null);
    try { await facade.publishDataset(name, shared); }
    catch (error) { setFormError(drivePublicationErrorMessage(error)); }
  };
  const signOut = () => { publication.cancel(); googleDrivePublishAuth.disconnect(); };
  const applyDeletions = async () => {
    setApplying(true);
    try { if (!await facade.applyDeletionsToData()) setFormError('Deletions could not be applied. Review the current reconstruction.'); }
    finally { setApplying(false); }
  };

  return <ModalDialogShell isOpen={isOpen} onClose={onClose} ariaLabelledBy={`${id}-title`}
    overlayClassName={`${panelStyles.overlay} p-4`} overlayStyle={{ zIndex: Z_INDEX.modalOverlay }}
    panelClassName={`${panelStyles.dialog} w-full max-w-lg overflow-hidden`} panelStyle={{ maxHeight: '90dvh' }} closeOnBackdrop={false}>
    <header className={`${modalStyles.popupHeader} flex-shrink-0`}>
      <h2 id={`${id}-title`} className={`${modalStyles.toolHeaderTitle} publication-title flex items-center gap-2`}><GoogleDriveIcon />Publish to Google Drive</h2>
      <div className="publication-header-actions">
        {clientId && (auth.status === 'connected' || auth.status === 'connecting'
          ? <button type="button" className={getButtonClass('secondary', 'xs')} onClick={signOut}>{auth.status === 'connecting' ? 'Cancel sign-in' : 'Sign out'}</button>
          : <button type="button" className={getButtonClass('primary', 'xs')} disabled={!sdk} aria-label="Sign in with Google"
            onClick={() => { if (sdk) googleDrivePublishAuth.connect(clientId, sdk); }}>Sign in</button>)}
        <button type="button" className={modalStyles.toolHeaderClose} onClick={onClose} aria-label="Close Drive publication"><CloseIcon className="w-3.5 h-3.5" /></button>
      </div>
    </header>
    <div className={`${panelStyles.scrollBody} publication-body text-sm text-ds-primary`}>
      {!clientId ? <p>Google Drive publishing is unavailable in this viewer.</p> : <>
        {auth.status !== 'connected' && <p className="text-xs text-ds-muted">
          Uploads go directly to Drive. Sign-in lets ColmapView create and manage its dataset files.
        </p>}
        {selecting && <section className="publication-section" aria-label="Drive dataset details">
          <label htmlFor={`${id}-name`} className="text-xs text-ds-muted">File name</label>
          <input id={`${id}-name`} className={fieldClass} value={name} maxLength={180} onChange={event => setName(event.target.value)} autoComplete="off" />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={shared} onChange={event => setShared(event.target.checked)} />Anyone with the link can view
          </label>
          <p className="text-xs text-ds-muted">{shared ? 'Link sharing is enabled after the upload is verified.' : 'Saved privately in My Drive. You can share it later in Drive.'}</p>
        </section>}
        {busy && <section className="publication-section" aria-label="Drive publication progress">
          <p role="status" aria-live="polite">{publish.message}</p>
          {publish.bytesTotal > 0 ? <>
            <progress max={publish.bytesTotal} value={publish.bytesDone} aria-label="Drive upload progress" />
            <p className="text-xs text-ds-muted">{bytes(publish.bytesDone)} / {bytes(publish.bytesTotal)}</p>
          </> : publish.filesTotal > 0 && <progress max={publish.filesTotal} value={publish.filesDone} aria-label="Files packaged" />}
          <button type="button" className={secondary} disabled={publish.phase === 'cancelling'} onClick={() => publication.cancel()}>Cancel upload</button>
          <p className="text-xs text-ds-muted">Keep this tab open. You can close this dialog and reopen it from the Drive toolbar icon.</p>
        </section>}
        {!busy && ['failed', 'cancelled'].includes(publish.phase) && <section className="publication-section" aria-label="Drive upload recovery">
          <p role="status">{publish.message}</p>
          {publish.fileUrl && <a href={publish.fileUrl} target="_blank" rel="noopener noreferrer">Review file in Drive ↗</a>}
          <div className="publication-actions">
            {publish.canRetry && <button type="button" className={primary} disabled={auth.status !== 'connected'} onClick={() => { void publication.retry(); }}>Check upload and retry</button>}
            <button type="button" className={secondary} onClick={() => { publication.reset(); setFormError(null); }}>Start a new publication</button>
          </div>
          <p className="text-xs text-ds-muted">Cancelling stops transfers. A completed file or sharing change may remain in Drive.</p>
        </section>}
        {publish.receipt && <section className="publication-section" aria-label="Published Drive dataset">
          <p role="status"><span className="publication-result-check" aria-hidden="true">✓ </span>Dataset saved to Google Drive</p>
          <p className="text-xs text-ds-muted">{publish.receipt.shared ? 'Anyone with the link can view.' : 'Private. Viewers need permission to this file and must choose it in the Drive picker.'}</p>
          <div className="publication-link-row">
            <input className={fieldClass} aria-label="Viewer link" readOnly value={publish.receipt.viewerUrl} onFocus={event => event.target.select()} />
            <button type="button" className={primary} onClick={() => { const url = publish.receipt!.viewerUrl; void copyToClipboard(url).then(ok => setCopied(ok ? url : null)); }}>{copied === publish.receipt.viewerUrl ? 'Copied' : 'Copy'}</button>
          </div>
          <div className="publication-result-actions">
            <a className={`${secondary} publication-button-link`} href={publish.receipt.viewerUrl} target="_blank" rel="noopener noreferrer">Open viewer ↗</a>
            <a className={`${secondary} publication-button-link`} href={publish.receipt.driveUrl} target="_blank" rel="noopener noreferrer">Google Drive ↗</a>
          </div>
          <button type="button" className={secondary} onClick={() => { publication.reset(); setFormError(null); }}>Publish another dataset</button>
        </section>}
        {selecting && <section className="publication-submit" aria-label="Drive dataset contents">
          {facade.pendingDeletions > 0 && <div className="publication-actions">
            <p>Apply {facade.pendingDeletions} pending image deletions before publishing.</p>
            <button type="button" className={secondary} disabled={applying} onClick={() => { void applyDeletions(); }}>Apply deletions and continue</button>
          </div>}
          <p className="text-xs text-ds-muted">Includes original images, masks, the active splat, and viewer settings. Original image metadata is retained. ZIP limit: 2 GiB.</p>
          <div className="publication-submit-row">
            {auth.status !== 'connected' && <span className="text-xs text-ds-muted">Allow file uploads to continue.</span>}
            <button type="button" className={primary} disabled={auth.status !== 'connected' || !facade.reconstruction || facade.pendingDeletions > 0 || applying}
              onClick={() => { void publishNow(); }}>{shared ? 'Publish shared dataset' : 'Save private dataset'}</button>
          </div>
        </section>}
        {sdkError && <p role="alert" className="text-ds-error">{sdkError} <button type="button" className={secondary} onClick={() => setSdkAttempt(attempt => attempt + 1)}>Retry sign-in setup</button></p>}
        {(formError || publish.error || auth.error) && <p role="alert" className="text-ds-error">{formError ?? publish.error ?? auth.error}</p>}
      </>}
    </div>
  </ModalDialogShell>;
}
