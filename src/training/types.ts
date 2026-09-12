import type { Sim3dEuler } from '../types/sim3d';
/** Public, backend-neutral browser contract for the local training service. */
export type TrainingAuthenticationMode = 'local' | 'bearer';

export interface TrainingAuthentication {
  mode: TrainingAuthenticationMode;
  token_required: boolean;
}

export interface TrainingHealth {
  api_version: string;
  instance_id: string;
  ready: boolean;
  busy: boolean;
  backend_available: boolean;
  /** Missing on the original v1 service; the client falls back to its 401 flow. */
  authentication?: TrainingAuthentication;
}

export type TrainingSettingValue = boolean | number | string | null;
export type TrainingSettings = Record<string, TrainingSettingValue>;

export interface TrainingSettingCondition {
  key: string;
  equals: TrainingSettingValue;
}

export interface TrainingSettingChoice {
  value: TrainingSettingValue;
  label: string;
}

export interface TrainingSettingField {
  key: string;
  label: string;
  description: string;
  group: string;
  value_type: 'boolean' | 'integer' | 'number' | 'enum';
  default: TrainingSettingValue;
  minimum?: number | null;
  maximum?: number | null;
  step?: number | null;
  choices?: TrainingSettingChoice[] | null;
  nullable?: boolean;
  null_label?: string | null;
  zero_label?: string | null;
  advanced?: boolean;
  enabled_when?: TrainingSettingCondition[] | null;
}

export interface TrainingEditableSettings {
  schema_version: number;
  fields: TrainingSettingField[];
}

export interface TrainingInputRequirements {
  mask_source: 'none' | 'directory' | 'alpha' | 'auto';
  /** Additive API v1 capability; absent on older servers and therefore fail-closed. */
  missing_mask_policy?: 'error' | 'full_foreground';
  missing_mask_transport?: 'materialize' | 'omit';
}

export interface TrainingResolvedRecipe {
  base_recipe_id: string;
  recipe_id: string;
  settings_schema_version: number;
  /** Canonical sparse overrides; omitted keys continue to inherit the server default. */
  settings: TrainingSettings;
  effective_settings: TrainingSettings;
  recipe_summary: TrainingRecipeSummary;
  input_requirements: TrainingInputRequirements;
}

export interface TrainingRecipeSelection {
  base_recipe_id: string;
  expected_recipe_id: string;
  settings_schema_version: number;
  settings: TrainingSettings;
}

export function recipeSelectionFromResolution(recipe: TrainingResolvedRecipe): TrainingRecipeSelection {
  return {
    base_recipe_id: recipe.base_recipe_id,
    expected_recipe_id: recipe.recipe_id,
    settings_schema_version: recipe.settings_schema_version,
    settings: { ...recipe.settings },
  };
}

export type TrainingJobState =
  | 'queued'
  | 'starting'
  | 'running'
  | 'finalizing'
  | 'succeeded'
  | 'failed'
  | 'cancelling'
  | 'cancelled';

export type TrainingSessionPhase =
  | 'idle'
  | 'preparing'
  | 'training'
  | 'uploading'
  | 'validating'
  | TrainingJobState
  | 'disconnected';

export type TrainingRecipeSummary = Record<string, unknown>;

export interface TrainingBackendInfo {
  backend_id: string;
  version: string;
  display_name: string;
  available: boolean;
  unavailable_reason: string | null;
  input_formats: string[];
  /** @deprecated API v1 originally used this name for mask sources. */
  mask_modes: string[];
  mask_sources: string[];
  mask_loss_modes: string[];
  preview_formats: string[];
  artifact_formats: string[];
  progress_units: string[];
  cooperative_cancel?: boolean;
}

export interface TrainingConfig {
  api_version: string;
  backend: TrainingBackendInfo;
  recipe_id: string;
  recipe_summary: TrainingRecipeSummary;
  input_requirements: TrainingInputRequirements;
  /** Missing on older v1 servers, which remain startup-recipe/read-only. */
  editable_settings?: TrainingEditableSettings | null;
  limits: Record<string, number>;
}

export interface TrainingProgress {
  elapsed_s?: number | null;
  optimizer_step?: number | null;
  image_exposures?: number | null;
  target_optimizer_steps?: number | null;
  target_image_exposures?: number | null;
  total_splats?: number | null;
  shown_splats?: number | null;
  metrics: Record<string, number>;
  metrics_step?: number | null;
}

