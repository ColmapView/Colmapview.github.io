import { useCallback, useState } from 'react';
import { useTrainingSessionActions } from '../../training';
import { TrainingAction } from './TrainingAction';
import { TrainingSetup } from './TrainingSetup';
import { TrainingActivity } from './TrainingActivity';
import { useTrainingDockStoreFacade } from './useTrainingStoreFacade';

/** The app-mounted session keeps running when the hover panel closes. */
export function TrainingPanel() {
  const state = useTrainingDockStoreFacade();
  const actions = useTrainingSessionActions();
  const [actionError, setActionError] = useState<string | null>(null);
  const { operationError } = state;
  const run = useCallback((action: () => Promise<unknown>) => {
    setActionError(null);
    void action().catch((error: unknown) => setActionError(error instanceof Error ? error.message : 'Action failed.'));
  }, []);
  return <div id="training-panel" className="training-panel" onKeyDown={event => {
    if (event.key !== 'Escape') event.stopPropagation();
  }}>
    <div className="training-window-body text-sm text-ds-secondary">
      <div className="training-window-stack">
        <TrainingSetup state={state} />
        {(actionError || operationError) && <div className="training-window-row training-window-detail-row">
          <span>Error</span><p role="alert" className="text-ds-error">{actionError || operationError}</p>
        </div>}
        {(state.currentJob || state.phase !== 'idle' || state.upload) &&
          <TrainingActivity state={state} />}
        {!state.reconstruction && <p className="text-xs text-ds-muted">Load a reconstruction to train.</p>}
      </div>
    </div>
    <div className="training-window-action">
      <TrainingAction state={state} actions={actions} onAction={run} />
    </div>
  </div>;
}
