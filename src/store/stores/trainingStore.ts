import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sanitizeTrainingSettings, trainingSettingsDraftKey } from '../../training/trainingSettings';
import type {
  TrainingAuthenticationMode,
  TrainingConfig,
  TrainingJob,
  TrainingQueue,
  TrainingResolvedRecipe,
  TrainingSessionPhase,
  TrainingSettings,
  TrainingSnapshot,
  TrainingUploadProgress,
} from '../../training/types';
import { STORAGE_KEYS } from '../migration';

export interface TrainingSnapshotAssociation {
  id: string;
  sourceId: string;
  sourceLabel: string;
  splatTransformBaseline: TrainingSnapshot['splatTransformBaseline'];
}

function createClientLabel(): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `colmapview-${id}`;
}

export interface TrainingState {
  dockOpen: boolean;
  serverUrl: string;
  /** Deliberately not persisted; a browser session owns the bearer token. */
  token: string;
  authenticationMode: 'unknown' | TrainingAuthenticationMode;
  tokenRequired: boolean;
  connected: boolean;
  requestsEnabled: boolean;
  serverInstanceId: string | null;
  connectionGeneration: number;
  selectionGeneration: number;
  /** Stable for this loaded frontend only; it grants no authorization. */
  clientLabel: string;
  /** Immutable create-job body identity for this persisted attempt, including replay. */
  attemptClientLabel: string | null;
  attemptServerUrl: string | null;
  attemptSnapshotId: string | null;
  /** Frozen input policy used to reconstruct runtime-only readers after reload. */
  attemptMaskSource: 'none' | 'directory' | 'alpha' | 'auto' | null;
  /** Persisted model/manifest identity used to reject a different reconstruction on resume. */
  attemptSourceFingerprint: string | null;
  cancellationPending: boolean;
  admissionPending: boolean;
  connectionError: string | null;
  operationError: string | null;
  config: TrainingConfig | null;
  /** Sparse, server-scoped overrides. Omitted keys inherit the server recipe. */
  settingsDraft: TrainingSettings;
  settingsDraftKey: string | null;
  settingsErrors: Record<string, string>;
  /** Immutable recipe captured before any snapshot files are prepared. */
  attemptRecipe: TrainingResolvedRecipe | null;
  /** An interrupted pre-settings attempt whose recipe cannot yet be proven. */
  legacyAttempt: boolean;
  phase: TrainingSessionPhase;
  snapshot: TrainingSnapshot | null;
  /** Lightweight result identity only; upload File/read handles are never retained here. */
  snapshotAssociations: Record<string, TrainingSnapshotAssociation>;
  datasetId: string | null;
  submissionKey: string | null;
  currentJobId: string | null;
  currentJob: TrainingJob | null;
  queue: TrainingQueue | null;
  recentRuns: TrainingJob[];
  upload: TrainingUploadProgress | null;
  logs: string;
  logCursor: string | null;
  logsTruncated: boolean;
  logsExpanded: boolean;
  previewEnabled: boolean;
  previewActive: boolean;
  finalLoadedJobId: string | null;
  previewError: string | null;
  previewFile: File | null;
  previewEtag: string | null;
  previewUpdatedAt: number | null;
  previewCapturedAt: string | null;
  previewShownSplats: number | null;
  previewTotalSplats: number | null;
  setDockOpen: (open: boolean) => void;
  setServerUrl: (url: string) => void;
  setToken: (token: string) => void;
  setAuthentication: (mode: 'unknown' | TrainingAuthenticationMode, tokenRequired: boolean) => void;
  setConnected: (connected: boolean, error?: string | null) => void;
  setConfig: (config: TrainingConfig | null) => void;
  setSettingsDraft: (settings: TrainingSettings) => void;
  setSettingsErrors: (errors: Record<string, string>) => void;
  setAttemptRecipe: (recipe: TrainingResolvedRecipe | null) => void;
  setPhase: (phase: TrainingSessionPhase) => void;
  setSnapshot: (snapshot: TrainingSnapshot | null) => void;
  setDatasetId: (id: string | null) => void;
  setSubmissionKey: (key: string | null) => void;
  setCurrentJob: (job: TrainingJob | null) => void;
  setQueue: (queue: TrainingQueue | null) => void;
  setUpload: (upload: TrainingUploadProgress | null) => void;
  appendLogs: (text: string, cursor: string | null, truncated?: boolean) => void;
  setLogsExpanded: (expanded: boolean) => void;
  setPreviewEnabled: (enabled: boolean) => void;
  setPreview: (file: File | null, etag: string | null) => void;
  resetAttempt: () => void;
}

