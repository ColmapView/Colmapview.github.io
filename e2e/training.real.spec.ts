import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { loadTestDataset } from './fixtures/load-test-data';

const apiUrl = process.env.COLMAP_TRAIN_REAL_API_URL;
const datasetDir = process.env.COLMAP_TRAIN_REAL_DATASET_DIR;
const token = 'integration-only-token';

test.use({ channel: process.env.COLMAP_TRAINING_BROWSER_CHANNEL || undefined });

interface BrowserTrainingState {
  jobId: string | null;
  jobState: string | null;
  phase: string;
  previewUpdatedAt: number | null;
  previewError: string | null;
  finalLoadedJobId: string | null;
}

interface TrainingRendererProbe {
  getImageIds(): number[];
}

async function trainingState(page: Page): Promise<BrowserTrainingState> {
  return page.evaluate(async () => {
    const storePath = '/src/store/stores/trainingStore.ts';
    const { useTrainingStore } = await import(storePath) as typeof import('../src/store/stores/trainingStore');
    const state = useTrainingStore.getState();
    return {
      jobId: state.currentJobId,
      jobState: state.currentJob?.state ?? null,
      phase: state.phase,
      previewUpdatedAt: state.previewUpdatedAt,
      previewError: state.previewError,
      finalLoadedJobId: state.finalLoadedJobId,
    };
  });
}