export interface TrainingArtifact {
  artifact_id: string;
  url: string;
  format: string;
  content_type: string;
  bytes: number;
  sha256: string;
  coordinate_space: string;
}

export interface TrainingJob {
  job_id: string;
  client_snapshot_id: string;
  backend_id: string;
  backend_version: string;
  /** Null only when an older stored job cannot prove its base recipe. */
  base_recipe_id: string | null;
  recipe_id: string;
  settings_schema_version: number | null;
  recipe_summary: TrainingRecipeSummary;
  input_requirements: TrainingInputRequirements;
  settings: TrainingSettings;
  effective_settings: TrainingSettings;
  state: TrainingJobState;
  phase: string | null;
  dataset_id: string;
  source_label: string;
  client_label: string;
  queue_position: number | null;
  jobs_ahead: number | null;
  error: { field: string; code: string; detail?: string | null } | null;
  progress?: TrainingProgress | null;
  artifacts?: TrainingArtifact[];
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  enqueue_sequence: number;
}

export interface TrainingQueue {
  revision: number;
  capacity: number;
  active_job: TrainingJob | null;
  waiting: TrainingJob[];
  blocked_reason: string | null;
}

export interface TrainingDatasetFile {
  file_id: string;
  path: string;
  role: 'model' | 'image' | 'mask';
  image_name: string | null;
  expected_bytes: number | null;
  receipt: { file_id: string; bytes: number; sha256: string } | null;
}

export interface TrainingDatasetStatus {
  dataset_id: string;
  client_snapshot_id: string;
  coordinate_space: 'colmap';
  source_label: string;
  state: 'uploading' | 'validating' | 'ready' | 'invalid' | 'cancelling' | 'cancelled';
  files: TrainingDatasetFile[];
  file_ids: Record<string, string>;
  limits: Record<string, number>;
  errors: Array<{ field: string; code: string; detail?: string | null }>;
  errors_truncated: boolean;
  total_errors: number;
  /** Null only for an unproven dataset created by the pre-settings service. */
  base_recipe_id: string | null;
  recipe_id: string | null;
  settings_schema_version: number | null;
  recipe_summary: TrainingRecipeSummary;
  input_requirements: TrainingInputRequirements;
  settings: TrainingSettings;
  effective_settings: TrainingSettings;
}

export interface TrainingLogChunk {
  text: string;
  next_cursor: string;
  truncated?: boolean;
}

export interface TrainingSnapshotFile {
  id: string;
  role: 'model' | 'image' | 'mask';
  path: string;
  /** Model files are captured bytes; images/masks resolve only in a bounded upload worker. */
  file?: File;
  expectedBytes?: number | null;
  /** Internal conservative encoded-payload reservation; not part of the wire manifest. */
  preparationBytes?: number;
  /** Captured model digest; avoids hashing immutable model bytes again before PUT. */
  expectedSha256?: string;
  /** Cancellation belongs to the current upload attempt, never snapshot creation. */
  read: (signal?: AbortSignal) => Promise<File>;
  image_name?: string;
}

export interface TrainingSnapshot {
  splatTransformBaseline?: Sim3dEuler;
  id: string;
  sourceId: string;
  sourceLabel: string;
  /** Stable digest of the COLMAP model and upload manifest, never source image bytes. */
  sourceFingerprint?: string;
  /** Recovery snapshots verify every existing server receipt before mixing in new uploads. */
  verifyUploadedReceipts?: boolean;
  imageCount: number;
  pointCount: number;
  files: TrainingSnapshotFile[];
}

export interface TrainingUploadProgress {
  completedFiles: number;
  totalFiles: number;
  uploadedBytes: number;
  totalBytes: number;
  currentFile: string | null;
}

export interface TrainingPreviewFrame {
  file: File | null;
  etag: string | null;
  optimizerStep: number | null;
  imageExposures: number | null;
  capturedAt: string | null;
  version?: number | null;
  totalSplats?: number | null;
  shownSplats?: number | null;
  jobId?: string | null;
  snapshotId?: string | null;
  coordinateSpace?: string | null;
  format?: 'spz' | 'ply' | null;
}
