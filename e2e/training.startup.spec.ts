import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadDiskDataset } from './fixtures/load-disk-dataset';

const apiUrl = process.env.COLMAP_TRAIN_STARTUP_API_URL;
const directory = process.env.COLMAP_TRAIN_STARTUP_DATASET_DIR;
// Unset keeps the promoted production default; 0 is the explicit no-worker control.
const imageWorkers = process.env.COLMAP_TRAIN_STARTUP_IMAGE_WORKERS === undefined
  ? null : Number(process.env.COLMAP_TRAIN_STARTUP_IMAGE_WORKERS);
const splatBackend = process.env.COLMAP_TRAIN_STARTUP_SPLAT_BACKEND ?? 'spark';
const previewMode = process.env.COLMAP_TRAIN_STARTUP_PREVIEW ?? 'on';

test('real scene upload-to-result timing with disk-backed sources', async ({ page, request, browserName }, testInfo) => {
  test.skip(!apiUrl || !directory || browserName !== 'chromium', 'Requires an isolated local API and source scene.');
  test.setTimeout(600_000);
  if (imageWorkers !== null) expect([0, 1, 2, 4]).toContain(imageWorkers);
  expect(['spark', 'webgpu']).toContain(splatBackend);
  expect(['on', 'off']).toContain(previewMode);
  page.setDefaultTimeout(20_000);
  const health = await request.get(`${apiUrl}/api/v1/health`);
  expect(health.ok()).toBe(true);
  expect((await health.json()).authentication.token_required).toBe(false);
  await page.context().grantPermissions(['local-network-access'], { origin: 'http://localhost:5173' });
  let jobId: string | null = null;
  try {
    await page.goto(`/?splatBackend=${splatBackend}&e2eProbe=1`);
    if (splatBackend === 'webgpu') {
      const deviceError = await page.evaluate(async () => {
        try {
          const adapter = await navigator.gpu?.requestAdapter();
          if (!adapter) return 'No WebGPU adapter';
          const device = await adapter.requestDevice();
          device.destroy();
          return null;
        } catch (error) { return String(error); }
      });
      expect(deviceError, 'WebGPU device creation must succeed before uploading/training.').toBeNull();
    }
    if (imageWorkers !== null) {
      await page.evaluate(async count => {
        const path = '/src/training/trainingImageWorkerPool.ts';
        const { configureTrainingImageWorkers } = await import(path) as typeof import('../src/training/trainingImageWorkerPool');
        configureTrainingImageWorkers(count as 0 | 1 | 2 | 4);
      }, imageWorkers);
    }
    await loadDiskDataset(page, directory!);
    const sceneCount = () => page.evaluate(async () => {
      const path = '/src/store/reconstructionStore.ts';
      const { useReconstructionStore } = await import(path) as typeof import('../src/store/reconstructionStore');
      return useReconstructionStore.getState().reconstruction?.images.size ?? 0;
    });
    await expect.poll(sceneCount, { timeout: 120_000 }).toBeGreaterThan(0);
    const imageCount = await sceneCount();
    if (process.env.COLMAP_TRAIN_STARTUP_IMAGE_COUNT) expect(imageCount).toBe(Number(process.env.COLMAP_TRAIN_STARTUP_IMAGE_COUNT));
    await page.getByRole('button', { name: 'Training', exact: true }).click();
    const dock = page.getByRole('region', { name: 'Training', exact: true });
    // Automatic connection can collapse this section between checking visibility
    // and filling. Retry the normal UI interaction after that one-time transition.
    await expect(async () => {
      if (!await dock.getByLabel('Server URL').isVisible()) {
        await dock.locator('.training-window-connection > summary').click();
      }
      await dock.getByLabel('Server URL').fill(apiUrl!, { timeout: 1000 });
    }).toPass({ timeout: 20_000 });
    // The current UI connects on Start; the separate Connect/Train controls
    // belonged to the earlier panel design.
    await dock.getByRole('button', { name: 'Start', exact: true }).click();
    const state = () => page.evaluate(async () => {
      const path = '/src/store/stores/trainingStore.ts';
      const { useTrainingStore } = await import(path) as typeof import('../src/store/stores/trainingStore');
      const value = useTrainingStore.getState();
      return { jobId: value.currentJobId, job: value.currentJob, final: value.finalLoadedJobId, error: value.operationError };
    });
    await expect.poll(async () => {
      const value = await state();
      if (value.error) throw new Error(value.error);
      return value.jobId;
    }, { timeout: 300_000 }).not.toBeNull();
    jobId = (await state()).jobId;
    await expect.poll(async () => {
      const value = await state();
      if (value.job?.state === 'failed') throw new Error(JSON.stringify(value.job.error));
      return value.final;
    }, { timeout: 240_000 }).toBe(jobId);
    const drawState = () => page.evaluate(async () => {
      const path = '/src/training/trainingDrawProbe.ts';
      const { trainingDrawProbe } = await import(path) as typeof import('../src/training/trainingDrawProbe');
      return trainingDrawProbe?.inspect();
    });
    // Catalog attachment is not a draw. Wait for the regular renderer's
    // screen/canvas submission containing the final file.
    await expect.poll(async () => (await drawState())?.events.some(event =>
      !event.fileName.startsWith('live-preview.')), { timeout: 60_000 }).toBe(true);
    const draws = await drawState();
    expect(draws?.overflow).toBe(false);
    const previewDraws = draws!.events.filter(event => event.fileName.startsWith('live-preview.'));
    if (previewMode === 'on') expect(previewDraws.length).toBeGreaterThan(1);
    else expect(previewDraws).toHaveLength(0);
    for (const event of draws!.events) expect(event.mappedRows).toBe(event.sourceRows);
    for (const event of draws!.events) {
      // Reject a silent backend fallback as evidence for the requested renderer.
      expect(event.activeSplats === null).toBe(splatBackend === 'webgpu');
    }
    const fullSizeDraws = previewDraws.filter(event => event.sourceRows === 1_000_000);
    const fullSizeSpanMs = fullSizeDraws.length > 1
      ? fullSizeDraws.at(-1)!.atMs - fullSizeDraws[0].atMs : 0;
    const fullSizeUpdatesPerSecond = fullSizeSpanMs > 0
      ? (fullSizeDraws.length - 1) * 1000 / fullSizeSpanMs : null;
    const receipt = await page.evaluate(async id => {
      const path = '/src/training/trainingTiming.ts';
      const { inspectTrainingTimings } = await import(path) as typeof import('../src/training/trainingTiming');
      return inspectTrainingTimings().find(trace => trace.jobId === id);
    }, jobId);
    expect(receipt?.marksMs.first_training_progress_observed).toBeGreaterThan(0);
    if (previewMode === 'on') expect(receipt?.marksMs.first_preview_displayed).toBeGreaterThan(0);
    else expect(receipt?.marksMs.first_preview_displayed).toBeUndefined();
    const finalState = await state();
    // The control arm must actually disable production, not merely hide frames.
    expect(finalState.job?.recipe_summary.preview).toBe(previewMode === 'on');
    const workerState = await page.evaluate(async () => {
      const path = '/src/training/trainingImageWorkerPool.ts';
      const { trainingImageWorkers } = await import(path) as typeof import('../src/training/trainingImageWorkerPool');
      return trainingImageWorkers()?.inspect() ?? null;
    });
    const result = { imageCount, imageWorkers, workerState, splatBackend, previewMode,
      browser: page.context().browser()?.version(), browserTiming: receipt,
      draws, fullSizeUpdatesPerSecond, job: finalState.job,
      scope: 'Real HTTP; native disk-backed source Files; browser-clock timings; no RSS or server-clock claim.' };
    const body = JSON.stringify(result, null, 2);
    await testInfo.attach('startup.json', { body, contentType: 'application/json' });
    await mkdir('.tmp/training-qualification', { recursive: true });
    await writeFile(`.tmp/training-qualification/startup-${jobId}.json`, body);
  } finally {
    if (jobId) await request.post(`${apiUrl}/api/v1/jobs/${jobId}/cancel`).catch(() => undefined);
  }
});
