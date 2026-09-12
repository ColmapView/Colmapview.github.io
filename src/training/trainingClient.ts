import { z } from 'zod';
import type {
  TrainingConfig,
  TrainingDatasetStatus,
  TrainingHealth,
  TrainingJob,
  TrainingLogChunk,
  TrainingPreviewFrame,
  TrainingQueue,
  TrainingRecipeSelection,
  TrainingResolvedRecipe,
  TrainingSettingValue,
  TrainingSettings,
  TrainingSnapshot,
} from './types';
import { isTrainingPreviewFormat } from './trainingPreviewFormat';

const API_PREFIX = '/api/v1';
const DEFAULT_BROWSER_PREVIEW_MAX_BYTES = 128 * 1024 * 1024;

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const settingValueSchema: z.ZodType<TrainingSettingValue> = z.union([
  z.boolean(), z.number().finite(), z.string(), z.null(),
]);
const settingsSchema: z.ZodType<TrainingSettings> = z.record(z.string(), settingValueSchema);
const inputRequirementsSchema = z.object({
  mask_source: z.enum(['none', 'directory', 'alpha', 'auto']).default('none'),
  missing_mask_policy: z.enum(['error', 'full_foreground']).default('error'),
  missing_mask_transport: z.enum(['materialize', 'omit']).optional(),
});
const authenticationSchema = z.object({
  mode: z.enum(['local', 'bearer']), token_required: z.boolean(),
});
export const trainingHealthSchema: z.ZodType<TrainingHealth> = z.object({
  api_version: z.string().default('1.0'), instance_id: z.string(), ready: z.boolean(),
  busy: z.boolean(), backend_available: z.boolean(), authentication: authenticationSchema.optional(),
});
const settingChoiceSchema = z.object({ value: settingValueSchema, label: z.string() });
const settingConditionSchema = z.object({ key: z.string(), equals: settingValueSchema });
const settingFieldSchema = z.object({
  key: z.string(), label: z.string(), description: z.string(), group: z.string(),
  value_type: z.enum(['boolean', 'integer', 'number', 'enum']), default: settingValueSchema,
  minimum: z.number().finite().nullable().optional(), maximum: z.number().finite().nullable().optional(),
  step: z.number().finite().positive().nullable().optional(), choices: z.array(settingChoiceSchema).nullable().optional(),
  nullable: z.boolean().optional(), null_label: z.string().nullable().optional(),
  zero_label: z.string().nullable().optional(), advanced: z.boolean().optional(),
  enabled_when: z.array(settingConditionSchema).max(8).nullable().optional(),
});
const editableSettingsSchema = z.object({
  schema_version: count, fields: z.array(settingFieldSchema).max(64),
});
export const trainingResolvedRecipeSchema: z.ZodType<TrainingResolvedRecipe> = z.object({
  base_recipe_id: z.string(), recipe_id: z.string(), settings_schema_version: count,
  settings: settingsSchema.default({}), effective_settings: settingsSchema.default({}),
  recipe_summary: z.record(z.string(), z.unknown()).default({}),
  input_requirements: inputRequirementsSchema.default({ mask_source: 'none', missing_mask_policy: 'error' }),
});
const trainingIssueSchema = z.object({ field: z.string(), code: z.string(), detail: z.string().nullable().default(null) });
export const trainingProblemSchema = z.object({
  type: z.string(), title: z.string(), status: z.number().int(), detail: z.string(), instance: z.string(),
  code: z.string(), request_id: z.string(), errors: z.array(trainingIssueSchema).default([]),
  errors_truncated: z.boolean().default(false), total_errors: count.default(0),
});
export const trainingProgressSchema = z.object({
  elapsed_s: z.number().finite().nonnegative().nullish(),
  optimizer_step: count.nullish(), image_exposures: count.nullish(), target_optimizer_steps: count.nullish(),
  target_image_exposures: count.nullish(), total_splats: count.nullish(), shown_splats: count.nullish(),
  metrics: z.record(z.string(), z.number().finite()).default({}), metrics_step: count.nullish(),
});
export const trainingArtifactSchema = z.object({
  artifact_id: z.string(), url: z.string(), format: z.string(), content_type: z.string(), bytes: count,
  sha256: z.string(), coordinate_space: z.string().default('colmap'),
});
export const trainingJobSchema: z.ZodType<TrainingJob> = z.object({
  job_id: z.string(), dataset_id: z.string(), client_snapshot_id: z.string(), source_label: z.string(),
  client_label: z.string().default(''), backend_id: z.string(), backend_version: z.string(),
  base_recipe_id: z.string().nullable().default(null), recipe_id: z.string(),
  settings_schema_version: count.nullable().default(null),
  recipe_summary: z.record(z.string(), z.unknown()).default({}),
  input_requirements: inputRequirementsSchema.default({ mask_source: 'none', missing_mask_policy: 'error' }),
  settings: settingsSchema.default({}), effective_settings: settingsSchema.default({}),
  state: z.enum(['queued', 'starting', 'running', 'finalizing', 'cancelling', 'succeeded', 'failed', 'cancelled']),
  phase: z.string().nullable().default(null), created_at: z.string(), started_at: z.string().nullable().default(null), finished_at: z.string().nullable().default(null),
  enqueue_sequence: count, queue_position: count.nullable().default(null), jobs_ahead: count.nullable().default(null), progress: trainingProgressSchema.nullable().default(null),
  error: trainingIssueSchema.nullable().default(null),
  artifacts: z.array(trainingArtifactSchema).default([]),
});
export const trainingConfigSchema: z.ZodType<TrainingConfig> = z.object({
  api_version: z.string().default('1.0'), recipe_id: z.string(), recipe_summary: z.record(z.string(), z.unknown()),
  input_requirements: inputRequirementsSchema.default({ mask_source: 'none', missing_mask_policy: 'error' }),
  editable_settings: editableSettingsSchema.nullable().optional(),
  limits: z.record(z.string(), z.number().finite()),
  backend: z.object({
    backend_id: z.string(), version: z.string(), display_name: z.string(), available: z.boolean(), unavailable_reason: z.string().nullable().default(null),
    input_formats: z.array(z.string()), mask_modes: z.array(z.string()).default([]),
    mask_sources: z.array(z.string()).default([]), mask_loss_modes: z.array(z.string()).default([]),
    preview_formats: z.array(z.string()),
    artifact_formats: z.array(z.string()), progress_units: z.array(z.string()), cooperative_cancel: z.boolean().default(false),
  }),
});
export const trainingQueueSchema: z.ZodType<TrainingQueue> = z.object({
  revision: count, active_job: trainingJobSchema.nullable().default(null), waiting: z.array(trainingJobSchema), capacity: count,
  blocked_reason: z.string().nullable().default(null),
});
export const trainingLogSchema: z.ZodType<TrainingLogChunk> = z.object({ text: z.string(), next_cursor: z.string(), truncated: z.boolean().default(false) });
export const trainingReceiptSchema = z.object({ file_id: z.string(), bytes: count, sha256: z.string() });
export const trainingJobPageSchema = z.object({ items: z.array(trainingJobSchema), next_cursor: z.string().nullable().default(null) });
export const trainingDatasetSchema: z.ZodType<TrainingDatasetStatus> = z.object({
  dataset_id: z.string(),
  client_snapshot_id: z.string(), coordinate_space: z.literal('colmap').default('colmap'), source_label: z.string(),
  state: z.enum(['uploading', 'validating', 'ready', 'invalid', 'cancelling', 'cancelled']),
  files: z.array(z.object({
    file_id: z.string(), path: z.string(), role: z.enum(['model', 'image', 'mask']), image_name: z.string().nullable().default(null),
    expected_bytes: count.nullable().default(null), receipt: trainingReceiptSchema.nullable().default(null),
  })),
  file_ids: z.record(z.string(), z.string()),
  limits: z.record(z.string(), z.number().int()).default({}), errors: z.array(trainingIssueSchema).default([]),
  errors_truncated: z.boolean().default(false), total_errors: count.default(0),
  base_recipe_id: z.string().nullable().default(null), recipe_id: z.string().nullable().default(null),
  settings_schema_version: count.nullable().default(null),
  recipe_summary: z.record(z.string(), z.unknown()).default({}),
  input_requirements: inputRequirementsSchema.default({ mask_source: 'none', missing_mask_policy: 'error' }),
  settings: settingsSchema.default({}), effective_settings: settingsSchema.default({}),
});

