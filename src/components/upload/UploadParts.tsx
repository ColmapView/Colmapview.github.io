import { useState, type ReactNode } from 'react';
import { copyToClipboard } from '../../utils/clipboard';
import { getButtonClass, inputStyles } from '../../theme';
import './upload.css';

const fieldClass = `${inputStyles.base} ${inputStyles.sizes.sm} w-full min-w-0`;
const secondary = getButtonClass('secondary', 'sm');
const primary = getButtonClass('primary', 'sm');

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
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  return <section className="publication-section" aria-label={label}>
    <p role="status" className="publication-result-title"><span className="publication-result-check" aria-hidden="true">✓ </span>{title}</p>
    <p className="publication-note">{notice}</p>
    <div className="publication-link-row">
      <input className={fieldClass} aria-label={linkLabel} readOnly value={viewerUrl} onFocus={event => event.target.select()} />
      <button type="button" className={primary} onClick={() => { void copyToClipboard(viewerUrl).then(ok => setCopiedUrl(ok ? viewerUrl : null)); }}>
        {copiedUrl === viewerUrl ? 'Copied' : 'Copy'}
      </button>
    </div>
    <div className="publication-result-actions">
      <a className={`${secondary} publication-button-link`} href={viewerUrl} target="_blank" rel="noopener noreferrer">Open viewer<span aria-hidden="true"> ↗</span></a>
      {providerLink && <a className={`${secondary} publication-button-link`} href={providerLink.url} target="_blank" rel="noopener noreferrer">
        {providerLink.label}<span aria-hidden="true"> ↗</span>
      </a>}
    </div>
    <div className="publication-actions"><button type="button" className={secondary} onClick={onReset}>Upload another dataset</button></div>
  </section>;
}
