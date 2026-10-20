import { useEffect, useId, useRef, useState } from 'react';
import { getHubSource } from '../../features/datasetPublishing/publicationSnapshot';
import { getPublicationViewerBaseUrl } from '../../features/datasetPublishing/publicationLinks';
import { publicationLicenseInfo, PUBLICATION_LICENSES, stripControlCharacters } from '../../features/datasetPublishing/publicationMetadata';
import { getHubPublicationConfiguration, newHubManagementSecret, publishHubDataset, type HubCatalogReceipt, type HubPublicationConfiguration } from '../../features/colmapviewHub/catalogPublication';
import { hubPublications, type PublicHubDataset } from '../../features/colmapviewHub/publication';
import { sameHubSource } from '../../features/colmapviewHub/hubShareLinks';
import { HUB_DESCRIPTION_LIMIT, HUB_TITLE_LIMIT, hubText, type HubMetadata } from '../../features/colmapviewHub/payload';
import { makeHubThumbnail } from '../../features/colmapviewHub/thumbnail';
import { encodeCameraState } from '../../utils/urlCameraStateCodec';
import { UploadDialog, UploadLayout } from '../upload/UploadParts';
import { HubBotCheck } from '../upload/HubBotCheck';
import { CopyableField } from '../ui/CopyableField';
import { usePublicationPreview } from './usePublicationPreview';
import { getButtonClass, inputStyles } from '../../theme';
import { useShareOnHubSourceKey, useShareOnHubStoreFacade } from './useShareOnHubStoreFacade';

interface ShareOnHubProps { isOpen: boolean; onClose: () => void; target?: PublicHubDataset }

/** Both existing remote sources and newly uploaded datasets use one public-listing form. */
export function ShareOnHubModal(props: ShareOnHubProps) {
  const key = useShareOnHubSourceKey();
  return <HubPublicationForm key={props.target?.viewerUrl ?? key} {...props} />;
}