export class TrainingApiError extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly issues: Array<{ field: string; code: string; detail: string | null }>;

  constructor(
    message: string,
    status?: number,
    code?: string,
    issues: Array<{ field: string; code: string; detail: string | null }> = [],
  ) {
    super(message);
    this.name = 'TrainingApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export interface TrainingClientOptions {
  baseUrl: string;
  token?: string | null;
  fetchImpl?: typeof fetch;
}

/**
 * Small transport owner. It deliberately has no splatxx names: the browser only
 * knows the versioned HTTP contract and shows the server's effective recipe.
 */
export class TrainingClient {
  readonly baseUrl: string;
  private readonly token: string | null;
  private readonly fetchImpl: typeof fetch;
  private previewMaxBytes = DEFAULT_BROWSER_PREVIEW_MAX_BYTES;

  constructor({ baseUrl, token = null, fetchImpl = fetch }: TrainingClientOptions) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    // Browser fetch is a Web IDL method; preserve its Window receiver when stored.
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  async health(signal?: AbortSignal): Promise<TrainingHealth> {
    return this.request('/health', trainingHealthSchema, { signal });
  }

  async config(signal?: AbortSignal): Promise<TrainingConfig> {
    const config = await this.request('/config', trainingConfigSchema, { signal });
    const advertisedLimit = config.limits.max_preview_bytes;
    this.previewMaxBytes = Number.isSafeInteger(advertisedLimit) && advertisedLimit > 0
      ? Math.min(DEFAULT_BROWSER_PREVIEW_MAX_BYTES, advertisedLimit)
      : DEFAULT_BROWSER_PREVIEW_MAX_BYTES;
    return config;
  }

