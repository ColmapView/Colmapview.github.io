import { useState } from 'react';
import { controlPanelStyles } from '../../theme';
import type { TrainingActionRunner, TrainingWindowActions, TrainingWindowState } from './useTrainingStoreFacade';

export function TrainingAction({ state, actions, onAction }: {
  state: TrainingWindowState;
  actions: TrainingWindowActions;
  onAction: TrainingActionRunner;
}) {
  const [pending, setPending] = useState(false);
  const disabled = pending || !state.reconstruction || !state.serverUrl.trim()
    || Boolean(state.connected && !state.config?.backend.available);
  return <button type="button" disabled={disabled} aria-busy={pending}
    title="Stop the current run, upload the current dataset, and start fresh training"
    className={disabled ? controlPanelStyles.actionButtonPrimaryDisabled : controlPanelStyles.actionButtonPrimary}
    onClick={() => onAction(async () => {
      setPending(true);
      try { await actions.startFresh(); } finally { setPending(false); }
    })}>Start</button>;
}
