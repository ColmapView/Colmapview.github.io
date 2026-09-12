import { inputStyles } from '../../theme';
import type { TrainingWindowState } from './useTrainingStoreFacade';

export function TrainingSetup({ state }: { state: TrainingWindowState }) {
  const { serverUrl, token, connected, connectionError, setServerUrl, setToken, authenticationMode, tokenRequired } = state;
  return <div className="training-window-stack">
    <label className="training-window-row text-sm text-ds-secondary">
      <span className="flex items-center gap-2">Server
        <span role="status" aria-label={connected && !connectionError ? 'Connected' : 'Unavailable'}
          title={connected && !connectionError ? 'Connected' : 'Unavailable'}
          className={connected && !connectionError ? 'text-ds-success' : 'text-ds-warning'}>
          <span aria-hidden="true">{connected && !connectionError ? '●' : '○'}</span>
        </span>
      </span>
      <input aria-label="Server URL" className={`${inputStyles.base} ${inputStyles.sizes.sm} w-full`} value={serverUrl}
        type="url" spellCheck={false} onChange={event => setServerUrl(event.target.value)} />
    </label>
    {(authenticationMode === 'bearer' || tokenRequired) && <label className="training-window-row text-sm text-ds-secondary">
      <span>Token</span>
      <input aria-label="Session token" className={`${inputStyles.base} ${inputStyles.sizes.sm} w-full`} value={token}
        type="password" autoComplete="off" onChange={event => setToken(event.target.value)} />
    </label>}
    {connectionError && <div className="training-window-row">
      <p role="status" className="training-window-row-value text-xs text-ds-warning">{connectionError}</p>
    </div>}
  </div>;
}
