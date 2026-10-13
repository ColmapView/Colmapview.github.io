import type { HubPublication, HubLinkState } from '../../features/colmapviewHub/publication';
import type { HubLink } from './useHubLink';
import { CopyableField } from '../ui/CopyableField';
import { getButtonClass } from '../../theme';

export function HubLinkOptions({ hub, publicAccess, uncertain = false }: { hub: HubLink; publicAccess: boolean; uncertain?: boolean }) {
  if (!publicAccess && !uncertain) return null;
  return <div className="publication-hub-options">
    <p className="publication-note">{uncertain ? 'Publicly readable uploads receive a short link automatically. Private uploads keep their original link.' : 'Public uploads receive a short link automatically. Its metadata and preview are public to anyone with the link.'}</p>
    <label><input type="checkbox" checked={hub.listed} onChange={event => hub.setListed(event.target.checked)} />List on Hub</label>
  </div>;
}

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
      <p className="publication-note">Save this private link to remove the Hub link and its listing.</p>
    </details>}
  </>;
}
