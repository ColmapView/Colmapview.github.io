import { useCallback } from 'react';
import { useReconstructionStore, useTrainingStore, useUIStore, selectPointCount } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import type { useTrainingSessionActions } from '../../training';
import { selectTrainingSplatDisplay } from '../../training/useTrainingPreviewStoreFacade';

export type TrainingWindowState = ReturnType<typeof useTrainingDockStoreFacade>;
export type TrainingWindowActions = ReturnType<typeof useTrainingSessionActions>;
export type TrainingActionRunner = (action: () => Promise<unknown>) => void;

/** UI subscriptions stay separate from transfer/session authority. */
export function useTrainingDockStoreFacade() {
  const state = useTrainingStore(useShallow((s) => ({
    dockOpen: s.dockOpen, serverUrl: s.serverUrl, token: s.token,
    authenticationMode: s.authenticationMode, tokenRequired: s.tokenRequired,
    settingsDraft: s.settingsDraft, settingsErrors: s.settingsErrors,
    attemptRecipe: s.attemptRecipe, legacyAttempt: s.legacyAttempt, admissionPending: s.admissionPending,
    attemptClientLabel: s.attemptClientLabel, attemptServerUrl: s.attemptServerUrl,
    setSettingsDraft: s.setSettingsDraft, setSettingsErrors: s.setSettingsErrors,
    connected: s.connected, connectionError: s.connectionError, operationError: s.operationError, config: s.config,
    phase: s.phase, currentJob: s.currentJob, upload: s.upload,
    previewEnabled: s.previewEnabled,
    setDockOpen: s.setDockOpen, setServerUrl: s.setServerUrl, setToken: s.setToken,
    setPreviewEnabled: s.setPreviewEnabled,
    snapshotAssociation: s.currentJob ? s.snapshotAssociations[s.currentJob.client_snapshot_id] ?? null : null,
    previewError: s.previewError, finalLoadedJobId: s.finalLoadedJobId,
    previewUpdatedAt: s.previewUpdatedAt, previewCapturedAt: s.previewCapturedAt,
    previewShownSplats: s.previewShownSplats, previewTotalSplats: s.previewTotalSplats,
    attemptSnapshotId: s.attemptSnapshotId,
    snapshotAvailable: Boolean(s.snapshot), datasetId: s.datasetId,
    resetAttempt: s.resetAttempt, clientLabel: s.clientLabel,
  })));
  const reconstruction = useReconstructionStore((s) => s.reconstruction);
  const pointCount = useReconstructionStore(selectPointCount);
  const touchMode = useUIStore((s) => s.touchMode);
  const storeSetPreviewEnabled = state.setPreviewEnabled;
  // Switching the live preview on hands the viewport to it, as admission does.
  const setPreviewEnabled = useCallback((enabled: boolean) => {
    if (enabled) selectTrainingSplatDisplay();
    storeSetPreviewEnabled(enabled);
  }, [storeSetPreviewEnabled]);
  return { ...state, setPreviewEnabled, reconstruction, pointCount, touchMode };
}

export function useTrainingToggleStoreFacade() {
  const open = useTrainingStore((s) => s.dockOpen);
  const setOpen = useTrainingStore((s) => s.setDockOpen);
  const embedMode = useUIStore((s) => s.embedMode);
  return { open, setOpen, embedMode };
}