async function cadenceTimes(page: Page): Promise<number[]> {
  return page.evaluate(() => (
    window as unknown as { __trainingCadence: { times: number[] } }
  ).__trainingCadence.times);
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

test.describe('Real local splatxx training workflow', () => {
  test.skip(!apiUrl || !datasetDir, 'Start the real splatxx API and set its URL plus the generated fixture directory.');

  test('E2E-01 uploads masks, displays live geometry, auto-loads final, and cancels the latest waiting run', async ({
    page,
    browserName,
    request,
  }, testInfo) => {
    test.skip(browserName !== 'chromium', 'The real GPU qualification targets the supported Chromium/Spark path.');
    test.setTimeout(360_000);
    page.setDefaultTimeout(15_000);
    await page.context().grantPermissions(['local-network-access'], { origin: 'http://localhost:5173' });
    const ownedJobs = new Set<string>();
    const health = await request.get(`${apiUrl}/api/v1/health`);
    expect(health.ok()).toBe(true);
    const discovery = await health.json() as { authentication?: { mode: 'local' | 'bearer'; token_required: boolean } };
    const bearerRequired = discovery.authentication?.mode !== 'local' || discovery.authentication.token_required;
    const authHeaders: Record<string, string> = bearerRequired ? { Authorization: `Bearer ${token}` } : {};
    try {
      await page.goto('/?splatBackend=spark&e2eProbe=1');
      await loadTestDataset(page, [], datasetDir!);
      await page.waitForFunction(() => Boolean(window.__COLMAP_WEBVIEW_E2E__));
      await expect.poll(() => page.evaluate(() => (
        window.__COLMAP_WEBVIEW_E2E__ as unknown as TrainingRendererProbe
      ).getImageIds().length), {
        timeout: 30_000,
      }).toBe(2);

      await page.getByRole('button', { name: 'Training', exact: true }).click();
      const dock = page.getByRole('region', { name: 'Training', exact: true });
      await expect(dock).toBeVisible();
      await expect(dock).not.toHaveAttribute('aria-modal', 'true');
      if (!await dock.getByLabel('Server URL').isVisible()) {
        await dock.locator('.training-window-connection > summary').click();
      }
      await dock.getByLabel('Server URL').fill(apiUrl!);
      await dock.getByRole('button', { name: 'Connect / Retry', exact: true }).click();
      if (bearerRequired) {
        await expect(dock.getByLabel('Session token')).toBeVisible();
        await dock.getByLabel('Session token').fill(token);
        await dock.getByRole('button', { name: 'Connect / Retry', exact: true }).click();
      } else {
        await expect(dock.getByLabel('Session token')).toHaveCount(0);
        await expect(dock.getByText('Connected', { exact: true })).toBeVisible();
      }
      await expect(dock.getByText('Connected', { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(dock.getByText('Masks: directory; missing masks use the full image as foreground', { exact: true })).toBeVisible();

      await page.evaluate(async () => {
        const storePath = '/src/store/stores/trainingStore.ts';
        const { useTrainingStore } = await import(storePath) as typeof import('../src/store/stores/trainingStore');
        const receipt = { times: [] as number[], lastUpdatedAt: null as number | null };
        Object.assign(window, { __trainingCadence: receipt });
        useTrainingStore.setState({ previewEnabled: true });
        useTrainingStore.subscribe(state => {
          if (state.previewUpdatedAt === null || state.previewUpdatedAt === receipt.lastUpdatedAt) return;
          receipt.lastUpdatedAt = state.previewUpdatedAt;
          receipt.times.push(performance.now());
        });
      });

      const sourceCountBefore = await page.evaluate(async () => {
        const storePath = '/src/store/reconstructionStore.ts';
        const { useReconstructionStore } = await import(storePath) as typeof import('../src/store/reconstructionStore');
        return useReconstructionStore.getState().loadedFiles?.splatFileSources?.length ?? 0;
      });
      await dock.getByRole('button', { name: 'Train', exact: true }).click();
      await expect(dock.getByRole('tab')).toHaveCount(0);
      await expect.poll(async () => (await trainingState(page)).jobId, { timeout: 60_000 }).not.toBeNull();
      const firstJob = (await trainingState(page)).jobId!;
      ownedJobs.add(firstJob);
      await expect.poll(() => page.evaluate(async () => {
        const storePath = '/src/store/index.ts';
        const { usePointCloudStore } = await import(storePath) as typeof import('../src/store');
        const points = usePointCloudStore.getState();
        return `${points.showPointCloud}:${points.showSplats}:${points.colorMode}`;
      })).toBe('true:true:splats');
      await expect.poll(async () => (await cadenceTimes(page)).length, {
        timeout: 120_000,
        message: 'first decoded live geometry',
      }).toBeGreaterThan(0);
      await expect.poll(async () => {
        const times = await cadenceTimes(page);
        return times.length > 1 ? times[times.length - 1] - times[0] : 0;
      }, { timeout: 180_000, message: 'ten-second steady displayed-preview window' }).toBeGreaterThanOrEqual(10_000);

      const renderer = await page.evaluate(async () => {
        const controllerPath = '/src/training/previewController.ts';
        const { trainingPreviewController } = await import(controllerPath) as typeof import('../src/training/previewController');
        return trainingPreviewController.inspect();
      });
      expect(renderer.displayedResources).toBe(1);
      expect(renderer.renderer?.backend).toBe('spark');
      expect(renderer.renderer?.meshes).toBe(1);
      expect((await trainingState(page)).previewError).toBeNull();

      const preview = await request.get(`${apiUrl}/api/v1/jobs/${firstJob}/preview`, {
        headers: authHeaders,
      });
      expect(preview.status()).toBe(200);
      const previewShownSplats = Number(preview.headers()['x-preview-shown-splats']);
      const previewTotalSplats = Number(preview.headers()['x-preview-total-splats']);
      const previewBody = gunzipSync(await preview.body());
      expect(preview.headers()['x-preview-format']).toBe('spz');
      expect(previewShownSplats).toBeGreaterThan(0);
      expect(previewShownSplats).toBe(previewTotalSplats);
      expect(previewBody.subarray(0, 4).toString()).toBe('NGSP');
      expect(previewBody.readUInt32LE(8)).toBe(previewTotalSplats);

      await expect.poll(async () => (await trainingState(page)).jobState, { timeout: 180_000 }).toBe('succeeded');
      await expect(dock.getByRole('button', { name: 'Result loaded', exact: true })).toBeVisible({ timeout: 30_000 });
      const finalState = await page.evaluate(async () => {
        const storePath = '/src/store/index.ts';
        const { useReconstructionStore, useTrainingStore } = await import(storePath) as typeof import('../src/store');
        const loaded = useReconstructionStore.getState().loadedFiles;
        if (!loaded?.splatFile || !loaded.splatFileSources) throw new Error('Final splat source was not attached.');
        const header = await loaded.splatFile.slice(0, 1024).text();
        return {
          vertexCount: Number(/element vertex (\d+)/.exec(header)?.[1] ?? 0),
          sources: loaded.splatFileSources.length,
          finalLoadedJobId: useTrainingStore.getState().finalLoadedJobId,
          previewActive: useTrainingStore.getState().previewActive,
          hasMasks: loaded.hasMasks,
        };
      });
      expect(finalState).toMatchObject({
        sources: sourceCountBefore + 1,
        finalLoadedJobId: firstJob,
        // The final runs through the regular reconstruction splat layer; the
        // temporary live-preview resource is released after the handoff.
        previewActive: false,
        hasMasks: true,
      });
      expect(finalState.vertexCount).toBeGreaterThan(5);

      const attachedDigest = await page.evaluate(async () => {
        const storePath = '/src/store/index.ts';
        const { useReconstructionStore } = await import(storePath) as typeof import('../src/store');
        const file = useReconstructionStore.getState().loadedFiles!.splatFile!;
        const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
      });
      // Use the regular viewer export interface, not the training API's artifact
      // URL or the fallback download button in the Training window.
      await dock.getByRole('button', { name: 'Close training', exact: true }).click();
      await expect(dock).not.toBeVisible();
      const exportButton = page.getByRole('button', { name: 'Export', exact: true });
      await exportButton.hover();
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download Splat File', exact: true }).click();
      const download = await downloadEvent;
      expect(download.suggestedFilename()).toMatch(/\.ply$/i);
      const downloaded = await readFile((await download.path())!);
      expect(createHash('sha256').update(downloaded).digest('hex')).toBe(attachedDigest);

      await page.getByRole('button', { name: 'Training', exact: true }).click();
      await expect(dock).toBeVisible();
      await dock.getByRole('button', { name: 'New setup', exact: true }).click();
      await dock.getByRole('button', { name: 'Train', exact: true }).click();
      await expect.poll(async () => {
        const state = await trainingState(page);
        return state.jobId !== firstJob && ['starting', 'running'].includes(state.jobState ?? '') ? state.jobId : null;
      }, { timeout: 60_000 }).not.toBeNull();
      const secondJob = (await trainingState(page)).jobId!;
      ownedJobs.add(secondJob);

      await dock.getByRole('button', { name: 'New setup', exact: true }).click();
      await dock.getByRole('button', { name: 'Train', exact: true }).click();
      await expect.poll(async () => {
        const state = await trainingState(page);
        return state.jobId && state.jobId !== secondJob ? state.jobId : null;
      }, { timeout: 60_000 }).not.toBeNull();
      const thirdJob = (await trainingState(page)).jobId!;
      ownedJobs.add(thirdJob);
      await expect.poll(async () => {
        const response = await request.get(`${apiUrl}/api/v1/queue`, { headers: authHeaders });
        const queue = await response.json() as {
          active_job: { job_id: string } | null;
          waiting: Array<{ job_id: string }>;
        };
        return { active: queue.active_job?.job_id ?? null, waiting: queue.waiting.map(job => job.job_id) };
      }).toEqual({ active: secondJob, waiting: [thirdJob] });

      await dock.getByRole('button', { name: 'Remove from queue', exact: true }).click();
      await expect.poll(async () => {
        const response = await request.get(`${apiUrl}/api/v1/jobs/${thirdJob}`, {
          headers: authHeaders,
        });
        return (await response.json()).state;
      }, { timeout: 30_000 }).toBe('cancelled');
      await expect.poll(async () => {
        const response = await request.get(`${apiUrl}/api/v1/jobs/${secondJob}`, { headers: authHeaders });
        return (await response.json()).state;
      }, { timeout: 180_000 }).toBe('succeeded');
      const active = await request.get(`${apiUrl}/api/v1/jobs/${secondJob}`, {
        headers: authHeaders,
      });
      const activeJob = await active.json() as { state: string; enqueue_sequence: number };
      const cancelled = await request.get(`${apiUrl}/api/v1/jobs/${thirdJob}`, {
        headers: authHeaders,
      });
      const cancelledJob = await cancelled.json() as { enqueue_sequence: number };
      expect(activeJob.state).toBe('succeeded');
      expect(cancelledJob.enqueue_sequence).toBeGreaterThan(activeJob.enqueue_sequence);

      const times = await cadenceTimes(page);
      const endIndex = times.findIndex(time => time - times[0] >= 10_000);
      const windowTimes = times.slice(0, endIndex + 1);
      const intervals = windowTimes.slice(1).map((time, index) => time - windowTimes[index]);
      const medianGapMs = percentile(intervals, 0.5);
      const browserTiming = await page.evaluate(async (jobId) => {
        const timingPath = '/src/training/trainingTiming.ts';
        const { inspectTrainingTimings } = await import(timingPath) as typeof import('../src/training/trainingTiming');
        return inspectTrainingTimings().find(trace => trace.jobId === jobId);
      }, firstJob);
      expect(browserTiming).toBeDefined();
      expect(browserTiming!.marksMs.first_training_progress_observed).toBeGreaterThan(0);
      expect(browserTiming!.marksMs.first_preview_displayed).toBeGreaterThan(0);
      expect(browserTiming!.marksMs.final_result_attached).toBeGreaterThan(browserTiming!.marksMs.first_preview_displayed);
      const receipt = {
        browserTiming,
        browser: page.context().browser()?.version(),
        displayedFrames: windowTimes.length,
        windowSeconds: (windowTimes.at(-1)! - windowTimes[0]) / 1000,
        medianDisplayedFps: 1000 / medianGapMs,
        p95InterUpdateGapMs: percentile(intervals, 0.95),
        previewFormat: preview.headers()['x-preview-format'],
        previewShownSplats,
        previewTotalSplats,
        finalVertexCount: finalState.vertexCount,
        regularPlyDownloadMatchesAttached: true,
        sourceCountDelta: finalState.sources - sourceCountBefore,
        queueSequenceIncreasing: cancelledJob.enqueue_sequence > activeJob.enqueue_sequence,
      };
      expect(receipt.medianDisplayedFps).toBeGreaterThanOrEqual(2);
      expect(receipt.medianDisplayedFps).toBeLessThanOrEqual(4);
      expect(receipt.p95InterUpdateGapMs).toBeLessThanOrEqual(1000);
      await testInfo.attach('real-training-workflow.json', {
        body: JSON.stringify(receipt, null, 2),
        contentType: 'application/json',
      });
      await mkdir('.tmp/training-qualification', { recursive: true });
      await writeFile('.tmp/training-qualification/real-training-workflow.json', JSON.stringify(receipt, null, 2));
    } finally {
      for (const jobId of ownedJobs) {
        await request.post(`${apiUrl}/api/v1/jobs/${jobId}/cancel`, {
          headers: authHeaders,
        }).catch(() => undefined);
      }
    }
  });
});
