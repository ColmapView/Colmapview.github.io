import { useId, type ReactNode } from 'react';
import { ModalDialogShell } from '../ui/ModalDialogShell';
import { CloseIcon } from '../../icons';
import { CopyableField } from '../ui/CopyableField';
import { getButtonClass, inputStyles, modalStyles, panelStyles, Z_INDEX } from '../../theme';
import type { PublicationFormat } from '../../features/datasetPublishing/types';
import './upload.css';

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

export function UploadProgress({ label, message, progressLabel, max, value, detail, onCancel, cancelDisabled, children }: {
  label: string; message: string; progressLabel: string; max: number; value: number; detail?: string;
  onCancel: () => void; cancelDisabled?: boolean; children?: ReactNode;
}) {
  return <section className="publication-section" aria-label={label}>
    {children}
    <p role="status" aria-live="polite">{message}</p>
    <progress max={Math.max(1, max)} value={value} aria-label={progressLabel} />
    {detail && <p className="publication-note">{detail}</p>}
    <div className="publication-actions"><button type="button" className={secondary} disabled={cancelDisabled} onClick={onCancel}>Cancel upload</button></div>
    <p className="publication-note">Keep this tab open. Reopen this dialog from Share.</p>
  </section>;
}

export function UploadResult({ label, title, notice, viewerUrl, linkLabel = 'Viewer link', providerLink, onReset }: {
  label: string; title: ReactNode; notice: string; viewerUrl: string; linkLabel?: string;
  providerLink?: { url: string; label: string }; onReset: () => void;
}) {
  return <section className="publication-section" aria-label={label}>
    <p role="status" className="publication-result-title"><span className="publication-result-check" aria-hidden="true">✓ </span>{title}</p>
    <p className="publication-note">{notice}</p>
    <CopyableField label={linkLabel} value={viewerUrl} />
    <div className="publication-result-actions">
      <a className={`${secondary} publication-button-link`} href={viewerUrl} target="_blank" rel="noopener noreferrer">Open viewer<span aria-hidden="true"> ↗</span></a>
      {providerLink && <a className={`${secondary} publication-button-link`} href={providerLink.url} target="_blank" rel="noopener noreferrer">
        {providerLink.label}<span aria-hidden="true"> ↗</span>
      </a>}
    </div>
    <div className="publication-actions"><button type="button" className={secondary} onClick={onReset}>Upload another dataset</button></div>
  </section>;
}
