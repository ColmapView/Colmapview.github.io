import type { HubPublication, HubLinkState } from '../../features/colmapviewHub/publication';
import { CopyableField } from '../ui/CopyableField';
import { getButtonClass } from '../../theme';

export function HubLinkResult({ state, controller }: { state: HubLinkState; controller: HubPublication }) {
  return <>
    {state.phase === 'creating' && <p role="status">Shortening URL…</p>}
    {state.phase === 'failed' && <div className="publication-access">
      <p role="alert">Upload complete. URL shortening failed: {state.error}</p>
      <div className="publication-actions"><button type="button" className={getButtonClass('secondary', 'sm')}
        onClick={() => { void controller.retry(); }}>Retry shortening</button></div>
    </div>}
    {state.managementUrl && <details className="publication-access"><summary>Manage Hub link</summary>
      <CopyableField label="Hub management link" value={state.managementUrl} />
      <p className="publication-note">Save this private link to remove the short link.</p>
    </details>}
  </>;
}