const DEFAULT_UPLOAD: TrainingUploadProgress = {
  completedFiles: 0, totalFiles: 0, uploadedBytes: 0, totalBytes: 0, currentFile: null,
};

function restoredRecipe(value: unknown): TrainingResolvedRecipe | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<TrainingResolvedRecipe>;
  const input = candidate.input_requirements;
  if (typeof candidate.base_recipe_id !== 'string' || !candidate.base_recipe_id
    || typeof candidate.recipe_id !== 'string' || !candidate.recipe_id
    || !Number.isSafeInteger(candidate.settings_schema_version)
    || (candidate.settings_schema_version ?? -1) < 0
    || !input || !['none', 'directory', 'alpha', 'auto'].includes(input.mask_source)) return null;
  const summary = candidate.recipe_summary && typeof candidate.recipe_summary === 'object'
    && !Array.isArray(candidate.recipe_summary) ? candidate.recipe_summary : {};
  return {
    base_recipe_id: candidate.base_recipe_id,
    recipe_id: candidate.recipe_id,
    settings_schema_version: candidate.settings_schema_version!,
    settings: sanitizeTrainingSettings(candidate.settings),
    effective_settings: sanitizeTrainingSettings(candidate.effective_settings),
    recipe_summary: summary,
    input_requirements: {
      mask_source: input.mask_source,
      missing_mask_policy: input.missing_mask_policy === 'full_foreground' ? 'full_foreground' : 'error',
    },
  };
}

function hasPersistedAttempt(state: Partial<TrainingState>): boolean {
  return Boolean(state.attemptSnapshotId || state.datasetId || state.submissionKey || state.admissionPending);
}

function persistedTrainingState(state: TrainingState) {
  return {
    serverUrl: state.serverUrl,
    currentJobId: state.currentJobId,
    submissionKey: state.submissionKey,
    datasetId: state.datasetId,
    attemptClientLabel: state.attemptClientLabel,
    attemptServerUrl: state.attemptServerUrl,
    attemptSnapshotId: state.attemptSnapshotId,
    attemptMaskSource: state.attemptMaskSource,
    attemptSourceFingerprint: state.attemptSourceFingerprint,
    attemptRecipe: state.attemptRecipe,
    legacyAttempt: state.legacyAttempt,
    settingsDraft: state.settingsDraft,
    settingsDraftKey: state.settingsDraftKey,
    cancellationPending: state.cancellationPending,
    admissionPending: state.admissionPending,
    previewEnabled: state.previewEnabled,
  };
}

type TrainingPersistedState = ReturnType<typeof persistedTrainingState>;

