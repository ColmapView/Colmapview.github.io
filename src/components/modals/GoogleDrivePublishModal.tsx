import { useEffect, useId, useState } from 'react';
import { ModalDialogShell } from '../ui/ModalDialogShell';
import { getGoogleDriveClientId, loadGoogleOAuthSdk, type GoogleOAuthSdk } from '../../features/googleDrive/auth';
import { drivePublicationErrorMessage, isDrivePublishing } from '../../features/googleDrive/publishDataset';
import { useGoogleDrivePublishStoreFacade } from './useGoogleDrivePublishStoreFacade';
import { UploadAccessField, UploadProgress, UploadResult } from '../upload/UploadParts';
import { CloseIcon, GoogleDriveIcon } from '../../icons';
import { getButtonClass, inputStyles, modalStyles, panelStyles, Z_INDEX } from '../../theme';

const fieldClass = `${inputStyles.base} ${inputStyles.sizes.sm} w-full min-w-0`;
const secondary = getButtonClass('secondary', 'sm');
const primary = getButtonClass('primary', 'sm');
const bytes = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MiB`;

export function GoogleDrivePublishModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const facade = useGoogleDrivePublishStoreFacade();
  const { auth, publish, publication, googleDriveAuth } = facade;
  const id = useId();
  const clientId = getGoogleDriveClientId();
  const [name, setName] = useState('dataset.zip');
  const [shared, setShared] = useState(false);
  const [sdk, setSdk] = useState<GoogleOAuthSdk | null>(null);
  const [sdkAttempt, setSdkAttempt] = useState(0);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
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
  const signOut = () => { publication.cancel(); googleDriveAuth.disconnect(); };
  const applyDeletions = async () => {
    setApplying(true);
    try { if (!await facade.applyDeletionsToData()) setFormError('Deletions could not be applied. Review the current reconstruction.'); }
    finally { setApplying(false); }
  };

  return <ModalDialogShell isOpen={isOpen} onClose={onClose} ariaLabelledBy={`${id}-title`}
    overlayClassName={`${panelStyles.overlay} p-4`} overlayStyle={{ zIndex: Z_INDEX.modalOverlay }}
    panelClassName={`${panelStyles.dialog} w-full max-w-lg overflow-hidden`} panelStyle={{ maxHeight: '90dvh' }} closeOnBackdrop={false}>
    <header className={`${modalStyles.popupHeader} flex-shrink-0`}>
      <h2 id={`${id}-title`} className={`${modalStyles.toolHeaderTitle} min-w-0 flex items-center gap-2`}>
        <GoogleDriveIcon className="w-3.5 h-3.5 flex-shrink-0" /><span className="publication-title">Publish to Google Drive</span>
      </h2>
      <div className="publication-header-actions">
        {clientId && (auth.status === 'connected' || auth.status === 'connecting'
          ? <button type="button" className={getButtonClass('secondary', 'xs')} onClick={signOut}>{auth.status === 'connecting' ? 'Cancel sign-in' : 'Sign out'}</button>
          : <button type="button" className={getButtonClass('primary', 'xs')} disabled={!sdk} aria-label="Sign in with Google"
            onClick={() => { if (sdk) googleDriveAuth.connect(clientId, sdk); }}>Sign in</button>)}
        <button type="button" className={modalStyles.toolHeaderClose} onClick={onClose} aria-label="Close Drive publication"><CloseIcon className="w-3.5 h-3.5" /></button>
      </div>
    </header>
    <div className={`${panelStyles.scrollBody} publication-body text-sm text-ds-primary`}>
      {!clientId ? <p>Google Drive publishing is unavailable in this viewer.</p> : <>
        {auth.status !== 'connected' && <p className="publication-note">
          Uploads go directly to Drive. Sign-in lets ColmapView create and manage its dataset files.
        </p>}
        {selecting && <section className="publication-fields" aria-label="Drive dataset details">
          <UploadAccessField id={`${id}-access`} shared={shared} onChange={setShared} publicLabel="Anyone with the link"
            hint={shared ? 'Link sharing is enabled after the upload is verified.' : 'Saved privately in My Drive. You can share it later in Drive.'} />
          <label htmlFor={`${id}-name`}>File name</label>
          <input id={`${id}-name`} className={fieldClass} value={name} maxLength={180} onChange={event => setName(event.target.value)} autoComplete="off" />
        </section>}
        {busy && <UploadProgress label="Drive publication progress" message={publish.message}
          progressLabel={publish.bytesTotal > 0 ? 'Drive upload progress' : 'Files packaged'}
          max={publish.bytesTotal > 0 ? publish.bytesTotal : publish.filesTotal} value={publish.bytesTotal > 0 ? publish.bytesDone : publish.filesDone}
          detail={publish.bytesTotal > 0 ? `${bytes(publish.bytesDone)} / ${bytes(publish.bytesTotal)}` : undefined}
          cancelDisabled={publish.phase === 'cancelling'} onCancel={() => publication.cancel()} />}
        {!busy && ['failed', 'cancelled'].includes(publish.phase) && <section className="publication-section" aria-label="Drive upload recovery">
          <p role="status">{publish.message}</p>
          {publish.fileUrl && <a href={publish.fileUrl} target="_blank" rel="noopener noreferrer">Review file in Drive ↗</a>}
          <div className="publication-actions">
            {publish.canRetry && <button type="button" className={primary} disabled={auth.status !== 'connected'} onClick={() => { void publication.retry(); }}>Check upload and retry</button>}
            <button type="button" className={secondary} onClick={() => { publication.reset(); setFormError(null); }}>Start a new publication</button>
          </div>
          <p className="publication-note">Cancelling stops transfers. A completed file or sharing change may remain in Drive.</p>
        </section>}
        {publish.receipt && <UploadResult label="Published Drive dataset" title="Dataset saved to Google Drive"
          notice={publish.receipt.shared ? 'Anyone with the link can view.' : 'Private. Viewers need permission to this file and must choose it in the Drive picker.'}
          viewerUrl={publish.receipt.viewerUrl} providerLink={{ url: publish.receipt.driveUrl, label: 'Google Drive' }}
          onReset={() => { publication.reset(); setFormError(null); }} />}
        {selecting && <section className="publication-submit" aria-label="Drive dataset contents">
          {facade.pendingDeletions > 0 && <div className="publication-actions">
            <p>Apply {facade.pendingDeletions} pending image deletions before publishing.</p>
            <button type="button" className={secondary} disabled={applying} onClick={() => { void applyDeletions(); }}>Apply deletions and continue</button>
          </div>}
          <p className="publication-note">Includes original images, masks, the active splat, and viewer settings. Original image metadata is retained. ZIP limit: 2 GiB.</p>
          <div className="publication-submit-row">
            {auth.status !== 'connected' && <span className="publication-note">Sign in to publish.</span>}
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
