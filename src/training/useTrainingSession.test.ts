import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTrainingStore } from '../store/stores/trainingStore';
import { useDeletionStore, usePointCloudStore, useReconstructionStore } from '../store';
import { STORAGE_KEYS } from '../store/migration';
import { buildCamera, buildReconstruction } from '../test/builders';
import { TrainingApiError, TrainingClient, trainingConfigSchema, trainingJobSchema, trainingDatasetSchema } from './trainingClient';
import { useTrainingSession } from './useTrainingSession';
import { createTrainingSnapshot, isSourceIdForCurrentReconstruction } from './trainingSnapshot';
import { trainingPreviewController } from './previewController';
import { sha256Hex } from './trainingIntegrity';
import type { TrainingConfig, TrainingJob, TrainingResolvedRecipe } from './types';
import wire from './fixtures/wire-v1.json';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const job = trainingJobSchema.parse({ ...wire.job, state: 'running' });
const legacyConfig: TrainingConfig = trainingConfigSchema.parse({ ...wire.config, editable_settings: undefined });
const editableConfig: TrainingConfig = trainingConfigSchema.parse({
  ...wire.config,
  editable_settings: {
    schema_version: 1,
    fields: [
      {
        key: 'batch_size', label: 'Batch size', description: 'Views per optimizer step.', group: 'Training',
        value_type: 'integer', default: 4, minimum: 1, maximum: 8, step: 1,
      },
      {
        key: 'use_masks', label: 'Use masks', description: 'Enable available masks.', group: 'Masks',
        value_type: 'boolean', default: true,
      },
    ],
  },
});
const resolvedRecipe: TrainingResolvedRecipe = {
  base_recipe_id: editableConfig.recipe_id,
  recipe_id: 'recipe_resolved_01',
  settings_schema_version: 1,
  settings: { batch_size: 2, use_masks: false },
  effective_settings: { batch_size: 2, use_masks: false },
  recipe_summary: { batch_size: 2, use_masks: false },
  input_requirements: { mask_source: 'none' },
};
const legacyRecipe: TrainingResolvedRecipe = {
  base_recipe_id: legacyConfig.recipe_id,
  recipe_id: legacyConfig.recipe_id,
  settings_schema_version: 0,
  settings: {},
  effective_settings: {},
  recipe_summary: legacyConfig.recipe_summary,
  input_requirements: legacyConfig.input_requirements,
};
function loadReconstruction() {
  useReconstructionStore.setState({
    reconstruction: buildReconstruction(), sourceType: 'local',
    loadedFiles: { imageFiles: new Map(), hasMasks: false },
  });
}
describe('session connection and selection ownership', () => {
  beforeEach(() => {
    useDeletionStore.getState().clearPendingDeletions();
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useReconstructionStore.setState({ reconstruction: null, wasmReconstruction: null, loadedFiles: null, sourceType: null });
    useTrainingStore.setState({ ...useTrainingStore.getInitialState(), connected: true, requestsEnabled: true, config: legacyConfig }, true);
    vi.spyOn(TrainingClient.prototype, 'health').mockResolvedValue(wire.local_health);
    vi.spyOn(TrainingClient.prototype, 'config').mockResolvedValue(legacyConfig);
    vi.spyOn(TrainingClient.prototype, 'queue').mockResolvedValue(wire.queue);
    vi.spyOn(TrainingClient.prototype, 'jobs').mockResolvedValue({ items: [], next_cursor: null });
    vi.spyOn(TrainingClient.prototype, 'job').mockImplementation(async id => ({ ...job, job_id: id }));
    vi.spyOn(TrainingClient.prototype, 'logs').mockResolvedValue({ text: '', next_cursor: '0:0' });
  });
  afterEach(() => { cleanup(); trainingPreviewController.dispose(); vi.restoreAllMocks(); });

  it('polls job status without fetching backend logs, even with a legacy expanded flag', async () => {
    useTrainingStore.setState({ dockOpen: true, logsExpanded: true, previewEnabled: false });
    useTrainingStore.getState().setCurrentJob(job);
    renderHook(() => useTrainingSession());
    await waitFor(() => expect(TrainingClient.prototype.job).toHaveBeenCalled());
    expect(TrainingClient.prototype.logs).not.toHaveBeenCalled();
  });

  it('waits for cancellation before resetting identities and creating a fresh upload', async () => {
    loadReconstruction();
    useTrainingStore.setState({ config: { ...legacyConfig, input_requirements: { mask_source: 'none' } },
      datasetId: job.dataset_id, attemptSnapshotId: 'old-snapshot', submissionKey: 'old-submission',
      settingsDraft: { batch_size: 8, dilated_training_scale: 2 }, settingsErrors: { batch_size: 'Stale error' } });
    useTrainingStore.getState().setCurrentJob(job);
    const stopped = deferred<TrainingJob>();
    const cancelJob = vi.spyOn(TrainingClient.prototype, 'cancelJob').mockReturnValue(stopped.promise);
    const createDataset = vi.spyOn(TrainingClient.prototype, 'createDataset').mockRejectedValue(new Error('fresh upload reached'));
    const { result } = renderHook(() => useTrainingSession());
    let restarting!: Promise<void>;
    act(() => { restarting = result.current.startFresh(); });
    await waitFor(() => expect(cancelJob).toHaveBeenCalledWith(job.job_id, expect.any(AbortSignal)));
    expect(createDataset).not.toHaveBeenCalled();
    expect(useTrainingStore.getState().attemptSnapshotId).toBe('old-snapshot');
    await act(async () => { stopped.resolve({ ...job, state: 'cancelled' }); await restarting; });
    expect(createDataset).toHaveBeenCalledOnce();
    expect(useTrainingStore.getState().settingsDraft).toEqual({});
    expect(useTrainingStore.getState().settingsErrors).toEqual({});
    expect(useTrainingStore.getState().attemptSnapshotId).not.toBe('old-snapshot');
    expect(useTrainingStore.getState().submissionKey).not.toBe('old-submission');
    expect(useTrainingStore.getState().currentJobId).toBeNull();
  });

  it('keeps the old identity and does not upload when cancellation fails', async () => {
    loadReconstruction();
    useTrainingStore.setState({ datasetId: job.dataset_id, attemptSnapshotId: 'old-snapshot' });
    useTrainingStore.getState().setCurrentJob(job);
    vi.spyOn(TrainingClient.prototype, 'cancelJob').mockRejectedValue(new Error('cannot stop'));
    const createDataset = vi.spyOn(TrainingClient.prototype, 'createDataset');
    const { result } = renderHook(() => useTrainingSession());
    await act(async () => { await expect(result.current.startFresh()).rejects.toThrow('cannot stop'); });
    expect(createDataset).not.toHaveBeenCalled();
    expect(useTrainingStore.getState().attemptSnapshotId).toBe('old-snapshot');
  });

  it('advances the current job without polling global queue or run history', async () => {
    useTrainingStore.getState().setCurrentJob(job);
    const { result } = renderHook(() => useTrainingSession());
    await act(async () => { await result.current.refresh(); });
    vi.mocked(TrainingClient.prototype.job).mockResolvedValue({ ...job, progress: { optimizer_step: 20, metrics: {} } });
    await act(async () => { await result.current.refresh(); });
    expect(TrainingClient.prototype.queue).not.toHaveBeenCalled();
    expect(TrainingClient.prototype.jobs).not.toHaveBeenCalled();
    expect(useTrainingStore.getState().currentJob?.progress?.optimizer_step).toBe(20);
  });

  it('shows a disconnected current job after polling loss and restores its state after recovery', async () => {
    useTrainingStore.getState().setCurrentJob(job);
    vi.mocked(TrainingClient.prototype.job).mockRejectedValueOnce(new TypeError('network unavailable'));
    const { result } = renderHook(() => useTrainingSession());
    await act(async () => { expect(await result.current.refresh()).toBe(false); });
    expect(useTrainingStore.getState()).toMatchObject({ connected: false, phase: 'disconnected' });
    await act(async () => { expect(await result.current.refresh()).toBe(true); });
    expect(useTrainingStore.getState()).toMatchObject({ connected: true, phase: 'running' });
  });

  it('drops a stale current run when a fresh server no longer has it', async () => {
    useTrainingStore.getState().setCurrentJob(job);
    useTrainingStore.setState({ datasetId: job.dataset_id, attemptSnapshotId: job.client_snapshot_id });
    vi.mocked(TrainingClient.prototype.job).mockRejectedValueOnce(
      new TrainingApiError('Job was not found.', 404, 'job_not_found'),
    );
    const { result } = renderHook(() => useTrainingSession());

    await act(async () => { expect(await result.current.refresh()).toBe(true); });

    expect(useTrainingStore.getState()).toMatchObject({
      connected: true,
      currentJob: null,
      currentJobId: null,
      datasetId: null,
      attemptSnapshotId: null,
      phase: 'idle',
    });
    expect(TrainingClient.prototype.queue).not.toHaveBeenCalled();
    expect(TrainingClient.prototype.jobs).not.toHaveBeenCalled();
  });

  it('shows a disconnected current job when its current status request times out', async () => {
    useTrainingStore.getState().setCurrentJob(job);
    const timeout = new AbortController();
    const waiting = deferred<typeof job>();
    vi.mocked(TrainingClient.prototype.job).mockReturnValueOnce(waiting.promise);
    const { result } = renderHook(() => useTrainingSession());
    let refresh!: Promise<boolean>;
    act(() => { refresh = result.current.refresh(timeout.signal); });
    const timeoutError = new DOMException('The operation timed out', 'TimeoutError');
    act(() => { timeout.abort(timeoutError); waiting.reject(timeoutError); });
    await act(async () => { expect(await refresh).toBe(false); });
    expect(useTrainingStore.getState()).toMatchObject({ connected: false, phase: 'disconnected' });
  });

  it('keeps teardown aborts silent instead of reporting a false disconnect', async () => {
    useTrainingStore.getState().setCurrentJob(job);
    useTrainingStore.getState().setPhase('running');
    const cleanupAbort = new AbortController();
    const waiting = deferred<typeof job>();
    vi.mocked(TrainingClient.prototype.job).mockReturnValueOnce(waiting.promise);
    const { result } = renderHook(() => useTrainingSession());
    let refresh!: Promise<boolean>;
    act(() => { refresh = result.current.refresh(cleanupAbort.signal); });
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    act(() => { cleanupAbort.abort(abortError); waiting.reject(abortError); });
    await act(async () => { expect(await refresh).toBe(false); });
    expect(useTrainingStore.getState()).toMatchObject({ connected: true, phase: 'running', connectionError: null });
  });

  it.each(['success', 'failure'] as const)('ignores delayed old-connection %s across disconnect and reconnect to the same URL', async outcome => {
    useTrainingStore.getState().setCurrentJob(job);
    const waiting = deferred<typeof job>();
    vi.mocked(TrainingClient.prototype.job).mockReturnValueOnce(waiting.promise);
    const { result } = renderHook(() => useTrainingSession());
    let old!: Promise<boolean>;
    act(() => { old = result.current.refresh(); });
    act(() => result.current.disconnect());
    await act(async () => { await result.current.connect(); });
    await act(async () => {
      if (outcome === 'success') waiting.resolve({ ...job, progress: { optimizer_step: 999, metrics: {} } });
      else waiting.reject(new Error('old server failure'));
      await old;
    });
    expect(useTrainingStore.getState().connected).toBe(true);
    expect(useTrainingStore.getState().currentJob?.progress?.optimizer_step).not.toBe(999);
    expect(useTrainingStore.getState().connectionError).toBeNull();
  });

  it('disconnect stops local requests without cancelling any server resource', () => {
    const cancelJob = vi.spyOn(TrainingClient.prototype, 'cancelJob');
    const cancelDataset = vi.spyOn(TrainingClient.prototype, 'cancelDataset');
    const { result } = renderHook(() => useTrainingSession());
    act(() => result.current.disconnect());
    expect(useTrainingStore.getState()).toMatchObject({ requestsEnabled: false, connected: false, phase: 'disconnected' });
    expect(cancelJob).not.toHaveBeenCalled(); expect(cancelDataset).not.toHaveBeenCalled();
  });

  it('clears a selected job when switching service endpoints without cancelling it on either server', async () => {
    useTrainingStore.getState().setCurrentJob(job);
    const cancelJob = vi.spyOn(TrainingClient.prototype, 'cancelJob');
    const previousGeneration = useTrainingStore.getState().selectionGeneration;
    act(() => useTrainingStore.getState().setServerUrl('http://127.0.0.1:8799'));
    expect(useTrainingStore.getState()).toMatchObject({
      serverUrl: 'http://127.0.0.1:8799', currentJobId: null, currentJob: null,
      connected: false, requestsEnabled: false, phase: 'idle',
      selectionGeneration: previousGeneration + 1,
    });
    expect(cancelJob).not.toHaveBeenCalled();
    const { result } = renderHook(() => useTrainingSession());
    await act(async () => { await result.current.connect(); });
    await act(async () => { expect(await result.current.refresh()).toBe(true); });
    expect(TrainingClient.prototype.job).not.toHaveBeenCalled();
    expect(useTrainingStore.getState().connected).toBe(true);
  });

  it('marks a selected job disconnected while credentials are being replaced', () => {
    useTrainingStore.getState().setCurrentJob(job);
    act(() => useTrainingStore.getState().setToken('replacement-token'));
    expect(useTrainingStore.getState()).toMatchObject({
      token: 'replacement-token', currentJobId: job.job_id, currentJob: job,
      requestsEnabled: false, connected: false, phase: 'disconnected',
    });
  });

  it('discovers tokenless loopback access before loading configuration', async () => {
    vi.mocked(TrainingClient.prototype.health).mockResolvedValue({
      ...wire.health, authentication: { mode: 'local', token_required: false },
    });
    const { result } = renderHook(() => useTrainingSession());

    await act(async () => { await result.current.connect(); });

    expect(useTrainingStore.getState()).toMatchObject({
      connected: true, authenticationMode: 'local', tokenRequired: false, connectionError: null,
    });
    expect(TrainingClient.prototype.config).toHaveBeenCalledOnce();
  });

  it('discovers bearer mode without attempting protected configuration when the token is absent', async () => {
    vi.mocked(TrainingClient.prototype.health).mockResolvedValue({
      ...wire.health, authentication: { mode: 'bearer', token_required: true },
    });
    const { result } = renderHook(() => useTrainingSession());

    await act(async () => { await result.current.connect(); });

    expect(useTrainingStore.getState()).toMatchObject({
      connected: false, requestsEnabled: false, authenticationMode: 'bearer', tokenRequired: true,
      connectionError: expect.stringContaining('requires a bearer token'),
    });
    expect(TrainingClient.prototype.config).not.toHaveBeenCalled();
  });

  it('requires HTTPS before probing a non-loopback service', async () => {
    act(() => useTrainingStore.getState().setServerUrl('http://training.example.test'));
    const { result } = renderHook(() => useTrainingSession());

    await act(async () => { await result.current.connect(); });

    expect(TrainingClient.prototype.health).not.toHaveBeenCalled();
    expect(useTrainingStore.getState().connectionError).toContain('require HTTPS');
  });

  it('uses a legacy config 401 to reveal that a bearer token is required', async () => {
    vi.mocked(TrainingClient.prototype.health).mockResolvedValue({ ...wire.health, authentication: undefined });
    vi.mocked(TrainingClient.prototype.config).mockRejectedValue(
      new TrainingApiError('Supply the server bearer token.', 401, 'unauthorized'),
    );
    const { result } = renderHook(() => useTrainingSession());

    await act(async () => { await result.current.connect(); });

    expect(useTrainingStore.getState()).toMatchObject({
      authenticationMode: 'bearer', tokenRequired: true, connected: false,
      connectionError: expect.stringContaining('requires a bearer token'),
    });
  });

  it('rejects an incompatible API major during automatic reconnect before polling resources', async () => {
    useTrainingStore.setState({ connected: false });
    vi.mocked(TrainingClient.prototype.config).mockResolvedValue({ ...legacyConfig, api_version: '2.0' });
    const { result } = renderHook(() => useTrainingSession());

    await act(async () => { expect(await result.current.refresh()).toBe(false); });

    expect(TrainingClient.prototype.queue).not.toHaveBeenCalled();
    expect(useTrainingStore.getState()).toMatchObject({
      connected: false,
      connectionError: 'Unsupported API version 2.0',
    });
  });

  it('skips absent directory masks and enters splat mode after the job is accepted', async () => {
    loadReconstruction();
    useTrainingStore.getState().setConfig(editableConfig);
    useTrainingStore.getState().setSettingsDraft({ batch_size: 2 });
    useTrainingStore.getState().setPreviewEnabled(false);
    usePointCloudStore.setState({ showPointCloud: false, showSplats: false, colorMode: 'rgb' });
    const resolve = vi.spyOn(TrainingClient.prototype, 'resolveRecipe').mockResolvedValue(resolvedRecipe);
    const createDataset = vi.spyOn(TrainingClient.prototype, 'createDataset').mockImplementation(async _snapshot => ({
      id: 'settings-dataset', files: [], baseRecipeId: resolvedRecipe.base_recipe_id,
      recipeId: resolvedRecipe.recipe_id, settingsSchemaVersion: resolvedRecipe.settings_schema_version,
      recipeSummary: resolvedRecipe.recipe_summary, inputRequirements: resolvedRecipe.input_requirements,
      settings: resolvedRecipe.settings, effectiveSettings: resolvedRecipe.effective_settings,
    }));
    vi.spyOn(TrainingClient.prototype, 'dataset').mockImplementation(async () => trainingDatasetSchema.parse({
      ...wire.dataset, dataset_id: 'settings-dataset',
      client_snapshot_id: useTrainingStore.getState().attemptSnapshotId, state: 'ready',
      base_recipe_id: resolvedRecipe.base_recipe_id, recipe_id: resolvedRecipe.recipe_id,
      settings_schema_version: resolvedRecipe.settings_schema_version,
      recipe_summary: resolvedRecipe.recipe_summary, input_requirements: resolvedRecipe.input_requirements,
      settings: resolvedRecipe.settings, effective_settings: resolvedRecipe.effective_settings,
    }));
    vi.spyOn(TrainingClient.prototype, 'createJob').mockResolvedValue({
      ...job, dataset_id: 'settings-dataset', base_recipe_id: resolvedRecipe.base_recipe_id,
      recipe_id: resolvedRecipe.recipe_id, settings_schema_version: resolvedRecipe.settings_schema_version,
      recipe_summary: resolvedRecipe.recipe_summary, input_requirements: resolvedRecipe.input_requirements,
      settings: resolvedRecipe.settings, effective_settings: resolvedRecipe.effective_settings,
    });
    const { result } = renderHook(() => useTrainingSession());

    await act(async () => { await result.current.start(); });

    expect(resolve).toHaveBeenCalledExactlyOnceWith(
      editableConfig.recipe_id, 1, { batch_size: 2, use_masks: false }, expect.any(AbortSignal),
    );
    expect(createDataset).toHaveBeenCalledWith(
      expect.objectContaining({ files: expect.not.arrayContaining([expect.objectContaining({ role: 'mask' })]) }),
      expect.any(AbortSignal),
      {
        base_recipe_id: resolvedRecipe.base_recipe_id,
        expected_recipe_id: resolvedRecipe.recipe_id,
        settings_schema_version: 1,
        settings: resolvedRecipe.settings,
      },
    );
    expect(useTrainingStore.getState()).toMatchObject({
      attemptRecipe: resolvedRecipe, attemptMaskSource: 'none', datasetId: 'settings-dataset', phase: 'running',
      settingsDraft: { batch_size: 2 }, previewEnabled: true,
    });
    expect(usePointCloudStore.getState()).toMatchObject({
      showPointCloud: true, showSplats: true, colorMode: 'splats',
    });
  });

  it('keeps invalid settings local and never starts preparation', async () => {
    useTrainingStore.getState().setConfig(editableConfig);
    useTrainingStore.getState().setSettingsDraft({ batch_size: 99 });
    const resolve = vi.spyOn(TrainingClient.prototype, 'resolveRecipe');
    const createDataset = vi.spyOn(TrainingClient.prototype, 'createDataset');
    const { result } = renderHook(() => useTrainingSession());

    await act(async () => { await result.current.start(); });

    expect(resolve).not.toHaveBeenCalled();
    expect(createDataset).not.toHaveBeenCalled();
    expect(useTrainingStore.getState()).toMatchObject({
      phase: 'idle', attemptRecipe: null,
      settingsErrors: { batch_size: expect.stringContaining('at most 8') },
    });
    expect(usePointCloudStore.getState().colorMode).toBe('rgb');
  });

  it('auto-loads a succeeded PLY as the active regular splat source', async () => {
    loadReconstruction();
    const snapshot = await createTrainingSnapshot({ maskSource: 'none' });
    useTrainingStore.getState().setSnapshot(snapshot);
    const file = new File(['final gaussian ply'], 'trained-final.ply', { type: 'application/octet-stream' });
    const succeeded: TrainingJob = {
      ...job,
      job_id: 'completed-job',
      client_snapshot_id: snapshot.id,
      state: 'succeeded',
      artifacts: [{
        artifact_id: 'final',
        url: '/api/v1/jobs/completed-job/artifacts/final',
        format: 'ply',
        content_type: 'application/octet-stream',
        bytes: file.size,
        sha256: 'b'.repeat(64),
        coordinate_space: 'colmap',
      }],
    };
    const artifact = vi.spyOn(TrainingClient.prototype, 'artifact').mockResolvedValue(file);
    useTrainingStore.getState().setCurrentJob(succeeded);
    useTrainingStore.setState({ phase: 'succeeded', previewActive: true });

    renderHook(() => useTrainingSession());

    await waitFor(() => expect(useTrainingStore.getState().finalLoadedJobId).toBe(succeeded.job_id));
    expect(artifact).toHaveBeenCalledExactlyOnceWith(succeeded.job_id, 'final');
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(file);
    expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toEqual([
      expect.objectContaining({
        file,
        trainingResult: expect.objectContaining({ jobId: succeeded.job_id, artifactId: 'final' }),
      }),
    ]);
    expect(useTrainingStore.getState()).toMatchObject({ previewActive: false, previewError: null });
  });

  it('maps authoritative recipe validation issues back to their setting fields', async () => {
    useTrainingStore.getState().setConfig(editableConfig);
    useTrainingStore.getState().setSettingsDraft({ batch_size: 2 });
    vi.spyOn(TrainingClient.prototype, 'resolveRecipe').mockRejectedValue(new TrainingApiError(
      'Settings are incompatible.', 422, 'invalid_settings',
      [{ field: 'settings.batch_size', code: 'incompatible', detail: 'Batch size conflicts with this recipe.' }],
    ));
    const createDataset = vi.spyOn(TrainingClient.prototype, 'createDataset');
    const { result } = renderHook(() => useTrainingSession());

    await act(async () => { await result.current.start(); });

    expect(createDataset).not.toHaveBeenCalled();
    expect(useTrainingStore.getState().settingsErrors).toEqual({
      batch_size: 'Batch size conflicts with this recipe.',
    });
  });

  it('hydrates a proven attempt recipe from its selected job after migration', async () => {
    useTrainingStore.setState({
      currentJobId: 'proven-job', datasetId: 'proven-dataset', attemptSnapshotId: 'proven-snapshot',
      attemptRecipe: null, legacyAttempt: true,
    });
    vi.mocked(TrainingClient.prototype.job).mockResolvedValue({
      ...job, job_id: 'proven-job', dataset_id: 'proven-dataset', client_snapshot_id: 'proven-snapshot',
      base_recipe_id: resolvedRecipe.base_recipe_id, recipe_id: resolvedRecipe.recipe_id,
      settings_schema_version: resolvedRecipe.settings_schema_version,
      recipe_summary: resolvedRecipe.recipe_summary, input_requirements: resolvedRecipe.input_requirements,
      settings: resolvedRecipe.settings, effective_settings: resolvedRecipe.effective_settings,
    });
    const { result } = renderHook(() => useTrainingSession());

    await act(async () => { await result.current.refresh(); });

    expect(useTrainingStore.getState()).toMatchObject({ attemptRecipe: resolvedRecipe, legacyAttempt: false });
  });

  it.each([0, 4])('refreshes only the first committed preview with no observed steps (steps=%s)', async steps => {
    loadReconstruction();
    const snapshot = await createTrainingSnapshot({ maskSource: 'none' });
    useTrainingStore.getState().setSnapshot(snapshot);
    const selectedJob = { ...job, client_snapshot_id: snapshot.id, progress: { optimizer_step: steps, metrics: {} } };
    vi.mocked(TrainingClient.prototype.job).mockResolvedValue(selectedJob);
    useTrainingStore.setState({ currentJob: selectedJob, currentJobId: job.job_id });
    const targets = vi.spyOn(trainingPreviewController, 'setTarget');
    const { result } = renderHook(() => useTrainingSession());
    await act(async () => { await result.current.refresh(); });
    const target = targets.mock.calls.map(([value]) => value).findLast(value => value !== null)!;
    expect(target).toBeTruthy();
    vi.mocked(TrainingClient.prototype.job).mockClear();
    const frame = { file: null, etag: null, optimizerStep: null, imageExposures: null, capturedAt: null };
    await act(async () => { target.onFrame(frame); });
    expect(TrainingClient.prototype.job).toHaveBeenCalledTimes(steps ? 0 : 1);
    await act(async () => { target.onFrame(frame); });
    expect(TrainingClient.prototype.job).toHaveBeenCalledTimes(steps ? 0 : 1);
  });

  it.each(['stale', 'progress', 'unmount', 'selection', 'connection'] as const)(
    'settles an older preview-time status request before a guarded fresh wakeup (%s)', async outcome => {
      loadReconstruction();
      const snapshot = await createTrainingSnapshot({ maskSource: 'none' });
      useTrainingStore.getState().setSnapshot(snapshot);
      const selectedJob = { ...job, client_snapshot_id: snapshot.id, progress: { optimizer_step: 0, metrics: {} } };
      useTrainingStore.setState({ currentJob: selectedJob, currentJobId: job.job_id });
      const old = deferred<TrainingJob>();
      vi.mocked(TrainingClient.prototype.job).mockReturnValueOnce(old.promise)
        .mockResolvedValue({ ...selectedJob, progress: { optimizer_step: 4, metrics: {} } });
      const targets = vi.spyOn(trainingPreviewController, 'setTarget');
      const hook = renderHook(() => useTrainingSession());
      const target = targets.mock.calls.map(([value]) => value).findLast(value => value !== null)!;
      expect(target).toBeTruthy();
      expect(TrainingClient.prototype.job).toHaveBeenCalledTimes(1);
      const frame = { file: null, etag: null, optimizerStep: null, imageExposures: null, capturedAt: null };
      await act(async () => { target.onFrame(frame); target.onFrame(frame); });
      expect(TrainingClient.prototype.job).toHaveBeenCalledTimes(1);
      if (outcome === 'unmount') hook.unmount();
      // Disable polling as well as invalidating the owner: any second request
      // in these cases would be the obsolete preview wakeup, not a new effect.
      if (outcome === 'selection' || outcome === 'connection') act(() => {
        const state = useTrainingStore.getState();
        useTrainingStore.setState({ requestsEnabled: false,
          ...(outcome === 'selection' ? { selectionGeneration: state.selectionGeneration + 1 }
            : { connectionGeneration: state.connectionGeneration + 1 }) });
      });
      await act(async () => { old.resolve(outcome === 'progress'
        ? { ...selectedJob, progress: { optimizer_step: 2, metrics: {} } } : selectedJob); });
      expect(TrainingClient.prototype.job).toHaveBeenCalledTimes(outcome === 'stale' ? 2 : 1);
      if (outcome === 'stale') expect(useTrainingStore.getState().currentJob?.progress?.optimizer_step).toBe(4);
    },
  );

  it('does not activate or fetch geometry previews when the backend omits that capability', async () => {
    loadReconstruction();
    const snapshot = await createTrainingSnapshot({ maskSource: 'none' });
    useTrainingStore.getState().setSnapshot(snapshot);
    const selectedJob = { ...job, client_snapshot_id: snapshot.id };
    vi.mocked(TrainingClient.prototype.job).mockResolvedValue(selectedJob);
    const config = trainingConfigSchema.parse({
      ...wire.config,
      backend: { ...wire.config.backend, preview_formats: [] },
    });
    useTrainingStore.setState({
      config,
      currentJob: selectedJob,
      currentJobId: job.job_id,
      previewActive: true,
    });
    const association = useTrainingStore.getState().snapshotAssociations[snapshot.id];
    expect(isSourceIdForCurrentReconstruction(association.sourceId)).toBe(true);
    const preview = vi.spyOn(TrainingClient.prototype, 'preview').mockResolvedValue({
      file: null, etag: null, optimizerStep: null, imageExposures: null, capturedAt: null,
    });
    trainingPreviewController.bindRenderer({ decode: vi.fn() });

    renderHook(() => useTrainingSession());
    await act(async () => { await trainingPreviewController.tick(); });

    expect(useTrainingStore.getState().previewActive).toBe(false);
    expect(preview).not.toHaveBeenCalled();
    // Keep the same valid association and renderer; changing capability alone enables preview.
    act(() => useTrainingStore.getState().setConfig(trainingConfigSchema.parse(wire.config)));
    expect(useTrainingStore.getState().previewActive).toBe(true);
    await act(async () => { await trainingPreviewController.tick(); });
    expect(preview).toHaveBeenCalledExactlyOnceWith(job.job_id, null, expect.any(AbortSignal));
  });

  it('resumes a ready schema-zero dataset after the server adds editable settings', async () => {
    const ready = trainingDatasetSchema.parse({
      ...wire.dataset,
      state: 'ready',
      base_recipe_id: null,
      recipe_id: null,
      settings_schema_version: null,
      settings: {},
      effective_settings: {},
    });
    useTrainingStore.setState({
      config: editableConfig,
      datasetId: ready.dataset_id,
      attemptSnapshotId: ready.client_snapshot_id,
      attemptServerUrl: 'http://127.0.0.1:8787',
      attemptClientLabel: 'legacy-frontend',
      submissionKey: 'legacy-upgrade-key',
      attemptRecipe: legacyRecipe,
      snapshot: null,
    });
    vi.spyOn(TrainingClient.prototype, 'dataset').mockResolvedValue(ready);
    const createDataset = vi.spyOn(TrainingClient.prototype, 'createDataset');
    const createJob = vi.spyOn(TrainingClient.prototype, 'createJob').mockResolvedValue({
      ...job,
      client_label: 'legacy-frontend',
      recipe_id: legacyRecipe.recipe_id,
    });
    const { result } = renderHook(() => useTrainingSession());

    await act(async () => { await result.current.start(); });

    expect(createDataset).not.toHaveBeenCalled();
    expect(createJob).toHaveBeenCalledWith(
      ready.dataset_id, 'legacy-upgrade-key', 'legacy-frontend', expect.any(AbortSignal),
    );
    expect(useTrainingStore.getState()).toMatchObject({ phase: 'running', admissionPending: false });
  });

  it('replays a lost schema-zero dataset create without adding a recipe selection after upgrade', async () => {
    loadReconstruction();
    const snapshot = await createTrainingSnapshot({ maskSource: legacyRecipe.input_requirements.mask_source });
    useTrainingStore.getState().setSnapshot(snapshot);
    useTrainingStore.setState({
      config: editableConfig,
      attemptSnapshotId: snapshot.id,
      attemptServerUrl: 'http://127.0.0.1:8787',
      attemptMaskSource: legacyRecipe.input_requirements.mask_source,
      attemptSourceFingerprint: snapshot.sourceFingerprint ?? null,
      attemptClientLabel: 'legacy-frontend',
      submissionKey: 'legacy-create-key',
      attemptRecipe: legacyRecipe,
    });
    const ready = trainingDatasetSchema.parse({
      ...wire.dataset,
      dataset_id: 'legacy-created-dataset',
      client_snapshot_id: snapshot.id,
      state: 'ready',
      base_recipe_id: null,
      recipe_id: null,
      settings_schema_version: null,
      settings: {},
      effective_settings: {},
    });
    const createDataset = vi.spyOn(TrainingClient.prototype, 'createDataset').mockResolvedValue({
      id: ready.dataset_id,
      files: [],
      baseRecipeId: null,
      recipeId: null,
      settingsSchemaVersion: null,
      recipeSummary: ready.recipe_summary,
      inputRequirements: ready.input_requirements,
      settings: {},
      effectiveSettings: {},
    });
    vi.spyOn(TrainingClient.prototype, 'dataset').mockResolvedValue(ready);
    vi.spyOn(TrainingClient.prototype, 'createJob').mockResolvedValue({
      ...job,
      dataset_id: ready.dataset_id,
      client_snapshot_id: snapshot.id,
      client_label: 'legacy-frontend',
      recipe_id: legacyRecipe.recipe_id,
    });
    const { result } = renderHook(() => useTrainingSession());

    await act(async () => { await result.current.start(); });

    expect(createDataset).toHaveBeenCalledExactlyOnceWith(snapshot, expect.any(AbortSignal));
    expect(useTrainingStore.getState()).toMatchObject({
      datasetId: ready.dataset_id, phase: 'running', admissionPending: false,
    });
  });

  it.each([false, true])('replays the original attempt label after reload (cancellation pending: %s)', async cancellationPending => {
    loadReconstruction();
    useTrainingStore.setState({ clientLabel: 'original-frontend' });
    vi.spyOn(TrainingClient.prototype, 'createDataset').mockResolvedValue({ id: wire.dataset.dataset_id, files: [] });
    vi.spyOn(TrainingClient.prototype, 'dataset').mockResolvedValue(trainingDatasetSchema.parse({ ...wire.dataset, state: 'ready' }));
    const createJob = vi.spyOn(TrainingClient.prototype, 'createJob')
      .mockRejectedValueOnce(new Error('Admission response was lost'))
      .mockResolvedValue({ ...job, client_label: 'original-frontend' });
    const cancelJob = vi.spyOn(TrainingClient.prototype, 'cancelJob').mockResolvedValue({ ...job, state: 'cancelled' });
    const initial = renderHook(() => useTrainingSession());
    await act(async () => { await initial.result.current.start(); });
    const submissionKey = useTrainingStore.getState().submissionKey;
    const sourceFingerprint = useTrainingStore.getState().attemptSourceFingerprint;
    expect(submissionKey).toBeTruthy();
    expect(sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(useTrainingStore.getState()).toMatchObject({ admissionPending: true, attemptClientLabel: 'original-frontend' });
    expect(createJob).toHaveBeenCalledExactlyOnceWith(wire.dataset.dataset_id, submissionKey, 'original-frontend', expect.any(AbortSignal));
    initial.unmount();
    useTrainingStore.setState({ cancellationPending });
    const saved = localStorage.getItem(STORAGE_KEYS.training)!;
    const persisted = JSON.parse(saved).state;
    expect(persisted.attemptClientLabel).toBe('original-frontend');
    expect(persisted.attemptMaskSource).toBe('directory');
    expect(persisted.attemptSourceFingerprint).toBe(sourceFingerprint);
    expect(persisted).not.toHaveProperty('clientLabel');

    useTrainingStore.setState({ ...useTrainingStore.getInitialState(), clientLabel: 'reloaded-frontend',
      connected: true, requestsEnabled: true, config: legacyConfig }, true);
    localStorage.setItem(STORAGE_KEYS.training, saved);
    await useTrainingStore.persist.rehydrate();
    expect(useTrainingStore.getState()).toMatchObject({
      clientLabel: 'reloaded-frontend', attemptClientLabel: 'original-frontend', submissionKey,
      attemptMaskSource: 'directory', attemptSourceFingerprint: sourceFingerprint, snapshot: null,
    });
    const reloaded = renderHook(() => useTrainingSession());
    await act(async () => { await reloaded.result.current.start(); });
    expect(createJob).toHaveBeenCalledTimes(2);
    expect(createJob).toHaveBeenLastCalledWith(wire.dataset.dataset_id, submissionKey, 'original-frontend', expect.any(AbortSignal));
    expect(useTrainingStore.getState().attemptClientLabel).toBe('original-frontend');
    expect(cancelJob).toHaveBeenCalledTimes(cancellationPending ? 1 : 0);
  });

  it.each([false, true])('refuses legacy admission replay without its original label (cancellation pending: %s)', async cancellationPending => {
    const legacy = {
      datasetId: wire.dataset.dataset_id, attemptSnapshotId: wire.dataset.client_snapshot_id,
      attemptServerUrl: 'http://127.0.0.1:8787', submissionKey: 'legacy-key',
      admissionPending: true, cancellationPending, clientLabel: 'obsolete-shared-label',
    };
    useTrainingStore.setState({ clientLabel: 'current-frontend', attemptClientLabel: 'unrelated-old-attempt' });
    localStorage.setItem(STORAGE_KEYS.training, JSON.stringify({ state: legacy, version: 0 }));
    await useTrainingStore.persist.rehydrate();
    expect(useTrainingStore.getState()).toMatchObject({ clientLabel: 'current-frontend', attemptClientLabel: null });
    const dataset = vi.spyOn(TrainingClient.prototype, 'dataset').mockResolvedValue(trainingDatasetSchema.parse({ ...wire.dataset, state: 'ready' }));
    const createJob = vi.spyOn(TrainingClient.prototype, 'createJob');
    const cancelJob = vi.spyOn(TrainingClient.prototype, 'cancelJob');
    const cancelDataset = vi.spyOn(TrainingClient.prototype, 'cancelDataset');
    const { result } = renderHook(() => useTrainingSession());
    await act(async () => { await result.current.start(); });
    expect(dataset).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
    expect(cancelJob).not.toHaveBeenCalled();
    expect(cancelDataset).not.toHaveBeenCalled();
    expect(useTrainingStore.getState()).toMatchObject({
      phase: 'idle', admissionPending: true, submissionKey: 'legacy-key', attemptClientLabel: null,
    });
    expect(useTrainingStore.getState().operationError).toContain('original submission label is unavailable');
  });

  it('adopts a re-fetched matching accepted run only after explicit confirmation', async () => {
    const accepted = { ...job, state: 'succeeded' as const };
    useTrainingStore.setState({
      datasetId: accepted.dataset_id, attemptSnapshotId: accepted.client_snapshot_id,
      attemptServerUrl: 'http://127.0.0.1:8787', admissionPending: true, attemptClientLabel: null,
    });
    vi.mocked(TrainingClient.prototype.job).mockResolvedValue(accepted);
    const { result } = renderHook(() => useTrainingSession());
    act(() => useTrainingStore.getState().setCurrentJob(accepted));

    await act(async () => {
      await expect(result.current.adoptSelectedJob()).rejects.toThrow('Confirm the selected run');
      await result.current.adoptSelectedJob(true);
    });

    expect(useTrainingStore.getState()).toMatchObject({
      admissionPending: false, attemptClientLabel: accepted.client_label,
      currentJobId: accepted.job_id, phase: 'succeeded',
    });
  });

  it('rejects selected-run adoption across servers or for mismatched attempt identity', async () => {
    useTrainingStore.setState({
      datasetId: job.dataset_id, attemptSnapshotId: job.client_snapshot_id,
      attemptServerUrl: 'http://127.0.0.1:9999', admissionPending: true, attemptClientLabel: null,
    });
    const { result } = renderHook(() => useTrainingSession());
    act(() => useTrainingStore.getState().setCurrentJob(job));
    await act(async () => {
      await expect(result.current.adoptSelectedJob(true)).rejects.toThrow('different training server');
    });
    act(() => useTrainingStore.setState({ attemptServerUrl: 'http://127.0.0.1:8787' }));
    vi.mocked(TrainingClient.prototype.job).mockResolvedValue({ ...job, dataset_id: 'another-dataset' });

    await act(async () => {
      await expect(result.current.adoptSelectedJob(true)).rejects.toThrow('does not match');
    });
    expect(useTrainingStore.getState().admissionPending).toBe(true);
  });

  it('does not adopt a delayed response after the selected run changes', async () => {
    const accepted = { ...job, state: 'succeeded' as const };
    const response = deferred<typeof accepted>();
    useTrainingStore.setState({
      datasetId: accepted.dataset_id, attemptSnapshotId: accepted.client_snapshot_id,
      attemptServerUrl: 'http://127.0.0.1:8787', admissionPending: true, attemptClientLabel: null,
    });
    vi.mocked(TrainingClient.prototype.job).mockImplementation(id => id === accepted.job_id
      ? response.promise
      : Promise.resolve({ ...accepted, job_id: id }));
    const { result } = renderHook(() => useTrainingSession());
    let adoption!: Promise<void>;
    act(() => {
      useTrainingStore.getState().setCurrentJob(accepted);
      adoption = result.current.adoptSelectedJob(true);
      useTrainingStore.getState().setCurrentJob({ ...accepted, job_id: 'newer-selection' });
    });
    await act(async () => {
      response.resolve(accepted);
      await expect(adoption).rejects.toThrow('selected run changed');
    });
    expect(useTrainingStore.getState()).toMatchObject({
      admissionPending: true, attemptClientLabel: null, currentJobId: 'newer-selection',
    });
  });

  it('freezes a legacy upload label before its first admission and preserves it on later retries', async () => {
    useTrainingStore.setState({ datasetId: wire.dataset.dataset_id, attemptSnapshotId: wire.dataset.client_snapshot_id,
      attemptServerUrl: 'http://127.0.0.1:8787', submissionKey: 'stable-key', clientLabel: 'first-frontend' });
    vi.spyOn(TrainingClient.prototype, 'dataset').mockResolvedValue(trainingDatasetSchema.parse({ ...wire.dataset, state: 'ready' }));
    const createJob = vi.spyOn(TrainingClient.prototype, 'createJob').mockRejectedValue(new Error('response lost'));
    const { result } = renderHook(() => useTrainingSession());
    await act(async () => { await result.current.start(); });
    expect(useTrainingStore.getState()).toMatchObject({ attemptClientLabel: 'first-frontend', admissionPending: true });
    act(() => useTrainingStore.setState({ clientLabel: 'another-frontend' }));
    await act(async () => { await result.current.start(); });
    expect(createJob).toHaveBeenCalledTimes(2);
    for (const call of createJob.mock.calls) expect(call.slice(0, 3)).toEqual([wire.dataset.dataset_id, 'stable-key', 'first-frontend']);
  });

  it('clears the persisted attempt label on explicit reset while preserving current frontend ownership', () => {
    useTrainingStore.setState({ attemptClientLabel: 'original-frontend', clientLabel: 'current-frontend',
      attemptSnapshotId: 'snapshot', attemptMaskSource: 'directory', attemptSourceFingerprint: 'a'.repeat(64),
      submissionKey: 'key', admissionPending: true });
    useTrainingStore.getState().resetAttempt();
    expect(useTrainingStore.getState()).toMatchObject({
      attemptClientLabel: null, attemptSnapshotId: null, submissionKey: null, admissionPending: false,
      attemptMaskSource: null, attemptSourceFingerprint: null, clientLabel: 'current-frontend',
    });
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEYS.training)!).state;
    expect(persisted.attemptClientLabel).toBeNull();
    expect(persisted).not.toHaveProperty('clientLabel');
  });

  it('does not let a delayed selected-run response override the newer selection', async () => {
    const old = deferred<typeof job>();
    vi.mocked(TrainingClient.prototype.job).mockImplementation(async id => id === 'old' ? old.promise : { ...job, job_id: id });
    const { result } = renderHook(() => useTrainingSession());
    let pending!: Promise<void>;
    act(() => { pending = result.current.selectRun('old'); });
    await act(async () => { await result.current.selectRun('new'); });
    await act(async () => { old.resolve({ ...job, job_id: 'old' }); await pending; });
    expect(useTrainingStore.getState().currentJobId).toBe('new');
  });

  it('requires confirmation for an explicit foreign ID without changing selected-job ownership', async () => {
    useTrainingStore.getState().setCurrentJob(job);
    const cancel = vi.spyOn(TrainingClient.prototype, 'cancelJob').mockResolvedValue({ ...job, job_id: 'foreign', state: 'cancelled' });
    const { result } = renderHook(() => useTrainingSession());
    await act(async () => {
      await expect(result.current.cancelJob('foreign')).rejects.toThrow('Confirm cancellation');
    });
    expect(cancel).not.toHaveBeenCalled();
    await act(async () => { await result.current.cancelJob('foreign', true); });
    expect(cancel.mock.calls[0][0]).toBe('foreign');
    expect(useTrainingStore.getState().currentJobId).toBe(job.job_id);
  });

  it('cancels a job owned by this browser without confirmation', async () => {
    const local = { ...job, client_label: useTrainingStore.getState().clientLabel };
    useTrainingStore.getState().setCurrentJob(local);
    const cancel = vi.spyOn(TrainingClient.prototype, 'cancelJob').mockResolvedValue({ ...local, state: 'cancelled' });
    const { result } = renderHook(() => useTrainingSession());
    await act(async () => { await result.current.cancel(); });
    expect(cancel).toHaveBeenCalledWith(local.job_id, expect.any(AbortSignal));
  });

  it('reports source recovery guidance after refresh instead of spinning on uploading', async () => {
    useTrainingStore.setState({ datasetId: wire.dataset.dataset_id, attemptSnapshotId: wire.dataset.client_snapshot_id,
      attemptServerUrl: 'http://127.0.0.1:8787', submissionKey: 'stable-key', snapshot: null });
    const read = vi.spyOn(TrainingClient.prototype, 'dataset').mockResolvedValue(trainingDatasetSchema.parse(wire.dataset));
    const { result } = renderHook(() => useTrainingSession());
    await act(async () => { await result.current.start(); });
    expect(read).toHaveBeenCalledOnce();
    expect(useTrainingStore.getState()).toMatchObject({ phase: 'idle', datasetId: wire.dataset.dataset_id });
    expect(useTrainingStore.getState()).toMatchObject({
      connectionError: null,
      operationError: expect.stringContaining('Original source files'),
    });
  });

  it('rebuilds runtime readers and resumes the same interrupted dataset identity', async () => {
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({ images: [] }), sourceType: 'local',
      loadedFiles: { imageFiles: new Map(), hasMasks: false },
    });
    const original = await createTrainingSnapshot({ maskSource: 'directory' });
    const dataset = trainingDatasetSchema.parse({
      dataset_id: 'recover-dataset', client_snapshot_id: original.id,
      coordinate_space: 'colmap', source_label: original.sourceLabel, state: 'uploading',
      files: original.files.map(entry => ({
        file_id: entry.id, path: entry.path, role: entry.role,
        image_name: entry.image_name ?? null, expected_bytes: entry.expectedBytes ?? null, receipt: null,
      })),
      file_ids: Object.fromEntries(original.files.map(entry => [entry.path, entry.id])),
    });
    useTrainingStore.setState({
      datasetId: dataset.dataset_id, attemptSnapshotId: original.id,
      attemptServerUrl: 'http://127.0.0.1:8787', attemptMaskSource: 'directory',
      attemptSourceFingerprint: original.sourceFingerprint ?? null,
      attemptClientLabel: 'original-frontend', submissionKey: 'recover-key', snapshot: null,
    });
    const read = vi.spyOn(TrainingClient.prototype, 'dataset').mockResolvedValue(dataset);
    const put = vi.spyOn(TrainingClient.prototype, 'uploadFile').mockImplementation(async (_datasetId, fileId, file) => ({
      file_id: fileId, bytes: file.size, sha256: await sha256Hex(file),
    }));
    vi.spyOn(TrainingClient.prototype, 'finalizeDataset').mockResolvedValue({ ...dataset, state: 'ready' });
    const createJob = vi.spyOn(TrainingClient.prototype, 'createJob').mockResolvedValue({
      ...job, dataset_id: dataset.dataset_id, client_snapshot_id: original.id, client_label: 'original-frontend',
    });

    const { result } = renderHook(() => useTrainingSession());
    await act(async () => { await result.current.start(); });

    expect(read).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenCalledTimes(original.files.length);
    expect(createJob).toHaveBeenCalledWith(dataset.dataset_id, 'recover-key', 'original-frontend', expect.any(AbortSignal));
    expect(useTrainingStore.getState()).toMatchObject({
      attemptSnapshotId: original.id, datasetId: dataset.dataset_id, phase: 'running', operationError: null,
      snapshot: { id: original.id, sourceFingerprint: original.sourceFingerprint, verifyUploadedReceipts: true },
    });
  });

  it('keeps an interrupted attempt isolated from a different loaded reconstruction', async () => {
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({ images: [] }), sourceType: 'local',
      loadedFiles: { imageFiles: new Map(), hasMasks: false },
    });
    const original = await createTrainingSnapshot({ maskSource: 'directory' });
    const dataset = trainingDatasetSchema.parse({
      dataset_id: 'recover-dataset', client_snapshot_id: original.id,
      coordinate_space: 'colmap', source_label: original.sourceLabel, state: 'uploading',
      files: original.files.map(entry => ({
        file_id: entry.id, path: entry.path, role: entry.role,
        image_name: entry.image_name ?? null, expected_bytes: entry.expectedBytes ?? null, receipt: null,
      })),
      file_ids: Object.fromEntries(original.files.map(entry => [entry.path, entry.id])),
    });
    useTrainingStore.setState({
      datasetId: dataset.dataset_id, attemptSnapshotId: original.id,
      attemptServerUrl: 'http://127.0.0.1:8787', attemptMaskSource: 'directory',
      attemptSourceFingerprint: original.sourceFingerprint ?? null,
      attemptClientLabel: 'original-frontend', submissionKey: 'recover-key', snapshot: null,
    });
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({ images: [], cameras: [buildCamera({ width: 800 })] }),
    });
    const read = vi.spyOn(TrainingClient.prototype, 'dataset').mockResolvedValue(dataset);
    const put = vi.spyOn(TrainingClient.prototype, 'uploadFile');
    const createJob = vi.spyOn(TrainingClient.prototype, 'createJob');

    const { result } = renderHook(() => useTrainingSession());
    await act(async () => { await result.current.start(); });

    expect(read).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
    expect(useTrainingStore.getState()).toMatchObject({
      attemptSnapshotId: original.id, datasetId: dataset.dataset_id, phase: 'idle', snapshot: null,
      operationError: expect.stringContaining('does not match this interrupted upload'),
    });
  });

  it('recreates a dataset forgotten by a restarted service under the same attempt identity', async () => {
    useReconstructionStore.setState({
      reconstruction: buildReconstruction({ images: [] }), sourceType: 'local',
      loadedFiles: { imageFiles: new Map(), hasMasks: false },
    });
    const snapshot = await createTrainingSnapshot({ maskSource: 'directory' });
    useTrainingStore.getState().setSnapshot(snapshot);
    useTrainingStore.setState({
      datasetId: 'forgotten-dataset', attemptSnapshotId: snapshot.id,
      attemptServerUrl: 'http://127.0.0.1:8787', attemptMaskSource: 'directory',
      attemptSourceFingerprint: snapshot.sourceFingerprint ?? null,
      attemptClientLabel: 'original-frontend', submissionKey: 'recover-key',
      attemptRecipe: {
        base_recipe_id: wire.config.recipe_id, recipe_id: wire.config.recipe_id,
        settings_schema_version: 0, settings: {}, effective_settings: {},
        recipe_summary: wire.config.recipe_summary,
        input_requirements: { mask_source: 'directory' },
      },
    });
    const ready = trainingDatasetSchema.parse({
      ...wire.dataset, dataset_id: 'replacement-dataset', client_snapshot_id: snapshot.id, state: 'ready',
    });
    const read = vi.spyOn(TrainingClient.prototype, 'dataset')
      .mockRejectedValueOnce(new TrainingApiError('Dataset was not found.', 404, 'dataset_not_found'))
      .mockResolvedValue(ready);
    const createDataset = vi.spyOn(TrainingClient.prototype, 'createDataset')
      .mockResolvedValue({
        id: ready.dataset_id, files: [], baseRecipeId: null, recipeId: ready.recipe_id,
        settingsSchemaVersion: null, recipeSummary: ready.recipe_summary,
        inputRequirements: ready.input_requirements, settings: {}, effectiveSettings: {},
      });
    const createJob = vi.spyOn(TrainingClient.prototype, 'createJob').mockResolvedValue({
      ...job, dataset_id: ready.dataset_id, client_snapshot_id: snapshot.id, client_label: 'original-frontend',
    });

    const { result } = renderHook(() => useTrainingSession());
    await act(async () => { await result.current.start(); });

    expect(read).toHaveBeenCalledTimes(2);
    expect(createDataset).toHaveBeenCalledWith(snapshot, expect.any(AbortSignal));
    expect(createJob).toHaveBeenCalledWith(ready.dataset_id, 'recover-key', 'original-frontend', expect.any(AbortSignal));
    expect(useTrainingStore.getState()).toMatchObject({ datasetId: ready.dataset_id, phase: 'running' });
  });

  it('does not recreate a missing legacy dataset under current startup defaults', async () => {
    useTrainingStore.setState({
      datasetId: 'forgotten-legacy-dataset', attemptSnapshotId: 'legacy-snapshot',
      attemptServerUrl: 'http://127.0.0.1:8787', attemptMaskSource: 'directory',
      attemptClientLabel: 'original-frontend', submissionKey: 'legacy-key',
      attemptRecipe: null, legacyAttempt: true,
    });
    vi.spyOn(TrainingClient.prototype, 'dataset').mockRejectedValue(
      new TrainingApiError('Dataset was not found.', 404, 'dataset_not_found'),
    );
    const createDataset = vi.spyOn(TrainingClient.prototype, 'createDataset');
    const createJob = vi.spyOn(TrainingClient.prototype, 'createJob');
    const { result } = renderHook(() => useTrainingSession());

    await act(async () => { await result.current.start(); });

    expect(createDataset).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
    expect(useTrainingStore.getState()).toMatchObject({
      legacyAttempt: true, datasetId: 'forgotten-legacy-dataset', phase: 'idle',
      operationError: expect.stringContaining('cannot be reconstructed safely'),
    });
  });

  it('can abandon an attempt whose dataset disappeared after a service restart', async () => {
    useTrainingStore.setState({
      datasetId: 'forgotten-dataset', attemptSnapshotId: 'snapshot',
      attemptServerUrl: 'http://127.0.0.1:8787', submissionKey: 'recover-key',
    });
    vi.spyOn(TrainingClient.prototype, 'cancelDataset')
      .mockRejectedValue(new TrainingApiError('Dataset was not found.', 404, 'dataset_not_found'));

    const { result } = renderHook(() => useTrainingSession());
    await act(async () => { await result.current.abandonAttempt(); });

    expect(useTrainingStore.getState()).toMatchObject({
      datasetId: null, attemptSnapshotId: null, submissionKey: null, phase: 'idle',
    });
  });

  it('can abandon a recipe captured before snapshot allocation', async () => {
    useTrainingStore.setState({
      attemptRecipe: resolvedRecipe,
      attemptServerUrl: 'http://127.0.0.1:8787',
      phase: 'idle',
    });
    const cancelDataset = vi.spyOn(TrainingClient.prototype, 'cancelDataset');
    const { result } = renderHook(() => useTrainingSession());

    await act(async () => { await result.current.abandonAttempt(); });

    expect(cancelDataset).not.toHaveBeenCalled();
    expect(useTrainingStore.getState()).toMatchObject({
      attemptRecipe: null, attemptServerUrl: null, attemptSnapshotId: null, phase: 'idle',
    });
  });

  it('replaces rotated log segments and ignores repeated cursors', () => {
    const state = useTrainingStore.getState();
    state.appendLogs('old', '0:3'); state.appendLogs('old', '0:3');
    expect(useTrainingStore.getState().logs).toBe('old');
    state.appendLogs('new', '1:3');
    expect(useTrainingStore.getState().logs).toBe('new');
  });

  it('retains a truncation receipt when the local log window is bounded', () => {
    const state = useTrainingStore.getState();
    state.appendLogs('x'.repeat(70_000), '0:70000');
    expect(useTrainingStore.getState().logs).toHaveLength(65_536);
    expect(useTrainingStore.getState().logsTruncated).toBe(true);
  });
});
