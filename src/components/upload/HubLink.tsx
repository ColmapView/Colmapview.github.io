import { useEffect, useRef } from 'react';
import type { HubLinkState } from '../../features/colmapviewHub/publication';
import { CopyableField } from '../ui/CopyableField';
import { getButtonClass } from '../../theme';

const secondary = getButtonClass('secondary', 'sm');

/** The Hub's part of an upload result: progress, the private delete link, or the failure with Retry where Retry can help. */
export function HubLinkResult({ state, onRetry, onDeleteLinkShown }: {
  state: HubLinkState; onRetry: () => void; onDeleteLinkShown: () => void;
}) {
  const statusRef = useRef<HTMLDivElement>(null);
  const deleteRow = state.phase === 'ready' && Boolean(state.managementUrl);
  useEffect(() => { if (deleteRow) onDeleteLinkShown(); }, [deleteRow, onDeleteLinkShown]);
  const reason = state.error && /[.!?]$/.test(state.error) ? state.error : `${state.error ?? ''}.`;
  return <div ref={statusRef} tabIndex={-1} className="publication-access">
    {state.phase === 'checking' && <p role="status" className="publication-note">Checking public access…</p>}
    {state.phase === 'creating' && <p role="status" className="publication-note">Creating Hub link…</p>}
    {deleteRow && <>
      <p className="publication-note">{"Private delete link (don't share)"}</p>
      <CopyableField label="Private delete link" value={state.managementUrl!} />
      <div className="publication-actions">
        <a className={`${secondary} publication-button-link`} href={state.managementUrl} target="_blank" rel="noopener noreferrer">
          Delete Hub link<span aria-hidden="true"> ↗</span>
        </a>
      </div>
    </>}
    {state.phase === 'failed' && <>
      <p role="alert" className="text-ds-error">Hub link not created: {reason} The link above still works.</p>
      {state.retryable && <div className="publication-actions">
        <button type="button" className={secondary} disabled={state.retryAfter !== undefined}
          onClick={() => { onRetry(); statusRef.current?.focus(); }}>Retry Hub link</button>
      </div>}
    </>}
  </div>;
}
