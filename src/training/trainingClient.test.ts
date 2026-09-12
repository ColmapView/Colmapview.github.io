import fixture from './fixtures/wire-v1.json';
import { afterEach, vi } from 'vitest';
import type { TrainingSnapshot } from './types';
import {
  TrainingClient,
  trainingHealthSchema,
  trainingJobPageSchema,
  trainingProblemSchema,
  trainingReceiptSchema,
  trainingArtifactSchema,
  trainingConfigSchema,
  trainingDatasetSchema,
  trainingJobSchema,
  trainingLogSchema,
  trainingProgressSchema,
  trainingQueueSchema,
  trainingResolvedRecipeSchema,
} from './trainingClient';

describe('training API v1 wire schema', () => {
  it('accepts every representative response object', () => {
    const config = trainingConfigSchema.parse(fixture.config);
    expect(config.backend.backend_id).toBe('fixture');
    expect(config.backend.mask_sources).toEqual(['none', 'directory']);
    expect(config.backend.mask_loss_modes).toEqual(['none', 'foreground']);
    expect(config.editable_settings?.fields.find(field => field.key === 'mask_source')?.choices?.[0]).toEqual({
      value: 'auto', label: 'Automatic',
    });
    const dataset = trainingDatasetSchema.parse(fixture.dataset);
    expect(dataset.file_ids['sparse/0/cameras.bin']).toBe('file_01');
    expect(dataset.settings_schema_version).toBe(1);
    expect(trainingJobSchema.parse(fixture.job)).toMatchObject({
      job_id: 'job_01', base_recipe_id: 'recipe_01', settings_schema_version: 1,
    });
    expect(trainingResolvedRecipeSchema.parse(fixture.resolved_recipe).recipe_id).toBe('recipe_02');
    expect(trainingProgressSchema.parse(fixture.progress).shown_splats).toBe(100000);
    expect(trainingArtifactSchema.parse(fixture.artifact).format).toBe('ply');
    expect(trainingQueueSchema.parse(fixture.queue).capacity).toBe(32);
    expect(trainingLogSchema.parse(fixture.logs).next_cursor).toBe('0:18');
    expect(trainingHealthSchema.parse(fixture.health).authentication).toEqual({ mode: 'bearer', token_required: true });
    expect(trainingHealthSchema.parse(fixture.local_health).authentication).toEqual({ mode: 'local', token_required: false });
    expect(trainingProblemSchema.parse(fixture.problem).code).toBe('dataset_not_ready');
    expect(trainingReceiptSchema.parse(fixture.dataset.files[0].receipt).file_id).toBe('file_01');
    expect(trainingJobPageSchema.parse(fixture.jobs).items).toEqual([]);
  });

  it.each(['uploading', 'validating', 'ready', 'invalid', 'cancelling', 'cancelled'] as const)(
    'accepts dataset state %s', (state) => {
      expect(trainingDatasetSchema.parse({ ...fixture.dataset, state }).state).toBe(state);
    }
  );

  it.each(['queued', 'starting', 'running', 'finalizing', 'cancelling', 'succeeded', 'failed', 'cancelled'] as const)(
    'accepts job state %s', (state) => {
      expect(trainingJobSchema.parse({ ...fixture.job, state }).state).toBe(state);
    }
  );

  it('accepts additive server fields but rejects an unknown lifecycle state', () => {
    expect(trainingJobSchema.parse({ ...fixture.job, future_server_field: { enabled: true } }).job_id).toBe('job_01');
    expect(() => trainingJobSchema.parse({ ...fixture.job, state: 'paused' })).toThrow();
  });

  it('keeps additive mask capability fields compatible with an older v1 server', () => {
    const legacyBackend = Object.fromEntries(
      Object.entries(fixture.config.backend).filter(([key]) => !['mask_sources', 'mask_loss_modes'].includes(key)),
    );
    const parsed = trainingConfigSchema.parse({ ...fixture.config, backend: legacyBackend });
    expect(parsed.backend.mask_modes).toEqual(['none', 'directory']);
    expect(parsed.backend.mask_sources).toEqual([]);
    expect(parsed.backend.mask_loss_modes).toEqual([]);
  });

  it('rejects unsafe integer counters and non-finite metrics', () => {
    expect(() => trainingQueueSchema.parse({ ...fixture.queue, revision: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
    expect(() => trainingProgressSchema.parse({ metrics: { loss: Infinity } })).toThrow();
  });
});

describe('training mutation replay', () => {
  afterEach(() => { vi.useRealTimers(); });

  const snapshot: TrainingSnapshot = {
    id: fixture.create_dataset.client_snapshot_id, sourceId: 'source', sourceLabel: fixture.create_dataset.source_label,
    imageCount: 1, pointCount: 1,
    files: fixture.create_dataset.files.map((file, index) => ({
      id: `file-${index}`, path: file.path, role: file.role as 'image' | 'model' | 'mask',
      image_name: file.image_name, expectedBytes: file.expected_bytes, read: async () => new File([], 'unused'),
    })),
  };

  it('asks finalize to wait for the normal validation fast path', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...fixture.dataset, state: 'ready' }));
    const client = new TrainingClient({ baseUrl: 'http://127.0.0.1:8787', fetchImpl });

    await client.finalizeDataset(fixture.dataset.dataset_id);

    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get('Prefer')).toBe('wait=10');
  });

  it('resolves sparse settings and binds the exact resolution to dataset creation', async () => {
    const calls: Array<{ path: string; body: unknown }> = [];
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      const path = String(url);
      calls.push({ path, body: JSON.parse(String(init?.body)) });
      return Response.json(path.endsWith('/recipes/resolve') ? fixture.resolved_recipe : fixture.dataset);
    });
    const client = new TrainingClient({ baseUrl: 'http://127.0.0.1:8787', fetchImpl });

    const resolved = await client.resolveRecipe(
      fixture.resolve_recipe.base_recipe_id,
      fixture.resolve_recipe.settings_schema_version,
      fixture.resolve_recipe.settings,
    );
    await client.createDataset(snapshot, undefined, fixture.recipe_selection);

    expect(calls[0]).toEqual({
      path: 'http://127.0.0.1:8787/api/v1/recipes/resolve',
      body: fixture.resolve_recipe,
    });
    expect(calls[1]).toMatchObject({
      path: 'http://127.0.0.1:8787/api/v1/datasets',
      body: { recipe_selection: fixture.recipe_selection },
    });
    expect(resolved).toEqual(fixture.resolved_recipe);
  });

  it('replays dropped dataset and job POST responses with identical keys/bodies and one resource', async () => {
    vi.useFakeTimers();
    const resources = new Map<string, string>();
    const calls: Array<{ path: string; key: string; body: string }> = [];
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      const path = String(url);
      const key = new Headers(init?.headers).get('Idempotency-Key')!;
      const body = String(init?.body);
      calls.push({ path, key, body });
      const resourceKey = `${path}:${key}`;
      if (!resources.has(resourceKey)) {
        resources.set(resourceKey, body);
        throw new TypeError('Response lost after commit');
      }
      expect(resources.get(resourceKey)).toBe(body);
      return Response.json(path.endsWith('/datasets') ? fixture.dataset : fixture.job);
    });
    const client = new TrainingClient({ baseUrl: 'http://127.0.0.1:8787', fetchImpl });
    const pending = client.createDataset(snapshot);
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ id: fixture.dataset.dataset_id });
    const job = client.createJob(fixture.dataset.dataset_id, 'stable-job-key', 'stable-browser-label');
    await vi.runAllTimersAsync();
    expect((await job).job_id).toBe(fixture.job.job_id);
    expect(resources.size).toBe(2);
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[2]).toEqual(calls[3]);
    expect(JSON.parse(calls[0].body)).toEqual(fixture.create_dataset);
    expect(Object.keys(JSON.parse(calls[2].body)).sort()).toEqual(['client_label', 'dataset_id']);
    expect(JSON.parse(calls[2].body).client_label).toBe('stable-browser-label');
  });

  it('retries the same whole file as raw binary even when its source MIME type is image/png', async () => {
    vi.useFakeTimers();
    const file = new File([new Uint8Array([0, 64, 128, 255])], 'soft.png', { type: 'image/png' });
    const fetchImpl = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Lost receipt'))
      .mockResolvedValue(Response.json({ file_id: 'f', bytes: 4, sha256: 'abc' }));
    const client = new TrainingClient({ baseUrl: 'http://localhost:8787', fetchImpl });
    const upload = client.uploadFile('d', 'f', file);
    await vi.runAllTimersAsync();
    await expect(upload).resolves.toMatchObject({ file_id: 'f', bytes: 4 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init?.body).toBe(file);
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/octet-stream');
    }
  });

  it('does not retry validation/auth failures or aborted work', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ detail: 'Invalid dataset', code: 'validation_error' }, { status: 422 }));
    const client = new TrainingClient({ baseUrl: 'http://localhost:8787', fetchImpl });
    await expect(client.createDataset(snapshot)).rejects.toThrow('Invalid dataset');
    expect(fetchImpl).toHaveBeenCalledOnce();
    fetchImpl.mockReset().mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
    await expect(client.createDataset(snapshot, AbortSignal.abort())).rejects.toThrow('Cancelled');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('bounds transport retries to three attempts', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Offline'));
    const client = new TrainingClient({ baseUrl: 'http://localhost:8787', fetchImpl });
    const result = expect(client.createDataset(snapshot)).rejects.toThrow('Offline');
    await vi.runAllTimersAsync();
    await result;
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe('preview transport bounds', () => {
  it('keeps the backend strong ETag and source/frame metadata together', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('ply\n', { headers: {
      ...fixture.preview_headers, 'X-Preview-Version': '1', 'X-Preview-Job-ID': 'job_01',
      'X-Preview-Snapshot-ID': 'snapshot_01', 'X-Preview-Total-Splats': '200000',
      'X-Preview-Shown-Splats': '200000', 'X-Preview-Coordinate-Space': 'colmap',
      'X-Preview-Format': 'spz',
    } }));
    const frame = await new TrainingClient({ baseUrl: 'http://localhost:8787', fetchImpl }).preview('job_01');
    expect(frame).toMatchObject({ etag: '"job_01:1"', version: 1, optimizerStep: 500, imageExposures: 2000,
      jobId: 'job_01', snapshotId: 'snapshot_01', shownSplats: 200000, totalSplats: 200000,
      coordinateSpace: 'colmap', format: 'spz' });
    expect(frame.file?.size).toBe(4);
    expect(frame.file?.name).toBe('live-preview.spz');
  });

  it('keeps PLY compatibility when a legacy server omits the preview-format header', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('ply\n', { headers: fixture.preview_headers }));
    const frame = await new TrainingClient({ baseUrl: 'http://localhost:8787', fetchImpl }).preview('job_01');
    expect(frame.format).toBe('ply');
    expect(frame.file?.name).toBe('live-preview.ply');
  });

  it('rejects an unsupported advertised preview format before consuming its body', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { headers: { 'X-Preview-Format': 'unknown' } });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(new TrainingClient({ baseUrl: 'http://localhost:8787', fetchImpl }).preview('job_01'))
      .rejects.toThrow('Unsupported live preview format');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('rejects oversized declared content before reading and oversized streamed content without Content-Length', async () => {
    const cancelDeclared = vi.fn();
    const declared = new Response(new ReadableStream({ cancel: cancelDeclared }), { headers: { 'Content-Length': String(128 * 1024 * 1024 + 1) } });
    const cancelStream = vi.fn();
    const chunk = new Uint8Array(65 * 1024 * 1024);
    let sent = 0;
    const streamed = new Response(new ReadableStream({
      pull(controller) { if (sent++ < 2) controller.enqueue(chunk); }, cancel: cancelStream,
    }));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(declared).mockResolvedValueOnce(streamed);
    const client = new TrainingClient({ baseUrl: 'http://localhost:8787', fetchImpl });
    await expect(client.preview('job')).rejects.toThrow('frame size limit');
    await expect(client.preview('job')).rejects.toThrow('frame size limit');
    expect(cancelDeclared).toHaveBeenCalledOnce();
    expect(cancelStream).toHaveBeenCalledOnce();
  });

  it('honors a smaller server-advertised preview limit after config discovery', async () => {
    const cancel = vi.fn();
    const preview = new Response(new ReadableStream({ cancel }), { headers: { 'Content-Length': '1025' } });
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({
        ...fixture.config,
        limits: { ...fixture.config.limits, max_preview_bytes: 1024 },
      }))
      .mockResolvedValueOnce(preview);
    const client = new TrainingClient({ baseUrl: 'http://localhost:8787', fetchImpl });

    await client.config();
    await expect(client.preview('job')).rejects.toThrow('frame size limit');

    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([204, 304])('does not read a body for HTTP %s', async status => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    const frame = await new TrainingClient({ baseUrl: 'http://localhost:8787', fetchImpl }).preview('job', '"job:2"');
    expect(frame.file).toBeNull();
    expect(frame.etag).toBe('"job:2"');
  });
});
