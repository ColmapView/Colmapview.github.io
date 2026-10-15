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
  const status: { text: string; role?: 'status' | 'alert'; className: string } | null =
    state.phase === 'checking' ? { text: 'Checking public access…', role: 'status', className: 'publication-note' }
      : state.phase === 'creating' ? { text: 'Creating Hub link…', role: 'status', className: 'publication-note' }
        : deleteRow ? { text: "Private delete link (don't share)", className: 'publication-note' }
          : state.phase === 'failed' ? { text: `Hub link not created: ${reason} The link above still works.`, role: 'alert', className: 'text-ds-error' }
            : null;
  return <div className="publication-access">
    {/* Keyed by phase, so each status is a new line that assistive technology announces. */}
    {status && <p key={state.phase} ref={statusRef} tabIndex={-1} role={status.role} className={status.className}>{status.text}</p>}
    {deleteRow && <>
      <CopyableField label="Private delete link" value={state.managementUrl!} />
      <div className="publication-actions">
        <a className={`${secondary} publication-button-link`} href={state.managementUrl} target="_blank" rel="noopener noreferrer">
          Delete Hub link<span aria-hidden="true"> ↗</span>
        </a>
      </div>
    </>}
    {state.phase === 'failed' && state.retryable && <div className="publication-actions">
      <button type="button" className={secondary} disabled={state.coolingDown}
        onClick={() => { focusStatus.current = true; statusRef.current?.focus(); onRetry(); }}>Retry Hub link</button>
    </div>}
  </div>;
}