function HubPublicationForm({ isOpen, onClose, target }: ShareOnHubProps) {
  const id = useId();
  const { sourceUrl, sourceName, pending, source, getScreenshot, getCurrentView } = useShareOnHubStoreFacade();
  const uploaded = useRef(target ?? Object.values(hubPublications).map(provider => provider.getPublicDataset())
    .find(candidate => candidate && sameHubSource(candidate.source, source)) ?? undefined).current;
  const blocked = !uploaded && (!sourceUrl ? 'Upload this dataset to Hugging Face, Google Drive or a bucket first.'
    : source.revision > 0 || pending ? 'Upload the current edits before sharing them on Hub.' : null);
  const [title, setTitle] = useState(hubText(uploaded?.metadata.title ?? sourceName, HUB_TITLE_LIMIT));
  const [description, setDescription] = useState(uploaded?.metadata.description ?? '');
  const [license, setLicense] = useState(uploaded?.metadata.license ? 'current' : '');
  const [acknowledged, setAcknowledged] = useState(false);
  const [configuration, setConfiguration] = useState<HubPublicationConfiguration | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [challenge, setChallenge] = useState(0);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<HubCatalogReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ signature: string; secret: string } | null>(null);
  const preview = usePublicationPreview(source.key, isOpen && !uploaded && !receipt && !busy && !blocked, getScreenshot);
  const field = `${inputStyles.base} ${inputStyles.sizes.sm} w-full`;

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    void getHubPublicationConfiguration(controller.signal).then(setConfiguration)
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Hub is unavailable.'); });
    return () => { controller.abort(); setToken(null); };
  }, [isOpen]);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const share = async () => {
    if (blocked || busy || !token || !acknowledged || !title.trim()) return;
    setBusy(true); setError(null);
    try {
      const current = getHubSource();
      if (!uploaded && !sameHubSource(current, source)) throw new Error('The dataset changed. Reopen Share on Hub.');
      const metadata: HubMetadata = { ...uploaded?.metadata, title: title.trim(), description,
        license: license === 'current' ? uploaded?.metadata.license : publicationLicenseInfo({ license }) };
      let viewerUrl = uploaded?.viewerUrl;
      if (!viewerUrl) {
        const viewer = new URL(getPublicationViewerBaseUrl(window.location));
        viewer.searchParams.set('url', sourceUrl!);
        const view = getCurrentView();
        if (view) viewer.hash = encodeCameraState(view);
        viewerUrl = viewer.href;
      }
      const thumbnailBase64 = uploaded?.thumbnailBase64 ?? (preview.file ? await makeHubThumbnail(preview.file) : null);
      if (!thumbnailBase64) throw new Error('The preview is not ready. Try again.');
      if (!uploaded && !sameHubSource(getHubSource(), source)) throw new Error('The dataset changed. Reopen Share on Hub.');
      const signature = JSON.stringify({ viewerUrl, metadata, thumbnailBase64 });
      if (attempt.current?.signature !== signature) attempt.current = { signature, secret: newHubManagementSecret() };
      setReceipt(await publishHubDataset({ viewerUrl, metadata, thumbnailBase64, managementSecret: attempt.current.secret, turnstileToken: token }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The dataset could not be shared.'); }
    finally { setBusy(false); setToken(null); setChallenge(value => value + 1); }
  };

  return <UploadDialog isOpen={isOpen} onClose={onClose} title="Share on Hub" closeLabel="Close Share on Hub">
    {receipt ? <section aria-label="Hub publication result">
      {receipt.status === 'pending' ? <><p role="status">{receipt.message}</p><p>Submission ID: {receipt.id}</p></> : <>
        <p role="status">Shared on Hub.</p><CopyableField label="Hub dataset link" value={receipt.shareUrl} />
        <a className={getButtonClass('secondary', 'sm')} href={receipt.catalogUrl} target="_blank" rel="noopener noreferrer">View on Hub ↗</a>
      </>}
    </section> : blocked ? <p>{blocked}</p> : <>
      <UploadLayout>
        <section className="publication-preview-panel" aria-label="Hub preview">
          <div className="publication-preview-frame">
            {(uploaded?.thumbnailBase64 || preview.url) && <img className="publication-preview publication-hub-preview" src={uploaded ? `data:image/jpeg;base64,${uploaded.thumbnailBase64}` : preview.url!} alt="Preview to share on Hub" />}
          </div>
        </section>
        <div className="publication-main"><div className="publication-fields">
        <label htmlFor={`${id}-title`}>Dataset title</label>
        <input id={`${id}-title`} className={field} value={title} maxLength={HUB_TITLE_LIMIT} disabled={busy} onChange={event => setTitle(stripControlCharacters(event.target.value))} />
        <label htmlFor={`${id}-description`}>Description</label>
        <textarea id={`${id}-description`} className={field} value={description} rows={2} maxLength={HUB_DESCRIPTION_LIMIT} disabled={busy} onChange={event => setDescription(stripControlCharacters(event.target.value, true))} />
        <label htmlFor={`${id}-license`}>Dataset license</label>
        <select id={`${id}-license`} className={inputStyles.select} value={license} disabled={busy} onChange={event => setLicense(event.target.value)}>
          <option value="">No license specified</option>
          {uploaded?.metadata.license && <option value="current">{uploaded.metadata.license.name}</option>}
          {PUBLICATION_LICENSES.filter(option => option.id !== 'other').map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        </div></div>
      </UploadLayout>
      <section className="publication-submit">
        <p className="publication-note">Files stay at the source. Some datasets need review before listing.</p>
        <label className="flex items-start gap-2"><input className="mt-1 flex-shrink-0" type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)} />
          Make the dataset link, title, description and preview publicly discoverable on Hub.</label>
        {configuration && !configuration.enabled && <p role="status">Sharing on Hub is temporarily unavailable.</p>}
        {busy && <p role="status">Checking the source and sharing on Hub…</p>}
        <div className="flex flex-wrap items-end justify-between gap-3">
          {configuration?.enabled && configuration.siteKey && !busy && <HubBotCheck key={challenge} siteKey={configuration.siteKey} onToken={setToken} />}
          <button type="button" className={`${getButtonClass('primary', 'sm')} ml-auto`} disabled={busy || !configuration?.enabled || !token || !acknowledged || !title.trim() || !uploaded && (preview.busy || !preview.file)} onClick={() => { void share(); }}>Share on Hub</button>
        </div>
      </section>
    </>}
    {(error || preview.error) && <p role="alert" className="text-ds-error">{error ?? preview.error}</p>}
  </UploadDialog>;
}
