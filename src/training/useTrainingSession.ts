import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { getDatasetManager } from '../dataset';
import { usePointCloudStore, useReconstructionStore, useTrainingStore } from '../store';
import {
  createTrainingSnapshot,
  isSnapshotForCurrentReconstruction,
  isSourceIdForCurrentReconstruction,
  restoreRuntimeSnapshotSource,
  TrainingApiError,
  TrainingClient,
} from '.';
import { isLoopbackTrainingUrl, skipUnavailableDirectoryMasks, validateTrainingSettings } from './trainingSettings';
import { recipeSelectionFromResolution } from './types';
import type {
  TrainingConfig,
  TrainingDatasetStatus,
  TrainingJob,
  TrainingResolvedRecipe,
  TrainingSessionPhase,
  TrainingSettings,
} from './types';
import { trainingPreviewController } from './previewController';
import { loadTrainingResult } from './trainingResult';
import { beginTrainingTiming, observeTrainingMilestone, observeTrainingProgress } from './trainingTiming';
import { supportsTrainingGeometryPreview } from './trainingPreviewFormat';
import { abortableDelay, prepareExistingDataset, TrainingSourceUnavailableError } from './trainingTransfer';
import { useTrainingSessionState, useTrainingSessionStoreActions } from './useTrainingSessionStoreFacade';

const POLL_MS = 1000;
type TrainingSessionActions = ReturnType<typeof useTrainingSession>;
const TrainingSessionContext = createContext<TrainingSessionActions | null>(null);

function isTerminal(state: TrainingJob['state']): boolean {
  return state === 'succeeded' || state === 'failed' || state === 'cancelled';
}

function errorName(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('name' in error)) return null;
  return typeof error.name === 'string' ? error.name : null;
}

function abortError(error: unknown): boolean {
  return errorName(error) === 'AbortError';
}

function displayedJobPhase(job: TrainingJob): TrainingSessionPhase {
  return job.phase === 'preparing' || job.phase === 'training' ? job.phase : job.state;
}

function validateServiceUrl(serverUrl: string): void {
  let url: URL;
  try { url = new URL(serverUrl); } catch { throw new Error('Enter a valid training server URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('The training server must use HTTP or HTTPS.');
  if (!isLoopbackTrainingUrl(serverUrl) && url.protocol !== 'https:') {
    throw new Error('Remote training servers require HTTPS and bearer authentication.');
  }
}

function assertSupportedApiVersion(config: TrainingConfig): void {
  if (config.api_version.split('.')[0] !== '1') {
    throw new Error(`Unsupported API version ${config.api_version}`);
  }
}

function startupRecipe(config: TrainingConfig): TrainingResolvedRecipe {
  return {
    base_recipe_id: config.recipe_id,
    recipe_id: config.recipe_id,
    settings_schema_version: config.editable_settings?.schema_version ?? 0,
    settings: {},
    effective_settings: {},
    recipe_summary: config.recipe_summary,
    input_requirements: config.input_requirements,
  };
}

function settingsMatch(left: TrainingSettings, right: TrainingSettings): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && Object.is(left[key], right[key]));
}

function usesRecipeSelection(recipe: TrainingResolvedRecipe | null): recipe is TrainingResolvedRecipe {
  return Boolean(recipe && recipe.settings_schema_version > 0);
}

type RecipeProjection = Pick<TrainingResolvedRecipe, 'recipe_summary' | 'input_requirements' | 'settings' | 'effective_settings'> & {
  base_recipe_id: string | null;
  recipe_id: string | null;
  settings_schema_version: number | null;
};

function recipeFromProjection(dataset: RecipeProjection): TrainingResolvedRecipe | null {
  if (!dataset.base_recipe_id || !dataset.recipe_id || dataset.settings_schema_version == null) return null;
  return {
    base_recipe_id: dataset.base_recipe_id,
    recipe_id: dataset.recipe_id,
    settings_schema_version: dataset.settings_schema_version,
    settings: dataset.settings,
    effective_settings: dataset.effective_settings,
    recipe_summary: dataset.recipe_summary,
    input_requirements: dataset.input_requirements,
  };
}

function assertDatasetRecipe(
  dataset: Pick<TrainingDatasetStatus, 'base_recipe_id' | 'recipe_id' | 'settings_schema_version' | 'settings'>,
  recipe: TrainingResolvedRecipe,
  requireEnvelope: boolean,
): void {
  if (requireEnvelope && dataset.recipe_id !== recipe.recipe_id) {
    throw new Error('The dataset recipe does not match this preparation attempt.');
  }
  if (!requireEnvelope && dataset.recipe_id != null && dataset.recipe_id !== recipe.recipe_id) {
    throw new Error('The dataset recipe does not match this preparation attempt.');
  }
  if (requireEnvelope && (dataset.base_recipe_id !== recipe.base_recipe_id
    || dataset.settings_schema_version !== recipe.settings_schema_version
    || !settingsMatch(dataset.settings, recipe.settings))) {
    throw new Error('The server did not preserve the resolved settings for this dataset.');
  }
}

function resolutionErrors(error: unknown): Record<string, string> {
  if (!(error instanceof TrainingApiError)) return {};
  return Object.fromEntries(error.issues.map((issue) => {
    const key = issue.field.startsWith('settings.') ? issue.field.slice('settings.'.length) : issue.field;
    return [key, issue.detail ?? issue.code.replaceAll('_', ' ')];
  }));
}

