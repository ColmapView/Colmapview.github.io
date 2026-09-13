import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadDiskDataset } from './fixtures/load-disk-dataset';

const apiUrl = process.env.COLMAP_TRAIN_PLUGIN_API_URL;
const source = process.env.COLMAP_TRAIN_PLUGIN_DATASET_DIR;
const token = process.env.COLMAP_TRAIN_PLUGIN_TOKEN;
const fixtureGate = process.env.COLMAP_TRAIN_PLUGIN_FIXTURE_GATE;
const restart = process.env.COLMAP_TRAIN_PLUGIN_RESTART === '1';
const receiptDirectory = process.env.COLMAP_TRAIN_PLUGIN_RECEIPT_DIR;

test('plugin upload, honest progress, final PLY attachment and viewer download', async ({ page, request, browserName }, testInfo) => {
  test.skip(!apiUrl || !source || browserName !== 'chromium', 'Requires an isolated plugin API and source scene.');
  test.setTimeout(600_000);
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  await page.context().grantPermissions(['local-network-access'], {
    origin: new URL(testInfo.project.use.baseURL ?? 'http://localhost:5173').origin,
  });
  let jobId: string | null = null;
  let cancelledJob: unknown = null;
  const state = () => page.evaluate(async () => {
    const path = '/src/store/stores/trainingStore.ts';
    const { useTrainingStore } = await import(path) as typeof import('../src/store/stores/trainingStore');
    const value = useTrainingStore.getState();
    return { job: value.currentJob, error: value.operationError, final: value.finalLoadedJobId };
  });
  try {
    await page.goto('/?splatBackend=spark&e2eProbe=1');
    await loadDiskDataset(page, source!);
    await page.getByRole('button', { name: 'Training', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Training', exact: true });
    await panel.getByLabel('Server URL').fill(apiUrl!);
    if (token) {
      await panel.getByRole('button', { name: 'Start', exact: true }).click();
      await panel.getByLabel('Session token').fill(token);
    }
    await panel.getByRole('button', { name: 'Start', exact: true }).click();
    await expect.poll(async () => {
      const value = await state();
      if (value.error || value.job?.state === 'failed') throw new Error(value.error || JSON.stringify(value.job?.error));
      jobId = value.job?.job_id ?? jobId;
      return value.job?.progress?.optimizer_step;
    }, { timeout: 240_000 }).toBeGreaterThan(0);
    if (restart) {
      const firstJobId = jobId;
      await page.getByRole('button', { name: 'Training', exact: true }).hover();
      await panel.getByRole('button', { name: 'Start', exact: true }).click();
      await expect.poll(async () => {
        const value = await state();
        if (value.error || value.job?.state === 'failed') throw new Error(value.error || JSON.stringify(value.job?.error));
        jobId = value.job?.job_id ?? jobId;
        return jobId !== firstJobId && (value.job?.progress?.optimizer_step ?? 0) > 0;
      }, { timeout: 240_000 }).toBe(true);
      const response = await request.get(`${apiUrl}/api/v1/jobs/${firstJobId}`, { headers });
      expect(response.ok()).toBe(true);
      cancelledJob = await response.json();
      expect(cancelledJob).toMatchObject({ state: 'cancelled' });
    }
    // Only the explicitly configured test fixture uses this local release file.
    if (fixtureGate) await writeFile(fixtureGate, 'release');
    await expect.poll(async () => {
      const value = await state();
      if (value.error || value.job?.state === 'failed') throw new Error(value.error || JSON.stringify(value.job?.error));
      return value.final;
    }, { timeout: 240_000 }).toBe(jobId);
    const drawState = () => page.evaluate(async () => {
      const path = '/src/training/trainingDrawProbe.ts';
      const { trainingDrawProbe } = await import(path) as typeof import('../src/training/trainingDrawProbe');
      return trainingDrawProbe?.inspect();
    });
    await expect.poll(async () => (await drawState())?.events.some(event =>
      !event.fileName.startsWith('live-preview.')), { timeout: 60_000 }).toBe(true);
    const draws = await drawState();
    expect(draws?.overflow).toBe(false);
    for (const event of draws!.events) expect(event.mappedRows).toBe(event.sourceRows);
    const attached = await page.evaluate(async () => {
      const path = '/src/store/reconstructionStore.ts';
      const { useReconstructionStore } = await import(path) as typeof import('../src/store/reconstructionStore');
      const file = useReconstructionStore.getState().loadedFiles?.splatFile;
      if (!file) throw new Error('No attached PLY');
      const bytes = await file.arrayBuffer();
      return { header: await file.slice(0, 1024).text(),
        sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map(value => value.toString(16).padStart(2, '0')).join('') };
    });
    expect(attached.header).toMatch(/^ply\r?\n/);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Export', exact: true }).hover();
    const pendingDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Splat File', exact: true }).click();
    const download = await pendingDownload;
    expect(download.suggestedFilename()).toMatch(/\.ply$/i);
    expect(createHash('sha256').update(await readFile((await download.path())!)).digest('hex')).toBe(attached.sha256);
    const receipt = JSON.stringify({ job: (await state()).job, attachedSha256: attached.sha256,
      downloaded: true, draws, cancelledJob });
    const screenshot = await page.screenshot();
    if (receiptDirectory) {
      await writeFile(join(receiptDirectory, 'workflow.json'), receipt);
      await writeFile(join(receiptDirectory, 'final.png'), screenshot);
    }
    await testInfo.attach('plugin-workflow.json', {
      body: receipt,
      contentType: 'application/json',
    });
    await testInfo.attach('plugin-final.png', { body: screenshot, contentType: 'image/png' });
  } finally {
    jobId = (await state().catch(() => null))?.job?.job_id ?? jobId;
    if (jobId) await request.post(`${apiUrl}/api/v1/jobs/${jobId}/cancel`, { headers }).catch(() => undefined);
  }
});
