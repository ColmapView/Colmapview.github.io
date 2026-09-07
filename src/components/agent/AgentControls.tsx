import { useEffect, useId, useState } from 'react';
import { create } from 'zustand';
import { z } from 'zod';
import { featureCatalog, getFeature, type FeatureContract } from '../../features/catalog';
import { executeHumanFeature, undoHumanFeature, useCommandState } from '../../commands/runtime';
import { enableAgentControl, disableAgentControl } from '../../agent/browserBridge';
import { connectMcp, disconnectMcp, useMcpConnection } from '../../agent/mcpConnection';
import { controlPanelStyles as styles, inputStyles, panelStyles } from '../../theme';
import { FloatingWindowShell } from '../ui/FloatingWindowShell';

function FeatureForm({ feature, onResult }: { feature: FeatureContract; onResult: (message: string) => void }) {
  const id = useId();
  const value = feature.read();
  const initial = feature.defaultInput ?? (feature.id === 'dataset.loadUrl' ? { url: '' } : feature.id === 'scene.transform.preview' ? value as Record<string, unknown> : { value });
  const [draft, setDraft] = useState(initial);
  const schema = z.toJSONSchema(feature.input);
  return <form className="space-y-3" onSubmit={event => {
    event.preventDefault();
    const result = executeHumanFeature(feature.id, draft);
    onResult(result.error?.message ?? (feature.completion === 'job_accepted' ? 'Load accepted. Watch loading progress before navigating.' : 'Applied'));
  }}>
    <p className="text-ds-secondary text-sm">{feature.description}</p>
    {Object.entries(schema.properties ?? {}).map(([key, raw]) => {
      const field = raw as { type?: string; enum?: string[]; anyOf?: { type: string }[]; minimum?: number; maximum?: number };
      const nullable = field.anyOf?.some(item => item.type === 'null') ?? false;
      const kind = field.type ?? field.anyOf?.find(item => item.type !== 'null')?.type;
      const title = key === 'value' ? feature.title : key;
      return <div className={styles.row} key={key}>
        <label className={styles.label} htmlFor={`${id}-${key}`}>{title}</label>
        {field.enum || kind === 'boolean' ? <select id={`${id}-${key}`} className={styles.selectRight}
          value={String(draft[key])} onChange={event => setDraft({ ...draft, [key]: kind === 'boolean' ? event.target.value === 'true' : event.target.value })}>
          {(field.enum ?? ['true', 'false']).map(option => <option key={option} value={option}>{option}</option>)}
        </select> : <input id={`${id}-${key}`} className={`${inputStyles.base} ${inputStyles.sizes.sm}`}
          style={{ width: '50%', minWidth: 0 }}
          type={kind === 'number' || kind === 'integer' ? 'number' : 'text'} step={kind === 'integer' ? 1 : 'any'}
          min={field.minimum} max={field.maximum} required={!nullable}
          placeholder={nullable ? key === 'imageId' ? 'None (clear)' : 'Unlimited' : undefined} value={String(draft[key] ?? '')}
          onChange={event => setDraft({ ...draft, [key]: event.target.value === '' && nullable ? null
            : kind === 'number' || kind === 'integer' ? event.target.value === '' ? '' : Number(event.target.value) : event.target.value })} />}
      </div>;
    })}
    <button type="submit" className={styles.actionButton} disabled={!feature.available()}>Apply</button>
    {!feature.available() && <p className="text-ds-muted text-sm">Unavailable while loading or until the required dataset is ready.</p>}
  </form>;
}

const useAgentPanel = create<{ open: boolean }>(() => ({ open: false }));

export function AgentControls() {
  return <div className={styles.actionGroup}>
    <button type="button" className={styles.actionButton} onClick={() => useAgentPanel.setState({ open: true })}>Agent controls</button>
  </div>;
}