/** App-mounted session controller; closing the hover panel does not cancel its work. */
export function useTrainingSession() {
  const { serverUrl, token, dockOpen, currentJobId, currentJob, previewEnabled,
    authenticationMode, requestsEnabled, connectionGeneration,
    supportsGeometryPreview } = useTrainingSessionState();
  const actions = useTrainingSessionStoreActions();
  const abortRef = useRef<AbortController | null>(null);
  const startingRef = useRef(false);
  const restartingRef = useRef(false);
  const admittingRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const probedRef = useRef(false);
  const connectionAbortRef = useRef(new AbortController());
  const refreshSequenceRef = useRef(0);
  const refreshFlightRef = useRef<{ key: string; promise: Promise<boolean> } | null>(null);
  const autoLoadedArtifactKeysRef = useRef(new Set<string>());
  const selectSequenceRef = useRef(0);
  const anonymousClient = useMemo(() => new TrainingClient({ baseUrl: serverUrl }), [serverUrl]);
  const bearerClient = useMemo(() => new TrainingClient({ baseUrl: serverUrl, token }), [serverUrl, token]);
  const client = authenticationMode === 'local' ? anonymousClient : bearerClient;

  const inspectConnection = useCallback(async (signal: AbortSignal) => {
    validateServiceUrl(serverUrl);
    const health = await anonymousClient.health(signal);
    const advertised = health.authentication;
    if (advertised?.mode === 'local') {
      if (advertised.token_required || !isLoopbackTrainingUrl(serverUrl)) {
        throw new Error('The server advertised an unsafe local authentication configuration.');
      }
      const config = await anonymousClient.config(signal);
      assertSupportedApiVersion(config);
      return { health, config, mode: 'local' as const, tokenRequired: false,
        requestClient: anonymousClient };
    }
    if (advertised?.mode === 'bearer') {
      if (!advertised.token_required) throw new Error('The server advertised an invalid bearer authentication configuration.');
      if (!token) {
        useTrainingStore.setState({ authenticationMode: 'bearer', tokenRequired: true });
        throw new Error('This training server requires a bearer token.');
      }
      const config = await bearerClient.config(signal);
      assertSupportedApiVersion(config);
      return { health, config, mode: 'bearer' as const, tokenRequired: true,
        requestClient: bearerClient };
    }
    // Compatibility with the first API v1 implementation: health was public
    // but omitted authentication metadata, so config remains the auth probe.
    if (!isLoopbackTrainingUrl(serverUrl) && !token) {
      useTrainingStore.setState({ authenticationMode: 'bearer', tokenRequired: true });
      throw new Error('Remote training servers require a bearer token.');
    }
    try {
      const config = await bearerClient.config(signal);
      assertSupportedApiVersion(config);
      const mode = token ? 'bearer' as const : 'local' as const;
      return { health, config, mode, tokenRequired: Boolean(token), requestClient: bearerClient };
    } catch (error) {
      if (error instanceof TrainingApiError && error.status === 401) {
        useTrainingStore.setState({ authenticationMode: 'bearer', tokenRequired: true });
        throw new Error('This training server requires a bearer token.');
      }
      throw error;
    }
  }, [anonymousClient, bearerClient, serverUrl, token]);

  useEffect(() => useTrainingStore.subscribe((state, previous) => {
    if (state.connectionGeneration !== previous.connectionGeneration) {
      connectionAbortRef.current.abort();
      connectionAbortRef.current = new AbortController();
      abortRef.current?.abort();
    }
  }), []);
  const scope = useCallback(() => {
    const generation = useTrainingStore.getState().connectionGeneration;
    const isCurrent = () => {
      const state = useTrainingStore.getState();
      return state.connectionGeneration === generation && state.serverUrl === serverUrl && state.token === token && state.requestsEnabled;
    };
    return { isCurrent, signal: connectionAbortRef.current.signal };
  }, [serverUrl, token]);

  const connect = useCallback(async () => {
    useTrainingStore.setState(state => ({ requestsEnabled: true, connectionGeneration: state.connectionGeneration + 1 }));
    const owner = scope();
    const isCurrent = owner.isCurrent;
    try {
      const signal = AbortSignal.any([owner.signal, AbortSignal.timeout(5000)]);
      const { health, config, mode, tokenRequired } = await inspectConnection(signal);
      if (!isCurrent()) return;
      const instance = typeof health.instance_id === 'string' ? health.instance_id : null;
      if (instance !== useTrainingStore.getState().serverInstanceId) {
        useTrainingStore.setState({ queue: null, serverInstanceId: instance });
      }
      actions.setAuthentication(mode, tokenRequired);
      actions.setConfig(config);
      actions.setConnected(true);
    } catch (error) {
      if (!isCurrent()) return;
      useTrainingStore.setState({ requestsEnabled: false });
      actions.setConnected(false, error instanceof Error ? error.message : 'Could not connect');
      if (useTrainingStore.getState().currentJobId) actions.setPhase('disconnected');
    }
  }, [actions, inspectConnection, scope]);

  useEffect(() => {
    if (!dockOpen || probedRef.current) return;
    probedRef.current = true;
    void connect();
  }, [connect, dockOpen]);

  useEffect(() => useReconstructionStore.subscribe(() => {
    const state = useTrainingStore.getState();
    const snapshot = state.snapshot;
    const snapshotInvalid = Boolean(snapshot && !isSnapshotForCurrentReconstruction(snapshot));
    const retainedAssociations = Object.fromEntries(Object.entries(state.snapshotAssociations)
      .filter(([, association]) => isSourceIdForCurrentReconstruction(association.sourceId)));
    const associationInvalid = Object.keys(retainedAssociations).length !== Object.keys(state.snapshotAssociations).length;
    if (snapshotInvalid || associationInvalid) {
      // Do not permit a source replacement to turn an in-flight lazy reader
      // into an upload of the replacement reconstruction.
      abortRef.current?.abort();
      trainingPreviewController.setTarget(null);
      useTrainingStore.setState({
        previewActive: false,
        snapshot: snapshotInvalid ? null : snapshot,
        snapshotAssociations: retainedAssociations,
      });
      actions.setPreview(null, null);
    }
  }), [actions]);

  const refreshImpl = useCallback(async (signal?: AbortSignal) => {
    const owner = scope();
    if (!owner.isCurrent()) return false;
    const sequence = ++refreshSequenceRef.current;
    const selection = useTrainingStore.getState().selectionGeneration;
    const selectedId = useTrainingStore.getState().currentJobId;
    const requestSignal = AbortSignal.any([owner.signal, signal ?? AbortSignal.timeout(10000)]);
    const ownsRefresh = () => owner.isCurrent() && sequence === refreshSequenceRef.current;
    const isCurrent = () => ownsRefresh() && !requestSignal.aborted;
    try {
      let requestClient = client;
      if (!useTrainingStore.getState().connected) {
        const connection = await inspectConnection(requestSignal);
        const { health, config, mode, tokenRequired } = connection;
        if (!isCurrent()) return false;
        requestClient = connection.requestClient;
        const instance = typeof health.instance_id === 'string' ? health.instance_id : null;
        if (instance !== useTrainingStore.getState().serverInstanceId) {
          useTrainingStore.setState({ queue: null, serverInstanceId: instance });
        }
        actions.setAuthentication(mode, tokenRequired);
        actions.setConfig(config);
      }
      const attempt = useTrainingStore.getState();
      let selectedJobMissing = false;
      const [job, dataset] = await Promise.all([
        selectedId ? requestClient.job(selectedId, requestSignal).catch((error: unknown) => {
          if (error instanceof TrainingApiError && error.status === 404) {
            selectedJobMissing = true;
            return null;
          }
          throw error;
        }) : Promise.resolve(null),
        !selectedId && attempt.datasetId && attempt.attemptServerUrl === serverUrl && attempt.cancellationPending
          ? requestClient.dataset(attempt.datasetId, requestSignal) : Promise.resolve(null),
      ]);
      const state = useTrainingStore.getState();
      if (!isCurrent()) return false;
      if (selectedJobMissing && state.currentJobId === selectedId && state.selectionGeneration === selection) {
        actions.setCurrentJob(null);
        useTrainingStore.getState().resetAttempt();
      }
      if (dataset && state.datasetId === dataset.dataset_id && dataset.state === 'cancelled') actions.setPhase('cancelled');
      if (job && !state.attemptRecipe && state.datasetId === job.dataset_id
        && state.attemptSnapshotId === job.client_snapshot_id) {
        const recoveredRecipe = recipeFromProjection(job);
        if (recoveredRecipe) actions.setAttemptRecipe(recoveredRecipe);
      }
      if (job && state.currentJobId === selectedId && state.selectionGeneration === selection
        && !(state.currentJob && isTerminal(state.currentJob.state) && !isTerminal(job.state))
        && !(state.phase === 'cancelling' && !['cancelling', 'cancelled', 'failed', 'succeeded'].includes(job.state))) {
        actions.setCurrentJob(job);
        actions.setPhase(displayedJobPhase(job));
        observeTrainingProgress(job.job_id, job.progress?.optimizer_step);
      }
      actions.setConnected(true);
      return true;
    } catch (error) {
      if (!ownsRefresh()) return false;
      // Poll teardown, unmount and connection supersession use AbortError and
      // are intentionally silent. A current request's timeout is a real
      // connectivity failure even though the composed signal is aborted.
      const abortReason = requestSignal.aborted ? requestSignal.reason : error;
      if (abortError(abortReason)) return false;
      if (requestSignal.aborted && errorName(abortReason) !== 'TimeoutError') return false;
      actions.setConnected(false, error instanceof Error ? error.message : 'Could not connect');
      if (useTrainingStore.getState().currentJobId) actions.setPhase('disconnected');
      return false;
    }
  }, [actions, client, inspectConnection, scope, serverUrl]);
  const refresh = useCallback((signal?: AbortSignal) => {
    const state = useTrainingStore.getState();
    const key = `${state.connectionGeneration}:${state.selectionGeneration}`;
    if (refreshFlightRef.current?.key === key) return refreshFlightRef.current.promise;
    const promise = refreshImpl(signal);
    refreshFlightRef.current = { key, promise };
    void promise.finally(() => { if (refreshFlightRef.current?.promise === promise) refreshFlightRef.current = null; });
    return promise;
  }, [refreshImpl]);

  useEffect(() => {
    if (!requestsEnabled || (!dockOpen && !currentJobId)) return;
    const abort = new AbortController();
    let timer: number | undefined;
    let delay = POLL_MS;
    const poll = async () => {
      const ok = await refresh(AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]));
      delay = ok ? POLL_MS : Math.min(30000, delay * 2);
      if (!abort.signal.aborted) timer = window.setTimeout(poll, delay);
    };
    void poll();
    return () => { abort.abort(); window.clearTimeout(timer); };
  }, [currentJobId, dockOpen, refresh, requestsEnabled, connectionGeneration]);

  useEffect(() => () => { abortRef.current?.abort(); connectionAbortRef.current.abort(); }, []);

  useEffect(() => {
    const initial = useTrainingStore.getState();
    if (initial.finalLoadedJobId === currentJobId) return;
    const jobSnapshotId = currentJob?.client_snapshot_id;
    const association = jobSnapshotId ? initial.snapshotAssociations[jobSnapshotId] : null;
    if (!supportsGeometryPreview || !currentJobId || !association
      || !isSourceIdForCurrentReconstruction(association.sourceId)) {
      trainingPreviewController.setTarget(null);
      useTrainingStore.setState({ previewActive: false });
      return;
    }
    useTrainingStore.setState({ previewActive: true, previewError: null });
    let firstFrame = true;
    let active = true;
    trainingPreviewController.setTarget({
      jobId: currentJobId,
      snapshotId: association.id,
      fetch: (etag, signal) => client.preview(currentJobId, etag, signal),
      isCurrent: () => {
        const state = useTrainingStore.getState();
        return state.currentJobId === currentJobId
          && state.snapshotAssociations[jobSnapshotId!] === association
          && state.previewActive && supportsTrainingGeometryPreview(state.config?.backend.preview_formats)
          && isSourceIdForCurrentReconstruction(association.sourceId);
      },
      onFrame: (frame) => {
        // The controller calls this only after the renderer commits the frame.
        observeTrainingMilestone(currentJobId, 'first_preview_displayed');
        const refreshFirstStatus = firstFrame;
        firstFrame = false;
        useTrainingStore.setState({
          previewUpdatedAt: Date.now(), previewCapturedAt: frame.capturedAt,
          previewShownSplats: frame.shownSplats ?? null, previewTotalSplats: frame.totalSplats ?? null,
          previewEtag: frame.etag, previewError: null,
        });
        const latest = useTrainingStore.getState();
        if (refreshFirstStatus && latest.requestsEnabled && latest.currentJobId === currentJobId
          && !isTerminal(latest.currentJob?.state ?? 'cancelled')
          && !(latest.currentJob?.progress?.optimizer_step)) {
          // An older poll may already have sampled pre-preview status. Wait for
          // that owner, then issue one fresh request if progress is still absent.
          // Subsequent frames never enqueue additional wakeups.
          const { connectionGeneration, selectionGeneration } = latest;
          const pending = refreshFlightRef.current;
          void (async () => {
            if (pending?.key === `${connectionGeneration}:${selectionGeneration}`) await pending.promise;
            const state = useTrainingStore.getState();
            if (active && state.requestsEnabled && state.currentJobId === currentJobId
              && state.connectionGeneration === connectionGeneration && state.selectionGeneration === selectionGeneration
              && state.snapshotAssociations[jobSnapshotId!] === association
              && isSourceIdForCurrentReconstruction(association.sourceId)
              && !isTerminal(state.currentJob?.state ?? 'cancelled')
              && !(state.currentJob?.progress?.optimizer_step)) await refresh();
          })();
        }
      },
      onError: (previewError) => useTrainingStore.setState({ previewError }),
    });
    return () => { active = false; trainingPreviewController.setTarget(null); };
  }, [client, currentJobId, currentJob?.client_snapshot_id, supportsGeometryPreview, refresh]);

  useEffect(() => {
    const active = supportsGeometryPreview && requestsEnabled && previewEnabled
      && !isTerminal(currentJob?.state ?? 'cancelled')
      && currentJob?.state !== 'cancelling';
    const visibility = () => trainingPreviewController.setEnabled(active && !document.hidden);
    visibility();
    const timer = window.setInterval(() => { void trainingPreviewController.tick(); }, 333);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      trainingPreviewController.setEnabled(false);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [currentJob?.state, previewEnabled, requestsEnabled, supportsGeometryPreview]);

  useEffect(() => {
    const job = currentJob;
    const artifact = job?.artifacts?.find((candidate) =>
      candidate.format === 'ply' && candidate.coordinate_space === 'colmap');
    if (!requestsEnabled || job?.state !== 'succeeded' || !artifact) return;
    const state = useTrainingStore.getState();
    const association = state.snapshotAssociations[job.client_snapshot_id];
    if (state.finalLoadedJobId === job.job_id || !association
      || !isSourceIdForCurrentReconstruction(association.sourceId)) return;
    const key = [
      state.serverInstanceId ?? 'unknown',
      client.baseUrl,
      job.job_id,
      artifact.artifact_id,
      artifact.sha256,
    ].join(':');
    if (autoLoadedArtifactKeysRef.current.has(key)) return;
    autoLoadedArtifactKeysRef.current.add(key);
    void loadTrainingResult(job, client).catch((error: unknown) => {
      const latest = useTrainingStore.getState();
      if (latest.currentJobId === job.job_id
        && latest.snapshotAssociations[job.client_snapshot_id] === association) {
        useTrainingStore.setState({
          previewError: `Final result could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    });
  }, [client, currentJob, requestsEnabled]);

  const start = useCallback(async () => {
    if (startingRef.current) return;
    const initial = useTrainingStore.getState();
    const config = initial.config;
    const owner = scope();
    if (!config || !owner.isCurrent()) return;
    const timing = beginTrainingTiming(crypto.randomUUID());
    useTrainingStore.setState({ operationError: null, connectionError: null });
    startingRef.current = true;
    cancelRequestedRef.current = initial.cancellationPending;
    const abort = new AbortController();
    abortRef.current = abort;
    const signal = AbortSignal.any([abort.signal, owner.signal]);
    const requestSignal = () => AbortSignal.any([owner.signal, AbortSignal.timeout(30_000)]);
    const submissionClientLabel = () => {
      const attempt = useTrainingStore.getState();
      if (attempt.attemptClientLabel) return attempt.attemptClientLabel;
      if (attempt.admissionPending) {
        throw new Error('The original submission label is unavailable. This pending admission cannot be safely retried; find the accepted job in run history before resolving the attempt.');
      }
      // A legacy upload with no pending admission may freeze its first job body now.
      useTrainingStore.setState({ attemptClientLabel: initial.clientLabel });
      return initial.clientLabel;
    };
    let datasetId = initial.datasetId;
    let snapshot = initial.snapshot;
    let attemptRecipe = initial.attemptRecipe;
    let cachedDataset: TrainingDatasetStatus | null = null;
    try {
      if (initial.attemptServerUrl && initial.attemptServerUrl !== serverUrl) {
        throw new Error('This upload belongs to another server. Reconnect to that server or explicitly abandon the attempt.');
      }
      if (initial.admissionPending) submissionClientLabel();
      if (initial.attemptSnapshotId && !attemptRecipe) {
        if (!datasetId) {
          throw new Error('This interrupted legacy preparation has no provable recipe or dataset identity. Abandon it before starting a new attempt.');
        }
        let legacyDataset: TrainingDatasetStatus;
        try {
          legacyDataset = await client.dataset(datasetId, requestSignal());
        } catch (error) {
          if (error instanceof TrainingApiError && error.status === 404) {
            throw new Error('The server no longer has this legacy dataset, and its original recipe cannot be reconstructed safely. Abandon the attempt.');
          }
          throw error;
        }
        cachedDataset = legacyDataset;
        attemptRecipe = recipeFromProjection(legacyDataset);
        if (attemptRecipe) actions.setAttemptRecipe(attemptRecipe);
        else useTrainingStore.setState({ legacyAttempt: true });
      }
      if (!initial.attemptSnapshotId) {
        if (!attemptRecipe) {
          if (config.editable_settings) {
            const currentSettings = useTrainingStore.getState().settingsDraft;
            const settings = skipUnavailableDirectoryMasks(config, currentSettings, getDatasetManager().hasMasks());
            const localErrors = validateTrainingSettings(config, settings);
            actions.setSettingsErrors(localErrors);
            if (Object.keys(localErrors).length > 0) throw new Error('Correct the highlighted training settings.');
            try {
              attemptRecipe = await client.resolveRecipe(
                config.recipe_id,
                config.editable_settings.schema_version,
                settings,
                requestSignal(),
              );
            } catch (error) {
              const errors = resolutionErrors(error);
              if (Object.keys(errors).length > 0) actions.setSettingsErrors(errors);
              throw error;
            }
            if (attemptRecipe.base_recipe_id !== config.recipe_id
              || attemptRecipe.settings_schema_version !== config.editable_settings.schema_version) {
              throw new Error('The server resolved settings against a different recipe contract. Reconnect and try again.');
            }
          } else {
            attemptRecipe = startupRecipe(config);
          }
          actions.setAttemptRecipe(attemptRecipe);
          useTrainingStore.setState({ attemptServerUrl: serverUrl });
        }
        actions.setCurrentJob(null);
        actions.setPhase('preparing');
        const maskSource = attemptRecipe.input_requirements.mask_source;
        snapshot = await createTrainingSnapshot({
          maskSource,
          missingMaskPolicy: attemptRecipe.input_requirements.missing_mask_policy ?? 'error',
          missingMaskTransport: attemptRecipe.input_requirements.missing_mask_transport ?? 'materialize',
          invertMasks: attemptRecipe.effective_settings.invert_masks === true,
          signal,
        });
        if (!owner.isCurrent()) return;
        signal.throwIfAborted();
        actions.setSnapshot(snapshot);
        useTrainingStore.setState({ attemptSnapshotId: snapshot.id, attemptServerUrl: serverUrl,
          attemptClientLabel: initial.clientLabel, attemptMaskSource: maskSource,
          attemptSourceFingerprint: snapshot.sourceFingerprint ?? null,
          submissionKey: crypto.randomUUID(), cancellationPending: false });
      }
      const snapshotId = useTrainingStore.getState().attemptSnapshotId;
      if (!snapshotId) throw new Error('Preparation identity is unavailable. Start a new attempt.');
      if (snapshot?.id === snapshotId) restoreRuntimeSnapshotSource(snapshot);
      if (snapshot && (snapshot.id !== snapshotId || !isSnapshotForCurrentReconstruction(snapshot))) snapshot = null;
      const ownsAttempt = () => owner.isCurrent() && useTrainingStore.getState().attemptSnapshotId === snapshotId;
      const recoverSnapshot = async (): Promise<NonNullable<typeof snapshot>> => {
        if (!useReconstructionStore.getState().reconstruction) throw new TrainingSourceUnavailableError();
        const attempt = useTrainingStore.getState();
        const maskSource = attempt.attemptMaskSource
          ?? attemptRecipe?.input_requirements.mask_source
          ?? config.input_requirements.mask_source;
        const missingMaskPolicy = attemptRecipe?.input_requirements.missing_mask_policy
          ?? config.input_requirements.missing_mask_policy
          ?? 'error';
        actions.setPhase('preparing');
        const recovered = await createTrainingSnapshot({
          maskSource,
          missingMaskPolicy,
          missingMaskTransport: (attemptRecipe ?? config).input_requirements.missing_mask_transport ?? 'materialize',
          invertMasks: attemptRecipe?.effective_settings.invert_masks === true,
          signal,
          snapshotId,
          // This snapshot did not retain the original lazy readers. Hash every
          // received file before resuming so two source versions cannot be mixed.
          verifyUploadedReceipts: true,
        });
        if (!ownsAttempt()) throw new DOMException('Preparation was superseded.', 'AbortError');
        const expectedFingerprint = attempt.attemptSourceFingerprint;
        if (expectedFingerprint && recovered.sourceFingerprint !== expectedFingerprint) {
          throw new Error('The loaded reconstruction does not match this interrupted upload. Reload its original COLMAP dataset or abandon the preparation attempt.');
        }
        actions.setSnapshot(recovered);
        useTrainingStore.setState({
          attemptMaskSource: maskSource,
          attemptSourceFingerprint: recovered.sourceFingerprint ?? null,
        });
        return recovered;
      };
      actions.setPhase('uploading');
      if (!datasetId) {
        if (!snapshot) snapshot = await recoverSnapshot();
        actions.setPhase('uploading');
        // Resolve a possibly committed create before acting on an explicit cancel.
        const recipeSelection = usesRecipeSelection(attemptRecipe)
          ? recipeSelectionFromResolution(attemptRecipe) : null;
        const dataset = recipeSelection
          ? await client.createDataset(snapshot, requestSignal(), recipeSelection)
          : await client.createDataset(snapshot, requestSignal());
        if (!ownsAttempt()) return;
        if (attemptRecipe) assertDatasetRecipe({
          base_recipe_id: dataset.baseRecipeId,
          recipe_id: dataset.recipeId,
          settings_schema_version: dataset.settingsSchemaVersion,
          settings: dataset.settings,
        }, attemptRecipe, Boolean(recipeSelection));
        datasetId = dataset.id;
        actions.setDatasetId(datasetId);
      }
      if (cancelRequestedRef.current) {
        if (useTrainingStore.getState().admissionPending && useTrainingStore.getState().submissionKey) {
          const accepted = await client.createJob(
            datasetId,
            useTrainingStore.getState().submissionKey!,
            submissionClientLabel(),
            requestSignal(),
          );
          if (!ownsAttempt()) return;
          if (attemptRecipe) assertDatasetRecipe(accepted, attemptRecipe, usesRecipeSelection(attemptRecipe));
          const cancelled = await client.cancelJob(accepted.job_id, requestSignal());
          if (ownsAttempt()) { actions.setCurrentJob(cancelled); actions.setPhase(cancelled.state); useTrainingStore.setState({ admissionPending: false }); }
          return;
        }
        const cancelled = await client.cancelDataset(datasetId, requestSignal());
        if (ownsAttempt()) actions.setPhase(cancelled.state === 'cancelling' ? 'cancelling' : 'cancelled');
        return;
      }
      const prepare = (id: string) => {
        const initialDataset = cachedDataset;
        cachedDataset = null;
        return prepareExistingDataset(client, id, snapshot, signal,
          progress => { if (ownsAttempt()) actions.setUpload(progress); },
          () => { if (ownsAttempt()) actions.setPhase('validating'); }, initialDataset,
          config.limits.max_concurrent_uploads);
      };
      let restoredSource = false;
      let recreatedDataset = false;
      while (true) {
        if (!datasetId) throw new Error('Dataset identity is unavailable. Resume preparation.');
        try {
          const prepared = await prepare(datasetId);
          const provenRecipe = recipeFromProjection(prepared);
          if (!attemptRecipe && provenRecipe) {
            attemptRecipe = provenRecipe;
            actions.setAttemptRecipe(provenRecipe);
          } else if (attemptRecipe) {
            assertDatasetRecipe(prepared, attemptRecipe, usesRecipeSelection(attemptRecipe));
          }
          break;
        } catch (error) {
          if (error instanceof TrainingSourceUnavailableError && !snapshot && !restoredSource) {
            snapshot = await recoverSnapshot();
            restoredSource = true;
            actions.setPhase('uploading');
            continue;
          }
          if (error instanceof TrainingApiError && error.status === 404 && !recreatedDataset) {
            if (!attemptRecipe || useTrainingStore.getState().legacyAttempt) {
              throw new Error('The server lost this legacy dataset, and its original recipe cannot be recreated safely. Abandon the attempt.');
            }
            if (!snapshot) snapshot = await recoverSnapshot();
            // A restarted local service may have lost its dataset registry.
            // Recreate under the original snapshot idempotency key rather than
            // minting a second logical submission.
            const recipeSelection = usesRecipeSelection(attemptRecipe)
              ? recipeSelectionFromResolution(attemptRecipe) : null;
            const recreated = recipeSelection
              ? await client.createDataset(snapshot, requestSignal(), recipeSelection)
              : await client.createDataset(snapshot, requestSignal());
            if (!ownsAttempt()) return;
            assertDatasetRecipe({
              base_recipe_id: recreated.baseRecipeId,
              recipe_id: recreated.recipeId,
              settings_schema_version: recreated.settingsSchemaVersion,
              settings: recreated.settings,
            }, attemptRecipe, Boolean(recipeSelection));
            datasetId = recreated.id;
            actions.setDatasetId(datasetId);
            recreatedDataset = true;
            actions.setPhase('uploading');
            continue;
          }
          throw error;
        }
      }
      if (!ownsAttempt()) return;
      signal.throwIfAborted();
      const submissionKey = useTrainingStore.getState().submissionKey;
      if (!submissionKey) throw new Error('Submission identity is unavailable. Abandon this attempt before starting another.');
      const attemptClientLabel = submissionClientLabel();
      admittingRef.current = true;
      useTrainingStore.setState({ admissionPending: true });
      let job = await timing.measure('admission_request', () =>
        client.createJob(datasetId!, submissionKey, attemptClientLabel, requestSignal()));
      timing.jobId = job.job_id;
      timing.mark('job_admitted');
      if (!ownsAttempt()) return;
      if (attemptRecipe) assertDatasetRecipe(job, attemptRecipe, usesRecipeSelection(attemptRecipe));
      if (cancelRequestedRef.current) job = await client.cancelJob(job.job_id, requestSignal());
      if (!ownsAttempt()) return;
      actions.setCurrentJob(job);
      actions.setPhase(job.state);
      if (!['failed', 'cancelling', 'cancelled'].includes(job.state)) {
        // The accepted run owns the main viewport. `setShowSplats` selects the
        // regular "Splats" display mode and also restores point-layer visibility;
        // the training preview supplies the temporary splat source until the
        // completed PLY is attached through the normal reconstruction catalog.
        usePointCloudStore.getState().setShowSplats(true);
        useTrainingStore.setState({ previewEnabled: true });
      }
      useTrainingStore.setState({ admissionPending: false });
    } catch (error) {
      if (!owner.isCurrent()) return;
      if (abortError(error)) {
        if (!cancelRequestedRef.current) {
          actions.setPhase('idle');
          useTrainingStore.setState({ operationError: 'Preparation stopped. Resume with the retained original source, or abandon this attempt.' });
        } else if (!datasetId && !initial.attemptSnapshotId) actions.setPhase('cancelled');
      } else {
        if (error instanceof TrainingApiError && error.code === 'queue_full') useTrainingStore.setState({ admissionPending: false });
        actions.setPhase('idle');
        const message = error instanceof Error ? error.message : 'Preparation failed.';
        useTrainingStore.setState({ operationError: message });
      }
    } finally {
      abortRef.current = null;
      startingRef.current = false;
      admittingRef.current = false;
    }
  }, [actions, client, scope, serverUrl]);

  const cancel = useCallback(async (foreignConfirmed = false) => {
    const owner = scope();
    if (!owner.isCurrent()) return;
    const selected = useTrainingStore.getState();
    if (selected.currentJobId
      && selected.currentJob?.client_label !== selected.clientLabel
      && !foreignConfirmed) {
      throw new Error('Confirm cancellation of a job submitted by another frontend.');
    }
    cancelRequestedRef.current = true;
    useTrainingStore.setState({ cancellationPending: true });
    trainingPreviewController.invalidate(false);
    if (admittingRef.current) { actions.setPhase('cancelling'); return; }
    abortRef.current?.abort();
    const { currentJobId: jobId, datasetId, selectionGeneration: selection } = useTrainingStore.getState();
    const signal = AbortSignal.any([owner.signal, AbortSignal.timeout(30000)]);
    if (jobId) {
      actions.setPhase('cancelling');
      const job = await client.cancelJob(jobId, signal);
      if (owner.isCurrent() && useTrainingStore.getState().selectionGeneration === selection) {
        actions.setCurrentJob(job);
        actions.setPhase(job.state);
      }
    } else if (datasetId) {
      actions.setPhase('cancelling');
      let dataset: Awaited<ReturnType<typeof client.cancelDataset>>;
      try {
        dataset = await client.cancelDataset(datasetId, signal);
      } catch (error) {
        if (error instanceof TrainingApiError && error.status === 404) {
          if (owner.isCurrent()) actions.setPhase('cancelled');
          return;
        }
        throw error;
      }
      while (dataset.state === 'cancelling') {
        await abortableDelay(POLL_MS, signal);
        dataset = await client.dataset(datasetId, signal);
      }
      if (owner.isCurrent() && dataset.state === 'cancelled') actions.setPhase('cancelled');
    } else if (startingRef.current) {
      actions.setPhase('cancelling');
    } else {
      actions.setPhase('cancelled');
    }
  }, [actions, client, scope]);

  const startFresh = useCallback(async () => {
    if (restartingRef.current) return;
    restartingRef.current = true;
    try {
      if (!useReconstructionStore.getState().reconstruction) throw new Error('Load a reconstruction to train.');
      if (!useTrainingStore.getState().connected) await connect();
      const initial = useTrainingStore.getState();
      if (!initial.connected || !initial.config?.backend.available) throw new Error('The training server is unavailable.');
      // Browser training always inherits the backend launch recipe. Discard
      // drafts saved by older versions of the configurable training panel.
      useTrainingStore.getState().setSettingsDraft({});
      actions.setSettingsErrors({});
      const owner = scope();
      const signal = AbortSignal.any([owner.signal, AbortSignal.timeout(60_000)]);
      trainingPreviewController.invalidate(false);
      if (startingRef.current) {
        await cancel(true);
        while (startingRef.current) await abortableDelay(50, signal);
      }
      // A lost admission response must be reconciled with its original identity
      // before replacing it, otherwise the accepted run could be left running.
      if (useTrainingStore.getState().admissionPending) {
        useTrainingStore.setState({ cancellationPending: true });
        await start();
        if (useTrainingStore.getState().admissionPending) {
          throw new Error(useTrainingStore.getState().operationError || 'Could not resolve the previous submission.');
        }
      }
      let previous = useTrainingStore.getState().currentJob;
      if (previous && !isTerminal(previous.state)) {
        actions.setPhase('cancelling');
        previous = await client.cancelJob(previous.job_id, signal);
        while (!isTerminal(previous.state)) {
          await abortableDelay(POLL_MS, signal);
          previous = await client.job(previous.job_id, signal);
        }
        if (!owner.isCurrent()) return;
        actions.setCurrentJob(previous);
      }
      const attempt = useTrainingStore.getState();
      if (attempt.datasetId && attempt.datasetId !== previous?.dataset_id) {
        try {
          let dataset = await client.cancelDataset(attempt.datasetId, signal);
          while (dataset.state === 'cancelling') {
            await abortableDelay(POLL_MS, signal);
            dataset = await client.dataset(attempt.datasetId, signal);
          }
        } catch (error) {
          if (!(error instanceof TrainingApiError && error.status === 404)) throw error;
        }
      }
      signal.throwIfAborted();
      if (!owner.isCurrent()) return;
      // New snapshot/submission identities force a new dataset and full upload.
      useTrainingStore.getState().resetAttempt();
      actions.setCurrentJob(null);
      await start();
    } finally {
      restartingRef.current = false;
    }
  }, [actions, cancel, client, connect, scope, start]);

  const disconnect = useCallback(() => {
    abortRef.current?.abort();
    trainingPreviewController.setEnabled(false);
    useTrainingStore.setState(state => ({ connectionGeneration: state.connectionGeneration + 1, requestsEnabled: false, connected: false, phase: 'disconnected' }));
  }, []);
  const abandonAttempt = useCallback(async () => {
    const state = useTrainingStore.getState();
    if (startingRef.current || state.admissionPending) throw new Error('Resolve the pending submission before abandoning its identity.');
    if (state.currentJob && !isTerminal(state.currentJob.state)) throw new Error('Cancel the accepted job before abandoning this attempt.');
    const owner = scope();
    if (state.datasetId && state.attemptServerUrl === serverUrl) {
      try {
        await client.cancelDataset(state.datasetId, AbortSignal.any([owner.signal, AbortSignal.timeout(30000)]));
      } catch (error) {
        // A local service restart can legitimately forget an unfinished
        // dataset. Its absence already satisfies abandonment.
        if (!(error instanceof TrainingApiError && error.status === 404)) throw error;
      }
      if (!owner.isCurrent()) return;
    }
    useTrainingStore.getState().resetAttempt();
  }, [client, scope, serverUrl]);
  const cancelJob = useCallback(async (jobId: string, foreignConfirmed = false) => {
    const owner = scope();
    if (!owner.isCurrent()) return;
    const initial = useTrainingStore.getState();
    const known = [initial.currentJob, initial.queue?.active_job, ...(initial.queue?.waiting ?? []), ...initial.recentRuns]
      .find((job) => job?.job_id === jobId);
    if (known?.client_label !== initial.clientLabel && !foreignConfirmed) {
      throw new Error('Confirm cancellation of a job submitted by another frontend.');
    }
    const selection = useTrainingStore.getState().selectionGeneration;
    const job = await client.cancelJob(jobId, AbortSignal.any([owner.signal, AbortSignal.timeout(30000)]));
    if (!owner.isCurrent()) return;
    if (useTrainingStore.getState().currentJobId === jobId && useTrainingStore.getState().selectionGeneration === selection) {
      actions.setCurrentJob(job); actions.setPhase(job.state);
    }
    await refresh();
  }, [actions, client, refresh, scope]);
  const selectRun = useCallback(async (jobId: string) => {
    const owner = scope();
    if (!owner.isCurrent()) return;
    const sequence = ++selectSequenceRef.current;
    // Invalidate currently selected job/log responses as soon as selection begins.
    useTrainingStore.setState(state => ({ selectionGeneration: state.selectionGeneration + 1 }));
    const job = await client.job(jobId, AbortSignal.any([owner.signal, AbortSignal.timeout(10000)]));
    if (!owner.isCurrent() || sequence !== selectSequenceRef.current) return;
    actions.setCurrentJob(job); actions.setPhase(job.state);
  }, [actions, client, scope]);
  const adoptSelectedJob = useCallback(async (confirmed = false) => {
    if (!confirmed) throw new Error('Confirm the selected run before resolving this interrupted submission.');
    const owner = scope();
    const initial = useTrainingStore.getState();
    if (!initial.admissionPending || initial.attemptClientLabel) {
      throw new Error('This preparation attempt does not need selected-run recovery.');
    }
    if (!initial.attemptServerUrl || initial.attemptServerUrl !== serverUrl) {
      throw new Error('The interrupted submission belongs to a different training server.');
    }
    if (!initial.currentJobId || !initial.datasetId || !initial.attemptSnapshotId) {
      throw new Error('Select the accepted run that matches this interrupted submission.');
    }
    const selectedJobId = initial.currentJobId;
    const selection = initial.selectionGeneration;
    const job = await client.job(
      selectedJobId,
      AbortSignal.any([owner.signal, AbortSignal.timeout(10_000)]),
    );
    if (!owner.isCurrent()) return;
    const current = useTrainingStore.getState();
    if (current.currentJobId !== selectedJobId || current.selectionGeneration !== selection) {
      throw new Error('The selected run changed before it could be confirmed.');
    }
    if (job.dataset_id !== initial.datasetId || job.client_snapshot_id !== initial.attemptSnapshotId) {
      throw new Error('The selected run does not match this interrupted submission.');
    }
    if (initial.attemptRecipe && job.recipe_id !== initial.attemptRecipe.recipe_id) {
      throw new Error('The selected run uses a different recipe from this interrupted submission.');
    }
    useTrainingStore.setState({
      admissionPending: false,
      attemptClientLabel: job.client_label || null,
    });
    actions.setCurrentJob(job);
    actions.setPhase(job.state);
  }, [actions, client, scope, serverUrl]);
  return { connect, disconnect, refresh, start, startFresh, cancel, cancelJob, selectRun, abandonAttempt, adoptSelectedJob };
}


/** Mount once at application scope so a window close never tears down polling/work. */
export function TrainingSessionHost({ children }: { children: ReactNode }) {
  const session = useTrainingSession();
  return createElement(TrainingSessionContext.Provider, { value: session }, children);
}

export function useTrainingSessionActions(): TrainingSessionActions {
  const session = useContext(TrainingSessionContext);
  if (!session) throw new Error('TrainingSessionHost is not mounted.');
  return session;
}
