import { useShallow } from 'zustand/react/shallow';
import { useTrainingStore } from '../store/stores/trainingStore';
import { supportsTrainingGeometryPreview } from './trainingPreviewFormat';

/** Reactive projection of the single app session owner. Files/resources stay imperative. */
export function useTrainingSessionState() {
  return useTrainingStore(useShallow(state => ({
    serverUrl: state.serverUrl, token: state.token, dockOpen: state.dockOpen,
    authenticationMode: state.authenticationMode, tokenRequired: state.tokenRequired,
    currentJobId: state.currentJobId, currentJob: state.currentJob,
    previewEnabled: state.previewEnabled,
    requestsEnabled: state.requestsEnabled, connectionGeneration: state.connectionGeneration,
    supportsGeometryPreview: supportsTrainingGeometryPreview(state.config?.backend.preview_formats),
  })));
}

export function useTrainingSessionStoreActions() {
  return useTrainingStore(useShallow(state => ({
    setAuthentication: state.setAuthentication, setConnected: state.setConnected,
    setConfig: state.setConfig, setPhase: state.setPhase,
    setSnapshot: state.setSnapshot, setDatasetId: state.setDatasetId, setSubmissionKey: state.setSubmissionKey,
    setCurrentJob: state.setCurrentJob, setQueue: state.setQueue, setUpload: state.setUpload,
    setSettingsErrors: state.setSettingsErrors, setAttemptRecipe: state.setAttemptRecipe,
     setPreview: state.setPreview,
  })));
}