// The Settings popover closes on outside interaction. Own its portal independently
// so interacting with the agent dialog cannot unmount the dialog itself.
export function AgentControlDialog() {
  const open = useAgentPanel(state => state.open);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopImmediatePropagation();
      useAgentPanel.setState({ open: false });
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open]);
  const [featureId, setFeatureId] = useState('settings.ui.theme');
  const [transport, setTransport] = useState('');
  const [result, setResult] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const mcp = useMcpConnection();
  const active = useCommandState(state => state.sessionId !== null);
  const revision = useCommandState(state => state.revision);
  const canUndo = useCommandState(state => state.canUndo);
  const activity = useCommandState(state => state.activity);
  const id = useId();
  const feature = getFeature(featureId)!;
  return <>
    <FloatingWindowShell isOpen={open} title="Agent controls" onClose={() => useAgentPanel.setState({ open: false })} portal
      overlayClassName={panelStyles.overlay} overlayStyle={{ zIndex: 10000, paddingTop: active ? 64 : 0 }}
      panelStyle={{ width: 540, maxWidth: 'calc(100vw - 24px)', maxHeight: active ? 'calc(100dvh - 88px)' : 'calc(100dvh - 24px)' }}>
      <div className={`${panelStyles.scrollBody} space-y-3`}>
        <p className="text-ds-secondary text-sm">Allow an agent to load dataset URLs, navigate the camera, select and view images, change settings and preview transforms. Access lasts 30 minutes or until you stop it. Accepted loads continue after Stop and cannot be undone. Local file picking, exports and permanent edits are not available yet.</p>
        <a className={styles.actionButton} href={`${import.meta.env.BASE_URL}agent-guide.html`} target="_blank" rel="noopener noreferrer">Agent connection guide</a>
        <button type="button" className={styles.actionButton} onClick={() => {
          if (active) { disableAgentControl(); setTransport('Agent control stopped.'); }
          else void enableAgentControl().then(setTransport);
        }}>{active ? 'Stop agent control' : 'Enable agent control'}</button>
        <p role="status" className="text-ds-secondary text-sm">{transport}</p>
        <div className={styles.row}>
          <label className={styles.label} htmlFor={`${id}-pair`}>MCP pairing code</label>
          <input id={`${id}-pair`} className={`${inputStyles.base} ${inputStyles.sizes.sm}`} style={{ width: '60%', minWidth: 0 }}
            type="password" autoComplete="off" spellCheck={false} value={pairingCode} maxLength={38}
            onChange={event => setPairingCode(event.target.value.trim())} />
        </div>
        <button type="button" className={styles.actionButton} disabled={mcp.status === 'disconnected' && !pairingCode}
          onClick={() => {
            if (mcp.status !== 'disconnected') { disconnectMcp(); return; }
            try { connectMcp(pairingCode); setPairingCode(''); }
            catch (error) { setTransport(error instanceof Error ? error.message : 'Connection failed.'); }
          }}>{mcp.status === 'connecting' ? 'Cancel connection' : mcp.status === 'connected' ? 'Disconnect MCP' : 'Connect MCP'}</button>
        <p role="status" className="text-ds-secondary text-sm">{mcp.message}</p>
        <p className="text-ds-muted text-sm">Ask your agent for a pairing code, then connect this tab. Connecting enables agent control. Stop revokes both MCP and browser access.</p>
        <div className={styles.row}>
          <label className={styles.label} htmlFor={id}>Feature controls</label>
          <select id={id} className={styles.selectRight} style={{ maxWidth: '65%' }} value={featureId} onChange={event => setFeatureId(event.target.value)}>
            {[...new Set(featureCatalog.map(item => item.group))].map(group => <optgroup key={group} label={group}>
              {featureCatalog.filter(item => item.group === group).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </optgroup>)}
          </select>
        </div>
        <FeatureForm key={`${featureId}-${revision}`} feature={feature} onResult={setResult} />
        <p role="status" className="text-ds-secondary text-sm">{result}</p>
        <button type="button" className={styles.actionButton} disabled={!canUndo} onClick={undoHumanFeature}>Undo last command</button>
        <p className="text-ds-muted text-sm">Other setting changes or dataset changes clear undo history.</p>
        <details>
          <summary className="text-ds-secondary text-sm">Recent activity ({activity.length})</summary>
          <ol className="text-ds-secondary text-sm">
            {activity.slice(-10).reverse().map((item, index) => <li key={`${item.requestId}-${index}`}>{item.actor}: {item.feature} — {item.status}{item.message ? `: ${item.message}` : ''}</li>)}
          </ol>
        </details>
      </div>
    </FloatingWindowShell>
  </>;
}

/** Kept outside Settings so the user can always revoke a live session. */
export function AgentSessionStatus() {
  const active = useCommandState(state => state.sessionId !== null);
  if (!active) return null;
  return <div className={`${panelStyles.surface} p-2 flex items-center gap-2`}
    style={{ position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 10001, width: 'max-content', maxWidth: 'calc(100vw - 16px)' }}>
    <span className="text-ds-primary text-sm">Agent control enabled</span>
    <button type="button" className={styles.actionButton} onClick={disableAgentControl}>Stop agent</button>
  </div>;
}