  async resolveRecipe(
    baseRecipeId: string,
    settingsSchemaVersion: number,
    settings: TrainingSettings,
    signal?: AbortSignal,
  ): Promise<TrainingResolvedRecipe> {
    return this.request('/recipes/resolve', trainingResolvedRecipeSchema, {
      method: 'POST',
      signal,
      body: JSON.stringify({
        base_recipe_id: baseRecipeId,
        settings_schema_version: settingsSchemaVersion,
        settings,
      }),
    });
  }

  async createDataset(
    snapshot: TrainingSnapshot,
    signal?: AbortSignal,
    recipeSelection?: TrainingRecipeSelection | null,
  ): Promise<{
      id: string;
      files: Array<{ id: string; path: string }>;
      baseRecipeId: string | null;
      recipeId: string | null;
      settingsSchemaVersion: number | null;
      recipeSummary: Record<string, unknown>;
      inputRequirements: TrainingDatasetStatus['input_requirements'];
      settings: TrainingSettings;
      effectiveSettings: TrainingSettings;
    }> {
    return this.request('/datasets', trainingDatasetSchema, {
      method: 'POST',
      signal,
      headers: { 'Idempotency-Key': snapshot.id },
      body: JSON.stringify({
        client_snapshot_id: snapshot.id,
        coordinate_space: 'colmap',
        source_label: snapshot.sourceLabel,
        ...(recipeSelection ? { recipe_selection: recipeSelection } : {}),
        files: snapshot.files.map((file) => ({
          role: file.role,
          path: file.path,
          image_name: file.image_name,
          expected_bytes: file.expectedBytes ?? file.file?.size ?? null,
        })),
      }),
    }).then((dataset) => ({
      id: dataset.dataset_id,
      files: dataset.files.map((file) => ({ id: file.file_id, path: file.path })),
      baseRecipeId: dataset.base_recipe_id,
      recipeId: dataset.recipe_id,
      settingsSchemaVersion: dataset.settings_schema_version,
      recipeSummary: dataset.recipe_summary,
      inputRequirements: dataset.input_requirements,
      settings: dataset.settings,
      effectiveSettings: dataset.effective_settings,
    }));
  }

