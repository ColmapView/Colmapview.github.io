import { useEffect, useId, useRef, type ReactNode } from 'react';
import { ModalDialogShell } from '../ui/ModalDialogShell';
import { CloseIcon } from '../../icons';
import { CopyableField } from '../ui/CopyableField';
import { getButtonClass, inputStyles, modalStyles, panelStyles, Z_INDEX } from '../../theme';
import { PUBLICATION_JPEG_QUALITY, type PublicationFormat, type PublicationImageFormat } from '../../features/datasetPublishing/types';
import './upload.css';
import { HubLinkResult } from './HubLink';
import type { HubLink } from './useHubLink';

const secondary = getButtonClass('secondary', 'sm');

export function UploadDialog({ isOpen, onClose, title, closeLabel, headerActions, children }: {
  isOpen: boolean; onClose: () => void; title: ReactNode; closeLabel: string;
  headerActions?: ReactNode; children: ReactNode;
}) {
  const id = useId();
  return <ModalDialogShell isOpen={isOpen} onClose={onClose} ariaLabelledBy={id}
    overlayClassName={`${panelStyles.overlay} p-4`} overlayStyle={{ zIndex: Z_INDEX.modalOverlay }}
    panelClassName={`${panelStyles.dialog} w-full publication-dialog overflow-hidden`} panelStyle={{ maxHeight: '90dvh' }} closeOnBackdrop={false}>
    <header className={`${modalStyles.popupHeader} publication-header flex-shrink-0`}>
      <h2 id={id} className={`${modalStyles.toolHeaderTitle} publication-title`}>{title}</h2>
      {headerActions && <div className="publication-header-actions">{headerActions}</div>}
      <button type="button" className={`${modalStyles.toolHeaderClose} publication-header-close`} onClick={onClose} aria-label={closeLabel}>
        <CloseIcon className="w-3.5 h-3.5" />
      </button>
    </header>
    <div className={`${panelStyles.scrollBody} publication-body text-sm text-ds-primary`}>{children}</div>
  </ModalDialogShell>;
}

export function UploadLayout({ completed = false, children }: { completed?: boolean; children: ReactNode }) {
  return <div className={`publication-layout${completed ? ' publication-layout-result' : ''}`}>{children}</div>;
}

/** Transfer providers show the current view without uploading a separate cover image. */
export function UploadViewPreview({ url, busy, hasDataset }: {
  url?: string | null; busy: boolean; hasDataset: boolean;
}) {
  return <section className="publication-preview-panel" aria-label="Dataset preview">
    <div className="publication-preview-frame">
      {url ? <img className="publication-preview" src={url} alt="Current dataset view" />
        : <span className="publication-preview-empty text-ds-muted">{busy ? 'Preparing preview…' : hasDataset ? 'Preview unavailable' : 'Load a COLMAP dataset to preview it.'}</span>}
    </div>
    <p className="publication-note">Current view</p>
  </section>;
}

/** Lives inside publication-fields, so every provider uses the same access row. */
export function UploadAccessField({ id, shared, onChange, publicLabel, hint }: {
  id: string; shared: boolean; onChange: (shared: boolean) => void; publicLabel: string; hint: string;
}) {
  return <>
    <label htmlFor={id}>Access</label>
    <div className="publication-access">
      <select id={id} className={`${inputStyles.select} ${inputStyles.selectSizes.sm} w-full min-w-0`}
        value={shared ? 'public' : 'private'} onChange={event => onChange(event.target.value === 'public')} aria-describedby={`${id}-hint`}>
        <option value="private">Private</option>
        <option value="public">{publicLabel}</option>
      </select>
      <p id={`${id}-hint`} className="publication-note">{hint}</p>
    </div>
  </>;
}

export function UploadFormatField({ id, value, onChange }: {
  id: string; value: PublicationFormat; onChange: (value: PublicationFormat) => void;
}) {
  return <>
    <label htmlFor={id}>Format</label>
    <select id={id} className={`${inputStyles.select} ${inputStyles.selectSizes.sm} w-full min-w-0`}
      value={value} onChange={event => onChange(event.target.value === 'zip' ? 'zip' : 'folder')}>
      <option value="folder">Folder</option>
      <option value="zip">ZIP archive (up to 2 GiB)</option>
    </select>
  </>;
}

