import { expect, test, type Page } from '@playwright/test';
import { loadDiskDataset } from './fixtures/load-disk-dataset';
import type { TrainingJob } from '../src/training/types';

const apiUrl = process.env.COLMAP_TRAIN_RESTART_API_URL;
const datasetDirectory = process.env.COLMAP_TRAIN_RESTART_DATASET_DIR;

async function session(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/store/stores/trainingStore.ts';
    const { useTrainingStore } = await import(path) as typeof import('../src/store/stores/trainingStore');
    const state = useTrainingStore.getState();
    return { job: state.currentJob, error: state.operationError, final: state.finalLoadedJobId };
  });
}

test('Start stops the current run and uploads a new D4/B4 dataset', async ({ page, request, browserName }, testInfo) => {
  test.skip(!apiUrl || !datasetDirectory || browserName !== 'chromium', 'Requires an idle local D4/B4 API and a source fixture.');
  test.setTimeout(240_000);
  const queue = await (await request.get(`${apiUrl}/api/v1/queue`)).json();
  expect(queue.active_job).toBeNull();
  expect(queue.waiting).toHaveLength(0);
  const config = await (await request.get(`${apiUrl}/api/v1/config`)).json();
  expect(config.recipe_summary).toMatchObject({ batch_size: 4, dilated_training_scale: 4 });
  await page.context().grantPermissions(['local-network-access'], { origin: 'http://localhost:5173' });
  const owned = new Set<string>();
  const uploads: string[] = [];
  page.on('request', event => {
    if (event.method() === 'PUT' && event.url().startsWith(apiUrl!) && event.url().includes('/files/')) uploads.push(event.url());
  });
  try {
    await page.goto('/?splatBackend=spark&e2eProbe=1');
    await loadDiskDataset(page, datasetDirectory!);
    await page.getByRole('button', { name: 'Training', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Training', exact: true });
    const start = panel.getByRole('button', { name: 'Start', exact: true });
    await expect(panel.locator('.training-window-body button, .training-window-action button')).toHaveCount(1);
    await expect(panel.getByText('Advanced settings', { exact: true })).toHaveCount(0);
    // Simulate a draft retained from the old settings UI; launch defaults win.
    await page.evaluate(async url => {
      const path = '/src/store/stores/trainingStore.ts';
      const { useTrainingStore } = await import(path) as typeof import('../src/store/stores/trainingStore');
      if (useTrainingStore.getState().serverUrl !== url) useTrainingStore.getState().setServerUrl(url!);
      useTrainingStore.getState().setSettingsDraft({ batch_size: 8, dilated_training_scale: 2 });
    }, apiUrl);
    await start.click();
    await expect.poll(async () => {
      const state = await session(page);
      if (state.error || state.job?.state === 'failed') throw new Error(state.error || JSON.stringify(state.job?.error));
      if (state.job) owned.add(state.job.job_id);
      return state.job?.state;
    }, { timeout: 120_000 }).toBe('running');
    const first = (await session(page)).job!;
    await page.getByRole('button', { name: 'Training', exact: true }).hover();
    await expect(start).toBeEnabled();
    await start.click();
    await expect.poll(async () => {
      const state = await session(page);
      if (state.error || state.job?.state === 'failed') throw new Error(state.error || JSON.stringify(state.job?.error));
      if (state.job) owned.add(state.job.job_id);
      return state.job && state.job.job_id !== first.job_id ? state.job : null;
    }, { timeout: 120_000 }).not.toBeNull();
    const second = (await session(page)).job!;
    const stopped = await (await request.get(`${apiUrl}/api/v1/jobs/${first.job_id}`)).json() as TrainingJob;
    expect(stopped.state).toBe('cancelled');
    expect(second.dataset_id).not.toBe(first.dataset_id);
    expect(second.client_snapshot_id).not.toBe(first.client_snapshot_id);
    expect(second.recipe_summary).toMatchObject({ batch_size: 4, dilated_training_scale: 4 });
    for (const job of [first, second]) expect(uploads.filter(url => url.includes(`/datasets/${job.dataset_id}/`)).length).toBeGreaterThan(0);
    await expect.poll(async () => {
      const state = await session(page);
      if (state.error || state.job?.state === 'failed') throw new Error(state.error || JSON.stringify(state.job?.error));
      return state.final;
    }, { timeout: 120_000 }).toBe(second.job_id);
    // The status shortcut must also reveal the panel after the toolbar goes idle.
    await page.keyboard.press('Tab');
    await page.getByRole('button', { name: /Training.*Succeeded/ }).click({ timeout: 10_000 });
    await expect(start).toBeEnabled();
    await expect(panel.getByRole('button', { name: /download|load result/i })).toHaveCount(0);
    await testInfo.attach('restart.json', { body: JSON.stringify({ first: stopped, second: (await session(page)).job, uploads }, null, 2), contentType: 'application/json' });
    await testInfo.attach('restart-complete.png', { body: await page.screenshot(), contentType: 'image/png' });
  } finally {
    const current = await session(page).catch(() => null);
    if (current?.job) owned.add(current.job.job_id);
    for (const jobId of owned) await request.post(`${apiUrl}/api/v1/jobs/${jobId}/cancel`).catch(() => undefined);
  }
});
