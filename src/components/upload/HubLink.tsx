import { useEffect, useRef } from 'react';
import type { HubLinkState } from '../../features/colmapviewHub/publication';
import { getButtonClass } from '../../theme';

const secondary = getButtonClass('secondary', 'sm');

/** Hub progress and failures with Retry where Retry can help. */
export function HubLinkResult({ state, onRetry }: {
  state: HubLinkState; onRetry: () => void;
}) {
  // After Retry, focus follows the Hub status line, which React replaces as the phase changes.
  const statusRef = useRef<HTMLParagraphElement>(null);
  const focusStatus = useRef(false);
  useEffect(() => {
    if (!focusStatus.current || !statusRef.current) return;
    statusRef.current.focus();
    focusStatus.current = false;
  });
  const reason = state.error && /[.!?]$/.test(state.error) ? state.error : `${state.error ?? ''}.`;
  const status: { text: string; role: 'status' | 'alert'; className: string } | null =
    state.phase === 'checking' ? { text: 'Checking public access…', role: 'status', className: 'publication-note' }
      : state.phase === 'creating' ? { text: 'Creating Hub link…', role: 'status', className: 'publication-note' }
        : state.phase === 'failed' ? { text: `Hub link not created: ${reason} The link above still works.`, role: 'alert', className: 'text-ds-error' }
          : null;
  if (!status) return null;
  return <div className="publication-access">
    {/* Keyed by phase, so each status is a new line that assistive technology announces. */}
    <p key={state.phase} ref={statusRef} tabIndex={-1} role={status.role} className={status.className}>{status.text}</p>
    {state.phase === 'failed' && state.retryable && <div className="publication-actions">
      <button type="button" className={secondary} disabled={state.coolingDown}
        onClick={() => { focusStatus.current = true; statusRef.current?.focus(); onRetry(); }}>Retry Hub link</button>
    </div>}
  </div>;
}