export function UploadImageFormatField({ id, value, onChange }: {
  id: string; value: PublicationImageFormat; onChange: (value: PublicationImageFormat) => void;
}) {
  return <>
    <label htmlFor={id}>Images</label>
    <div className="publication-access">
      <select id={id} className={`${inputStyles.select} ${inputStyles.selectSizes.sm} w-full min-w-0`}
        value={value} onChange={event => onChange(event.target.value === 'jpeg' ? 'jpeg' : 'original')}
        aria-describedby={value === 'jpeg' ? `${id}-hint` : undefined}>
        <option value="original">Original files</option>
        <option value="jpeg">JPEG ({Math.round(PUBLICATION_JPEG_QUALITY * 100)}% quality)</option>
      </select>
      {value === 'jpeg' && <p id={`${id}-hint`} className="publication-note">Lossy, full resolution. Metadata removed; transparency turns white.</p>}
    </div>
  </>;
}

export function UploadProgress({ label, message, progressLabel, max, value, detail, onCancel, cancelDisabled, children }: {
  label: string; message: string; progressLabel: string; max: number; value: number; detail?: string;
  onCancel: () => void; cancelDisabled?: boolean; children?: ReactNode;
}) {
  const statusRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { statusRef.current?.focus(); }, []);
  return <section className="publication-section" aria-label={label}>
    {children}
    <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite">{message}</p>
    <progress max={Math.max(1, max)} value={value} aria-label={progressLabel} />
    {detail && <p className="publication-note">{detail}</p>}
    <div className="publication-actions"><button type="button" className={secondary} disabled={cancelDisabled} onClick={onCancel}>Cancel upload</button></div>
    <p className="publication-note">Keep this tab open. Reopen this dialog from Share.</p>
  </section>;
}

/** The link to share: the Hub link once it is ready, otherwise the viewer link; then the Hub status. */
function ShareLink({ viewerUrl, hub, providerLink }: { viewerUrl: string; hub?: HubLink; providerLink?: { url: string; label: string } }) {
  const hubState = hub?.enabled && hub.state.viewerUrl === viewerUrl ? hub.state : undefined;
  const link = hubState?.phase === 'ready' && hubState.url ? hubState.url : viewerUrl;
  return <>
    <CopyableField label="Share link" value={link} />
    <div className="publication-result-actions">
      <a className={`${secondary} publication-button-link`} href={link} target="_blank" rel="noopener noreferrer">Open link<span aria-hidden="true"> ↗</span></a>
      {providerLink && <a className={`${secondary} publication-button-link`} href={providerLink.url} target="_blank" rel="noopener noreferrer">
        {providerLink.label}<span aria-hidden="true"> ↗</span>
      </a>}
    </div>
    {hub && hubState && <HubLinkResult state={hubState} onRetry={hub.retry} onDeleteLinkShown={hub.markDeleteLinkSeen} />}
  </>;
}

export function UploadResult({ label, title, notice, viewerUrl, providerLink, hub }: {
  label: string; title: ReactNode; notice?: string; viewerUrl: string;
  providerLink?: { url: string; label: string };
  hub?: HubLink;
}) {
  const titleRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  return <section className="publication-section" aria-label={label}>
    <p ref={titleRef} tabIndex={-1} role="status" className="publication-result-title">
      <span className="publication-result-check" aria-hidden="true">✓ </span>{title}
    </p>
    {notice && <p className="publication-note">{notice}</p>}
    <ShareLink viewerUrl={viewerUrl} hub={hub} providerLink={providerLink} />
  </section>;
}

/** After an edit, a deletion mark or a new dataset resets the result, the last Hub link stays here until the next upload. */
export function PreviousUpload({ hub }: { hub: HubLink }) {
  const { state } = hub;
  if (!hub.enabled || state.phase === 'idle' || !state.viewerUrl) return null;
  return <section className="publication-section" aria-label="Previous upload">
    <h3 className="publication-result-title">Previous upload</h3>
    <ShareLink viewerUrl={state.viewerUrl} hub={hub} />
  </section>;
}
