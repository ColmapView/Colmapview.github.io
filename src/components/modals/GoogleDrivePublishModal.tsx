import { useEffect, useId, useState } from 'react';
import { getGoogleDriveClientId, loadGoogleOAuthSdk, type GoogleOAuthSdk } from '../../features/googleDrive/auth';
import { DRIVE_FILE_NAME_MAX, drivePublicationErrorMessage, isDrivePublishing } from '../../features/googleDrive/publishDataset';
import { useGoogleDrivePublishStoreFacade } from './useGoogleDrivePublishStoreFacade';
import { UploadAccessField, UploadDialog, UploadImageFormatField, UploadLayout, UploadProgress, UploadResult, UploadSubmitRow, UploadViewPreview, PreviousUpload } from '../upload/UploadParts';
import { useDatasetScopedValue, useFocusWhenBecomesTrue } from '../upload/uploadHooks';
import { usePublicationPreview } from './usePublicationPreview';
import { GoogleDriveIcon } from '../../icons';
import { getButtonClass, inputStyles } from '../../theme';
import type { PublicationImageFormat } from '../../features/datasetPublishing/types';
import { useHubLink } from '../upload/useHubLink';
import { hubDisclosure } from '../../features/colmapviewHub/disclosure';

const fieldClass = `${inputStyles.base} ${inputStyles.sizes.sm} w-full min-w-0`;
const secondary = getButtonClass('secondary', 'sm');
const primary = getButtonClass('primary', 'sm');
const bytes = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MiB`;

export function GoogleDrivePublishModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const facade = useGoogleDrivePublishStoreFacade();
  const { auth, publish, publication, googleDriveAuth } = facade;
  const id = useId();
  const clientId = getGoogleDriveClientId();
  const [name, setName] = useDatasetScopedValue(facade.sourceKey, `${facade.datasetName}.zip`);
  const [shared, setShared] = useState(true);
  const [imageFormat, setImageFormat] = useState<PublicationImageFormat>('original');
  const [sdk, setSdk] = useState<GoogleOAuthSdk | null>(null);
  const [sdkAttempt, setSdkAttempt] = useState(0);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const busy = isDrivePublishing(publish.phase);
  const selecting = publish.phase === 'idle';
  const preview = usePublicationPreview(facade.sourceKey, isOpen && selecting && Boolean(clientId), facade.getScreenshotBlob);
  const hub = useHubLink('googleDrive', isOpen);
  const disclosure = hubDisclosure(hub.enabled, shared ? 'public' : 'private', imageFormat === 'original');
  const connected = auth.status === 'connected';
  useFocusWhenBecomesTrue(connected, `${id}-access`);
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
    try { await facade.publishDataset(name, shared, imageFormat, preview.file ?? null); }
    catch (error) { setFormError(drivePublicationErrorMessage(error)); }
  };
  const signOut = () => { publication.cancel(); googleDriveAuth.disconnect(); };
  const applyDeletions = async () => {
    setApplying(true);
    try { if (!await facade.applyDeletionsToData()) setFormError('Deletions could not be applied. Review the current reconstruction.'); }
    finally { setApplying(false); }
  };

  return <UploadDialog isOpen={isOpen} onClose={onClose} closeLabel="Close Drive publication"
    title={<><GoogleDriveIcon className="w-3.5 h-3.5 inline mr-1" />Publish to Google Drive</>}
    headerActions={clientId && (auth.status === 'connected' || auth.status === 'connecting'
      ? <button type="button" className={getButtonClass('secondary', 'xs')} onClick={signOut}>{auth.status === 'connecting' ? 'Cancel sign-in' : 'Sign out'}</button>
      : <button type="button" className={getButtonClass('primary', 'xs')} disabled={!sdk} aria-label="Sign in with Google"
        onClick={() => { if (sdk) googleDriveAuth.connect(clientId, sdk); }}>Sign in</button>)}>
    {!clientId ? <p>Google Drive publishing is unavailable in this viewer.</p> : <>
      {auth.status !== 'connected' && <p className="publication-note">
        Uploads go directly to Drive. Sign-in lets ColmapView create and manage its dataset files.
      </p>}
      <UploadLayout completed={Boolean(publish.receipt)}>
        <UploadViewPreview url={preview.url} busy={preview.busy} hasDataset={Boolean(facade.reconstruction)} />
        <div className="publication-main">
          {selecting && <PreviousUpload hub={hub} />}
          {selecting && <section className="publication-fields" aria-label="Drive dataset details">
            <UploadAccessField id={`${id}-access`} shared={shared} onChange={setShared} publicLabel="Anyone with the link"
              hint={shared ? 'Link sharing is enabled after the upload is verified.' : 'Saved privately in My Drive. You can share it later in Drive.'} />
            <UploadImageFormatField id={`${id}-images`} value={imageFormat} onChange={setImageFormat} />
            <label htmlFor={`${id}-name`}>File name</label>
            <input id={`${id}-name`} className={fieldClass} value={name} maxLength={DRIVE_FILE_NAME_MAX} onChange={event => setName(event.target.value)} autoComplete="off" />
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
          {publish.receipt && <UploadResult label="Published Drive dataset" title={publish.receipt.shared ? 'Published to Google Drive' : 'Saved privately to Google Drive'}
            notice={publish.receipt.shared ? 'Anyone with the link can view.' : 'Private. Viewers need permission to this file and must choose it in the Drive picker.'}
            viewerUrl={publish.receipt.viewerUrl} providerLink={{ url: publish.receipt.driveUrl, label: 'Google Drive' }}
            hub={hub} />}
        </div>
      </UploadLayout>
      {selecting && <section className="publication-submit" aria-label="Drive dataset contents">
        {facade.pendingDeletions > 0 && <div className="publication-actions">
          <p>Apply {facade.pendingDeletions} pending image deletions before publishing.</p>
          <button type="button" className={secondary} disabled={applying} onClick={() => { void applyDeletions(); }}>Apply deletions and continue</button>
        </div>}
        <UploadSubmitRow id={id} note={!connected && 'Sign in to publish.'} disclosure={disclosure}
          disabled={!connected || !facade.reconstruction || facade.pendingDeletions > 0 || applying || hub.busy}
          onSubmit={() => { void publishNow(); }}>{shared ? 'Publish shared dataset' : 'Save private dataset'}</UploadSubmitRow>
      </section>}
      {sdkError && <p role="alert" className="text-ds-error">{sdkError} <button type="button" className={secondary} onClick={() => setSdkAttempt(attempt => attempt + 1)}>Retry sign-in setup</button></p>}
      {(formError || publish.error || auth.error) && <p role="alert" className="text-ds-error">{formError ?? publish.error ?? auth.error}</p>}
    </>}
  </UploadDialog>;
}
