import { useEffect, useRef } from 'react';
import type { HubLinkState } from '../../features/colmapviewHub/publication';
import { CopyableField } from '../ui/CopyableField';
import { getButtonClass } from '../../theme';

const secondary = getButtonClass('secondary', 'sm');

/** The Hub's part of an upload result: progress, the private delete link, or the failure with Retry where Retry can help. */
export function HubLinkResult({ state, onRetry, onDeleteLinkShown }: {
  state: HubLinkState; onRetry: () => void; onDeleteLinkShown: () => void;
}) {
  // After Retry, focus follows the Hub status line, which React replaces as the phase changes.
  const statusRef = useRef<HTMLParagraphElement>(null);
  const focusStatus = useRef(false);
  const deleteRow = state.phase === 'ready' && Boolean(state.managementUrl);
  useEffect(() => { if (deleteRow) onDeleteLinkShown(); }, [deleteRow, onDeleteLinkShown]);
  useEffect(() => {
    if (!focusStatus.current || !statusRef.current) return;
    statusRef.current.focus();
    focusStatus.current = false;
  });
  const reason = state.error && /[.!?]$/.test(state.error) ? state.error : `${state.error ?? ''}.`;
  return <div className="publication-access">
    {state.phase === 'checking' && <p ref={statusRef} tabIndex={-1} role="status" className="publication-note">Checking public access…</p>}
    {state.phase === 'creating' && <p ref={statusRef} tabIndex={-1} role="status" className="publication-note">Creating Hub link…</p>}
    {deleteRow && <>
      <p ref={statusRef} tabIndex={-1} className="publication-note">{"Private delete link (don't share)"}</p>
      <CopyableField label="Private delete link" value={state.managementUrl!} />
      <div className="publication-actions">
        <a className={`${secondary} publication-button-link`} href={state.managementUrl} target="_blank" rel="noopener noreferrer">
          Delete Hub link<span aria-hidden="true"> ↗</span>
        </a>
      </div>
    </>}
    {state.phase === 'failed' && <>
      <p ref={statusRef} tabIndex={-1} role="alert" className="text-ds-error">Hub link not created: {reason} The link above still works.</p>
      {state.retryable && <div className="publication-actions">
        <button type="button" className={secondary} disabled={state.retryAfter !== undefined}
          onClick={() => { focusStatus.current = true; statusRef.current?.focus(); onRetry(); }}>Retry Hub link</button>
      </div>}
    </>}
  </div>;
}