  async uploadFile(datasetId: string, fileId: string, file: File, signal?: AbortSignal) {
    return this.request(`/datasets/${encodeURIComponent(datasetId)}/files/${encodeURIComponent(fileId)}`, trainingReceiptSchema, {
      method: 'PUT',
      signal,
      body: file,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  }

  async finalizeDataset(datasetId: string, signal?: AbortSignal) {
    return this.request(`/datasets/${encodeURIComponent(datasetId)}/finalize`, trainingDatasetSchema, {
      method: 'POST',
      signal,
      // The server caps this bounded wait and leaves validation running if the
      // request ends. Most localhost datasets return ready in this response,
      // eliminating a poll before FIFO admission.
      headers: { Prefer: 'wait=10' },
    });
  }

  async dataset(datasetId: string, signal?: AbortSignal) {
    return this.request(`/datasets/${encodeURIComponent(datasetId)}`, trainingDatasetSchema, { signal });
  }

  async cancelDataset(datasetId: string, signal?: AbortSignal) {
    return this.request(`/datasets/${encodeURIComponent(datasetId)}/cancel`, trainingDatasetSchema, { method: 'POST', signal });
  }

  async createJob(
    datasetId: string,
    idempotencyKey: string,
    clientLabel: string,
    signal?: AbortSignal,
  ): Promise<TrainingJob> {
    return this.request('/jobs', trainingJobSchema, {
      method: 'POST',
      signal,
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ dataset_id: datasetId, client_label: clientLabel }),
    });
  }

  async job(jobId: string, signal?: AbortSignal): Promise<TrainingJob> {
    return this.request(`/jobs/${encodeURIComponent(jobId)}`, trainingJobSchema, { signal });
  }

