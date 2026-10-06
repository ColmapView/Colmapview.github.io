import { useId, useRef, useState } from 'react';
import { ModalDialogShell } from '../ui/ModalDialogShell';
import { getHfConfiguration } from '../../features/huggingface/config';
import { PUBLICATION_LICENSES, validatePublicationDetails } from '../../features/datasetPublishing/publicationMetadata';
import { isPublishing } from '../../features/datasetPublishing/publishDataset';
import { publicationErrorMessage } from '../../features/huggingface/http';
import { usePublishDatasetStoreFacade } from './usePublishDatasetStoreFacade';
import { copyToClipboard } from '../../utils/clipboard';
import './publishDataset.css';
import { usePublicationPreview } from './usePublicationPreview';
import { CloseIcon } from '../../icons';
import { getButtonClass, inputStyles, modalStyles, panelStyles, Z_INDEX } from '../../theme';

const bytes = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MiB`;
const fieldClass = `${inputStyles.base} ${inputStyles.sizes.sm} w-full`;
const buttonClass = getButtonClass('secondary', 'sm');
const primaryButtonClass = getButtonClass('primary', 'sm');
const accountButtonClass = getButtonClass('secondary', 'xs');

export function PublishDatasetModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const facade = usePublishDatasetStoreFacade();
  const { auth, publish, publication, hfAuth } = facade;
  const id = useId();
  const previewInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [license, setLicense] = useState('');
  const [licenseName, setLicenseName] = useState('');
  const [licenseUrl, setLicenseUrl] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const configuration = getHfConfiguration();
  const config = configuration.status === 'ready' ? configuration.config : null;
  const busy = isPublishing(publish.phase);
  // Once a repository exists, its own section offers retry or a new publication; until then the form stays editable.
  const selecting = !busy && !publish.repoUrl && publish.phase !== 'completed';
  const preview = usePublicationPreview(facade.sourceKey, isOpen && selecting && !!config, facade.getScreenshotBlob);
  const details = { name, title, description, license, licenseName, licenseUrl };

  const publishNow = async () => {
    setFormError(null);
    try { validatePublicationDetails(details); }
    catch (error) { setFormError(publicationErrorMessage(error)); return; }
    if (!preview.file || preview.busy) { setFormError('Choose a preview image before publishing.'); return; }
    if (!auth.identity) return;
    await facade.publishDataset(auth.identity.username, details, preview.file);
  };
  const applyDeletions = async () => {
    setApplying(true);
    try { if (!await facade.applyDeletionsToData()) setFormError('Deletions could not be applied. Review the current reconstruction.'); }
    finally { setApplying(false); }
  };
  const copy = async () => {
    if (!publish.receipt) return;
    const { viewerUrl } = publish.receipt;
    setCopiedUrl(await copyToClipboard(viewerUrl) ? viewerUrl : null);
  };
  const signOut = () => { publication.cancel(); hfAuth.disconnect(); };
  const repositoryLine = (label: string) => publish.repoUrl && <p className="text-ds-muted text-xs">
    {label} <a href={publish.repoUrl} target="_blank" rel="noopener noreferrer">
      {publish.repoUrl.replace(/^https:\/\/huggingface\.co\/datasets\//, '')}<span aria-hidden="true"> ↗</span>
    </a>
  </p>;

  return <ModalDialogShell isOpen={isOpen} onClose={onClose} ariaLabelledBy={`${id}-title`}
    overlayClassName={`${panelStyles.overlay} p-4`} overlayStyle={{ zIndex: Z_INDEX.modalOverlay }}
    panelClassName={`${panelStyles.dialog} w-full publication-dialog overflow-hidden`} panelStyle={{ maxHeight: '90dvh' }} closeOnBackdrop={false}>
    <header className={`${modalStyles.popupHeader} flex-shrink-0`}>
      <h2 id={`${id}-title`} className={`${modalStyles.toolHeaderTitle} publication-title`}><span aria-hidden="true">🤗 </span>Publish to Hugging Face</h2>
      <div className="publication-header-actions">
        {config && (auth.status === 'connected' ? <>
          <span className="publication-account text-ds-muted text-xs" title={auth.identity?.username}>{auth.identity?.username}</span>
          <button type="button" className={accountButtonClass} onClick={signOut}>Sign out</button>
        </> : auth.status === 'connecting'
          ? <button type="button" className={accountButtonClass} onClick={signOut}>Cancel sign-in</button>
          : <button type="button" className={getButtonClass('primary', 'xs')} onClick={() => { void hfAuth.connect(config); }}>
            <span aria-hidden="true">🤗 </span>Sign in
          </button>)}
        <button type="button" className={modalStyles.toolHeaderClose} onClick={onClose} aria-label="Close publish dataset">
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
    <div className={`${panelStyles.scrollBody} publication-body text-sm text-ds-primary`}>
    {!config ? <section className="publication-section" aria-label="Publishing setup">
      <p>{configuration.status === 'unavailable' ? configuration.message : 'Dataset publishing is not enabled for this viewer.'}</p>
      {configuration.status === 'unavailable' && configuration.viewerUrl && <a href={configuration.viewerUrl} target="_blank" rel="noopener noreferrer">
        Open publishing viewer
      </a>}
    </section> : <>
      {auth.status !== 'connected' && <p className="text-ds-muted text-xs">
        Sign-in lets ColmapView read private repositories and create datasets.
      </p>}
      <div className={`publication-layout${publish.receipt ? ' publication-layout-result' : ''}`}>
        <section className="publication-preview-panel" aria-label="Dataset preview">
          <button type="button" className="publication-preview-button" disabled={!selecting} aria-label="Replace preview image"
            title={selecting ? 'Click to use your own image' : undefined} onClick={() => previewInput.current?.click()}>
            {preview.url ? <img className="publication-preview" src={preview.url} alt="Dataset preview to publish" />
              : <span className="publication-preview-empty text-ds-muted">{preview.busy ? 'Preparing preview…' : 'Choose a preview image'}</span>}
          </button>
          <input ref={previewInput} type="file" hidden aria-label="Choose custom preview image" accept="image/png,image/jpeg,image/webp" onChange={event => {
            const file = event.target.files?.[0];
            if (file) preview.replace(file);
            event.target.value = '';
          }} />
          {selecting && <p className="text-ds-muted text-xs">Click the image to use your own.</p>}
          {preview.error && <p role="alert" className="text-ds-error">{preview.error}</p>}
        </section>
        <div className="publication-main">
          {selecting && <section className="publication-fields" aria-label="Dataset details">
            <label htmlFor={`${id}-name`}>Repository name</label>
            <div className="publication-repo">
              <span className="publication-repo-prefix" title={auth.identity?.username}>
                <span className="publication-repo-account">{auth.identity?.username ?? 'your-account'}</span>/
              </span>
              <input id={`${id}-name`} className={fieldClass} value={name} maxLength={96} onChange={event => setName(event.target.value)} autoComplete="off" />
            </div>
            <label htmlFor={`${id}-dataset-title`}>Dataset title</label>
            <input id={`${id}-dataset-title`} className={fieldClass} value={title} maxLength={200} onChange={event => setTitle(event.target.value)} />
            <label htmlFor={`${id}-license`}>Dataset license</label>
            <select id={`${id}-license`} className={`${inputStyles.select} ${inputStyles.selectSizes.sm} w-full`} value={license} onChange={event => setLicense(event.target.value)}>
              <option value="">Choose a license you can grant</option>
              {PUBLICATION_LICENSES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            {license === 'other' && <>
              <label htmlFor={`${id}-license-name`}>Custom license name</label>
              <input id={`${id}-license-name`} className={fieldClass} value={licenseName} maxLength={200} onChange={event => setLicenseName(event.target.value)} />
              <label htmlFor={`${id}-license-url`}>Custom license URL</label>
              <input id={`${id}-license-url`} className={fieldClass} type="url" value={licenseUrl} onChange={event => setLicenseUrl(event.target.value)} />
            </>}
            <label htmlFor={`${id}-description`} className="publication-label-top">Description</label>
            <textarea id={`${id}-description`} className={fieldClass} value={description} maxLength={10000} rows={3} onChange={event => setDescription(event.target.value)} />
          </section>}
          {busy && <section className="publication-section" aria-label="Publication progress">
            {repositoryLine('Publishing to')}
            <p role="status" aria-live="polite">{publish.message}</p>
            <progress max={Math.max(1, publish.filesTotal)} value={publish.filesDone} aria-label="Files committed" />
            {publish.filesTotal > 0 && <p>{publish.filesDone} / {publish.filesTotal} files committed · {bytes(publish.bytesDone)}</p>}
            <button type="button" className={buttonClass} disabled={publish.phase === 'cancelling' || publish.phase === 'reconciling'} onClick={() => publication.cancel()}>Cancel publication</button>
            <p>You can close this dialog and reopen it with the 🤗 toolbar button. Keep this browser tab open until publication finishes.</p>
          </section>}
          {!busy && ['failed', 'cancelled'].includes(publish.phase) && publish.repoUrl && <section className="publication-section">
            {repositoryLine('Repository')}
            {publish.message && <p role="status">{publish.message}</p>}
            {publish.canRetry && <button type="button" className={primaryButtonClass} disabled={auth.status !== 'connected'} onClick={() => { void publication.retry(); }}>
              {publish.uncertain ? 'Check previous upload and retry' : 'Retry publication'}
            </button>}
            <button type="button" className={buttonClass} disabled={publish.uncertain} onClick={() => { publication.reset(); setFormError(null); }}>Start a new publication</button>
          </section>}
          {publish.receipt && <section className="publication-section" aria-label="Published dataset">
            <p role="status" className="publication-result-title">
              <span className="publication-result-check" aria-hidden="true">✓ </span>Published <strong>{publish.receipt.repoId}</strong>
            </p>
            <p className="text-ds-muted text-xs">Anyone can open this link without signing in.</p>
            <div className="publication-link-row">
              <input className={fieldClass} aria-label="Viewer link" readOnly value={publish.receipt.viewerUrl} onFocus={event => event.target.select()} />
              <button type="button" className={primaryButtonClass} onClick={() => { void copy(); }}>{copiedUrl === publish.receipt.viewerUrl ? 'Copied' : 'Copy'}</button>
            </div>
            <div className="publication-result-actions">
              <a className={`${buttonClass} publication-button-link`} href={publish.receipt.viewerUrl} target="_blank" rel="noopener noreferrer">
                Open viewer<span aria-hidden="true"> ↗</span>
              </a>
              <a className={`${buttonClass} publication-button-link`} href={publish.receipt.repoUrl} target="_blank" rel="noopener noreferrer">
                Hugging Face page<span aria-hidden="true"> ↗</span>
              </a>
            </div>
          </section>}
        </div>
      </div>
      {selecting && <section className="publication-submit" aria-label="Dataset contents">
        {facade.pendingDeletions > 0 && <div className="publication-actions">
          <p>Apply {facade.pendingDeletions} pending image deletions before publishing.</p>
          <button type="button" className={buttonClass} disabled={applying} onClick={() => { void applyDeletions(); }}>Apply deletions and continue</button>
        </div>}
        <p className="text-ds-muted text-xs">Includes all loaded images, available masks, and splats. This creates a public, discoverable dataset that anyone can download.
          Original image metadata is retained. Files may become public during upload; cancelling does not remove committed files.</p>
        <div className="publication-submit-row">
          {auth.status !== 'connected' && <span className="text-ds-muted text-xs">Sign in to publish.</span>}
          <button type="button" className={primaryButtonClass}
            disabled={auth.status !== 'connected' || !facade.reconstruction || facade.pendingDeletions > 0 || applying || preview.busy || !preview.file}
            onClick={() => { void publishNow(); }}>Publish public dataset</button>
        </div>
      </section>}
      {(formError || publish.error || auth.error) && <p role="alert" className="text-ds-error">{formError ?? publish.error ?? auth.error}</p>}
    </>}
    </div>
  </ModalDialogShell>;
}