export const useTrainingStore = create<TrainingState>()(persist<TrainingState, [], [], TrainingPersistedState>((set) => ({
  dockOpen: false,
  serverUrl: 'http://127.0.0.1:8787',
  token: '',
  authenticationMode: 'unknown',
  tokenRequired: false,
  connected: false,
  requestsEnabled: false,
  serverInstanceId: null,
  connectionGeneration: 0,
  selectionGeneration: 0,
  clientLabel: createClientLabel(),
  attemptClientLabel: null,
  attemptServerUrl: null,
  attemptSnapshotId: null,
  attemptMaskSource: null,
  attemptSourceFingerprint: null,
  cancellationPending: false,
  admissionPending: false,
  connectionError: null,
  operationError: null,
  config: null,
  settingsDraft: {},
  settingsDraftKey: null,
  settingsErrors: {},
  attemptRecipe: null,
  legacyAttempt: false,
  phase: 'idle',
  snapshot: null,
  snapshotAssociations: {},
  datasetId: null,
  submissionKey: null,
  currentJobId: null,
  currentJob: null,
  queue: null,
  recentRuns: [],
  upload: null,
  logs: '',
  logCursor: null,
  logsTruncated: false,
  logsExpanded: false,
  previewEnabled: true,
  previewActive: false,
  finalLoadedJobId: null,
  previewError: null,
  previewFile: null,
  previewEtag: null,
  previewUpdatedAt: null,
  previewCapturedAt: null,
  previewShownSplats: null,
  previewTotalSplats: null,
  setDockOpen: (dockOpen) => set({ dockOpen }),
  setServerUrl: (serverUrl) => set(state => ({
    serverUrl,
    token: '',
    authenticationMode: 'unknown',
    tokenRequired: false,
    connectionGeneration: state.connectionGeneration + 1,
    selectionGeneration: state.selectionGeneration + 1,
    connected: false,
    requestsEnabled: false,
    connectionError: null,
    config: null,
    settingsDraft: {},
    settingsDraftKey: null,
    settingsErrors: {},
    queue: null,
    recentRuns: [],
    // Job IDs are scoped to one service. Disconnect/reconnect preserves the
    // selection, but choosing another endpoint must never replay it there.
    currentJobId: null,
    currentJob: null,
    phase: 'idle',
    logs: '',
    logCursor: null,
    logsTruncated: false,
    finalLoadedJobId: null,
  })),
  setToken: (token) => set(state => ({
    token,
    connectionGeneration: state.connectionGeneration + 1,
    connected: false,
    requestsEnabled: false,
    connectionError: null,
    phase: state.currentJobId ? 'disconnected' : state.phase,
  })),
  setAuthentication: (authenticationMode, tokenRequired) => set({
    authenticationMode,
    tokenRequired,
  }),
  setConnected: (connected, connectionError = null) => set({ connected, connectionError }),
  setConfig: (config) => set((state) => {
    if (!config) return { config };
    const nextDraftKey = trainingSettingsDraftKey(state.serverUrl, config);
    return {
      config,
      settingsDraftKey: nextDraftKey,
      ...(state.settingsDraftKey === nextDraftKey ? {} : { settingsDraft: {}, settingsErrors: {} }),
    };
  }),
  setSettingsDraft: (settingsDraft) => set({ settingsDraft: sanitizeTrainingSettings(settingsDraft), settingsErrors: {} }),
  setSettingsErrors: (settingsErrors) => set({ settingsErrors }),
  setAttemptRecipe: (attemptRecipe) => set({
    attemptRecipe: restoredRecipe(attemptRecipe),
    legacyAttempt: false,
  }),
  setPhase: (phase) => set({ phase }),
  setSnapshot: (snapshot) => set((state) => ({
    snapshot,
    ...(snapshot ? {
      snapshotAssociations: {
        ...state.snapshotAssociations,
        [snapshot.id]: {
          id: snapshot.id,
          sourceId: snapshot.sourceId,
          sourceLabel: snapshot.sourceLabel,
          splatTransformBaseline: snapshot.splatTransformBaseline
            ? { ...snapshot.splatTransformBaseline }
            : undefined,
        },
      },
    } : {}),
  })),
  setDatasetId: (datasetId) => set({ datasetId }),
  setSubmissionKey: (submissionKey) => set({ submissionKey }),
  setCurrentJob: (currentJob) => set((state) => ({ currentJob, currentJobId: currentJob?.job_id ?? null,
    ...(currentJob?.job_id !== state.currentJobId ? {
      logs: '', logCursor: null, logsTruncated: false, finalLoadedJobId: null,
      previewCapturedAt: null, previewShownSplats: null, previewTotalSplats: null,
      selectionGeneration: state.selectionGeneration + 1,
    } : {}) })),
  setQueue: (queue) => set((state) => !queue || !state.queue || queue.revision >= state.queue.revision ? { queue } : {}),
  setUpload: (upload) => set({ upload }),
  appendLogs: (text, logCursor, truncated = false) => set((state) => {
    if (logCursor === state.logCursor) return {};
    const oldGeneration = state.logCursor?.split(':')[0];
    const newGeneration = logCursor?.split(':')[0];
    const rotated = Boolean(oldGeneration && oldGeneration !== newGeneration);
    const combined = `${rotated ? '' : state.logs}${text}`;
    return {
      logs: combined.slice(-65536),
      logCursor,
      logsTruncated: truncated || combined.length > 65536 || (!rotated && state.logsTruncated),
    };
  }),
  setLogsExpanded: (logsExpanded) => set({ logsExpanded }),
  setPreviewEnabled: (previewEnabled) => set({ previewEnabled }),
  setPreview: (previewFile, previewEtag) => set({
    previewFile,
    previewEtag,
    previewUpdatedAt: previewFile ? Date.now() : null,
    ...(!previewFile ? { previewCapturedAt: null, previewShownSplats: null, previewTotalSplats: null } : {}),
  }),
  resetAttempt: () => set({
    phase: 'idle', snapshot: null, datasetId: null, submissionKey: null, upload: null,
    logs: '', logCursor: null, logsTruncated: false,
    attemptClientLabel: null, attemptServerUrl: null, attemptSnapshotId: null,
    attemptMaskSource: null, attemptSourceFingerprint: null,
    attemptRecipe: null, legacyAttempt: false, settingsErrors: {},
    cancellationPending: false, admissionPending: false, operationError: null, connectionError: null,
    previewFile: null, previewEtag: null, previewUpdatedAt: null, previewCapturedAt: null,
    previewShownSplats: null, previewTotalSplats: null, previewActive: false, previewError: null,
  }),
}), {
  name: STORAGE_KEYS.training,
  partialize: persistedTrainingState,
  version: 1,
  migrate: (persisted, version) => {
    const saved = persisted && typeof persisted === 'object' ? persisted as Partial<TrainingPersistedState> : {};
    if (version >= 1) return saved as TrainingPersistedState;
    return {
      ...saved,
      legacyAttempt: hasPersistedAttempt(saved) && !restoredRecipe(saved.attemptRecipe),
    } as TrainingPersistedState;
  },
  // A tab/page is a frontend for display ownership. Never hydrate an older
  // localStorage label shared by every tab; reloads may conservatively treat
  // the recovered job as foreign and request confirmation.
  merge: (persisted, current) => {
    const saved = persisted && typeof persisted === 'object' ? persisted as Partial<TrainingState> : {};
    return {
      ...current,
      ...saved,
      clientLabel: current.clientLabel,
      token: '',
      authenticationMode: 'unknown',
      tokenRequired: false,
      attemptClientLabel: typeof saved.attemptClientLabel === 'string' && saved.attemptClientLabel.length > 0
        ? saved.attemptClientLabel : null,
      attemptMaskSource: ['none', 'directory', 'alpha', 'auto'].includes(saved.attemptMaskSource ?? '')
        ? saved.attemptMaskSource as TrainingState['attemptMaskSource'] : null,
      attemptSourceFingerprint: typeof saved.attemptSourceFingerprint === 'string'
        && /^[a-f0-9]{64}$/.test(saved.attemptSourceFingerprint)
        ? saved.attemptSourceFingerprint : null,
      attemptRecipe: restoredRecipe(saved.attemptRecipe),
      legacyAttempt: typeof saved.legacyAttempt === 'boolean'
        ? saved.legacyAttempt
        : hasPersistedAttempt(saved) && !restoredRecipe(saved.attemptRecipe),
      settingsDraft: sanitizeTrainingSettings(saved.settingsDraft),
      settingsDraftKey: typeof saved.settingsDraftKey === 'string' ? saved.settingsDraftKey : null,
      settingsErrors: {},
    };
  },
}));

export { DEFAULT_UPLOAD };