  async jobs(cursor?: string | null, signal?: AbortSignal) {
    return this.request(`/jobs?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, trainingJobPageSchema, { signal });
  }

  async queue(signal?: AbortSignal): Promise<TrainingQueue> {
    return this.request('/queue', trainingQueueSchema, { signal });
  }

  async cancelJob(jobId: string, signal?: AbortSignal): Promise<TrainingJob> {
    return this.request(`/jobs/${encodeURIComponent(jobId)}/cancel`, trainingJobSchema, { method: 'POST', signal });
  }

  async logs(jobId: string, after?: string | null, signal?: AbortSignal): Promise<TrainingLogChunk> {
    const suffix = after ? `?after=${encodeURIComponent(after)}` : '';
    return this.request(`/jobs/${encodeURIComponent(jobId)}/logs${suffix}`, trainingLogSchema, { signal });
  }

  async preview(jobId: string, etag?: string | null, signal?: AbortSignal): Promise<TrainingPreviewFrame> {
    const response = await this.raw(`/jobs/${encodeURIComponent(jobId)}/preview`, {
      signal,
      headers: etag ? { 'If-None-Match': etag } : undefined,
    });
    if (response.status === 204 || response.status === 304) {
      return { file: null, etag: etag ?? null, optimizerStep: null, imageExposures: null, capturedAt: null };
    }
    if (!response.ok) throw await this.errorFor(response);
    const advertisedFormat = response.headers.get('X-Preview-Format')?.toLowerCase() ?? 'ply';
    if (!isTrainingPreviewFormat(advertisedFormat)) {
      await response.body?.cancel();
      throw new Error(`Unsupported live preview format: ${advertisedFormat}`);
    }
    const blob = await boundedPreviewBlob(response, this.previewMaxBytes);
    return {
      file: new File([blob], `live-preview.${advertisedFormat}`, { type: blob.type || 'application/octet-stream' }),
      etag: response.headers.get('ETag') ?? null,
      optimizerStep: integerHeader(response.headers.get('X-Preview-Step')),
      imageExposures: integerHeader(response.headers.get('X-Preview-Exposures')),
      capturedAt: response.headers.get('X-Preview-Captured-At'),
      version: integerHeader(response.headers.get('X-Preview-Version')),
      totalSplats: integerHeader(response.headers.get('X-Preview-Total-Splats')),
      shownSplats: integerHeader(response.headers.get('X-Preview-Shown-Splats')),
      jobId: response.headers.get('X-Preview-Job-ID'),
      snapshotId: response.headers.get('X-Preview-Snapshot-ID'),
      coordinateSpace: response.headers.get('X-Preview-Coordinate-Space'),
      format: advertisedFormat,
    };
  }

  async artifact(jobId: string, artifactId: string, signal?: AbortSignal): Promise<File> {
    const response = await this.raw(`/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(artifactId)}`, { signal });
    if (!response.ok) throw await this.errorFor(response);
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? 'training-result.ply';
    return new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  }

  private async request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
    // Every caller uses a replay-safe operation; create requests supply a stable key.
    // Retry the same body, including response loss after the server committed it.
    for (let attempt = 0; ; attempt += 1) {
      let response: Response | undefined;
      try {
        response = await this.raw(path, init);
        if (!response.ok) throw await this.errorFor(response);
        return schema.parse(await response.json());
      } catch (error) {
        const retryable = error instanceof TypeError || error instanceof SyntaxError || (error instanceof TrainingApiError
          && error.status !== undefined && [408, 429, 502, 503, 504].includes(error.status));
        if (init.signal?.aborted || !retryable || attempt >= 2) throw error;
        const hint = response?.headers.get('Retry-After');
        const seconds = hint ? Number(hint) : NaN;
        const hintedMs = hint ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(hint) - Date.now()) : NaN;
        // A long server hint is surfaced; never retry earlier than requested.
        if (hintedMs > 10_000) throw error;
        await retryDelay(Number.isFinite(hintedMs) ? Math.max(0, hintedMs) : 250 * 2 ** attempt + Math.random() * 100, init.signal);
      }
    }
  }

  private raw(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has('Content-Type') && typeof init.body === 'string') headers.set('Content-Type', 'application/json');
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    return this.fetchImpl(`${this.baseUrl}${API_PREFIX}${path}`, { ...init, headers });
  }

  private async errorFor(response: Response): Promise<TrainingApiError> {
    try {
      const problem = await response.json() as {
        detail?: string;
        code?: string;
        title?: string;
        errors?: Array<{ field?: unknown; code?: unknown; detail?: unknown }>;
      };
      const issues = Array.isArray(problem.errors) ? problem.errors.flatMap((issue) => (
        typeof issue.field === 'string' && typeof issue.code === 'string'
          ? [{ field: issue.field, code: issue.code, detail: typeof issue.detail === 'string' ? issue.detail : null }]
          : []
      )) : [];
      return new TrainingApiError(
        problem.detail ?? problem.title ?? `Request failed (${response.status})`,
        response.status,
        problem.code,
        issues,
      );
    } catch {
      return new TrainingApiError(`Request failed (${response.status})`, response.status);
    }
  }
}

function integerHeader(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function boundedPreviewBlob(response: Response, limit: number): Promise<Blob> {
  if (Number(response.headers.get('Content-Length')) > limit) {
    await response.body?.cancel();
    throw new Error('Live preview exceeds the browser frame size limit.');
  }
  if (!response.body) return new Blob();
  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error('Live preview exceeds the browser frame size limit.');
      }
      chunks.push(value.slice().buffer);
    }
    return new Blob(chunks, { type: response.headers.get('Content-Type') ?? 'application/octet-stream' });
  } finally {
    reader.releaseLock();
  }
}

function retryDelay(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new DOMException('Request cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}
