import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadTestDataset } from './fixtures/load-test-data';
import type { TrainingJob } from '../src/training/types';

type VisualState = 'ready' | 'running' | 'failed' | 'succeeded';

// Exercise the real app layout and controls. Session/HTTP behavior has separate
// coverage: automatic connection probes are rejected locally, then existing Vite
// store access supplies deterministic presentation state with requests disabled.
async function openWorkspace(page: Page, touch = false) {
  const requests: string[] = [];
  await page.route('**/api/v1/**', route => {
    requests.push(route.request().url());
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"UI fixture: no service"}' });
  });
  await page.goto('/?e2eProbe=1');
  await loadTestDataset(page);
  await expect.poll(() => page.evaluate(async () => {
    const path = '/src/store/index.ts';
    const { useReconstructionStore } = await import(path) as typeof import('../src/store');
    return useReconstructionStore.getState().reconstruction?.images.size ?? 0;
  })).toBeGreaterThan(0);
  await page.evaluate(async touch => {
    const path = '/src/store/index.ts';
    const { useUIStore } = await import(path) as typeof import('../src/store');
    useUIStore.setState(state => ({
      galleryCollapsed: true, touchMode: touch, touchModeSource: 'url',
      autoHideElements: { ...state.autoHideElements, buttons: false },
    }));
  }, touch);
  const scene = page.locator('canvas').first();
  await expect(scene).toBeVisible();
  const sceneBefore = await scene.boundingBox();
  const toggle = page.getByRole('button', { name: 'Training', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  if (touch) await toggle.tap();
  else { await toggle.focus(); await page.keyboard.press('Enter'); }
  const popup = page.getByRole('region', { name: 'Training', exact: true });
  await expect(popup).toBeVisible();
  await expect(popup).not.toHaveAttribute('aria-modal', 'true');
  expect(await scene.boundingBox()).toEqual(sceneBefore);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => page.evaluate(async () => {
    const path = '/src/store/stores/trainingStore.ts';
    const { useTrainingStore } = await import(path) as typeof import('../src/store/stores/trainingStore');
    return Boolean(useTrainingStore.getState().connectionError) && !useTrainingStore.getState().requestsEnabled;
  })).toBe(true);
  await setVisualState(page, 'ready');
  expect(requests.every(url => new URL(url).pathname === '/api/v1/health')).toBe(true);
  return { requests, initialRequestCount: requests.length };
}

async function setVisualState(page: Page, state: VisualState) {
  await page.evaluate(async state => {
    const storePath = '/src/store/index.ts';
    const snapshotPath = '/src/training/trainingSnapshot.ts';
    const { useTrainingStore } = await import(storePath) as typeof import('../src/store');
    const { createTrainingSnapshot } = await import(snapshotPath) as typeof import('../src/training/trainingSnapshot');
    const snapshot = useTrainingStore.getState().snapshot ?? await createTrainingSnapshot({ maskSource: 'none' });
    useTrainingStore.getState().setSnapshot(snapshot);
    const job: TrainingJob | null = state === 'ready' ? null : {
      job_id: 'ui-run', client_snapshot_id: snapshot.id, backend_id: 'igs_plus', backend_version: '1.0',
      base_recipe_id: null, recipe_id: 'ui-recipe', settings_schema_version: null,
      recipe_summary: {}, input_requirements: { mask_source: 'none' }, settings: {}, effective_settings: {},
      state, phase: state, dataset_id: 'ui-dataset',
      source_label: 'Two-camera reconstruction', client_label: useTrainingStore.getState().clientLabel,
      queue_position: null, jobs_ahead: null, created_at: '2026-01-01T12:00:00Z',
      started_at: '2026-01-01T12:00:01Z', finished_at: state === 'running' ? null : '2026-01-01T12:01:00Z',
      enqueue_sequence: 1,
      error: state === 'failed' ? { field: 'training', code: 'fixture_failure', detail: 'Training stopped: fixture failure.' } : null,
      progress: { optimizer_step: state === 'succeeded' ? 7500 : 1875,
        image_exposures: state === 'succeeded' ? 30000 : 7500, target_image_exposures: 30000, metrics: {} },
      artifacts: state === 'succeeded' ? [{ artifact_id: 'final', url: '/unused-final.ply', format: 'ply',
        content_type: 'application/octet-stream', bytes: 2048, sha256: 'a'.repeat(64), coordinate_space: 'colmap' }] : [],
    };
    useTrainingStore.setState({
      connected: true, requestsEnabled: false, connectionError: null, phase: state === 'ready' ? 'idle' : state,
      authenticationMode: 'local', tokenRequired: false, token: '', operationError: null, settingsErrors: {},
      currentJob: job, currentJobId: job?.job_id ?? null, previewEnabled: false, previewActive: false,
      previewUpdatedAt: null, previewError: null, finalLoadedJobId: null, upload: null,
      queue: { revision: 1, capacity: 4, active_job: null, waiting: [], blocked_reason: null },
      logs: 'Fixture training log\nOriginal images verified.\nTraining renderer state ready.', logsExpanded: false,
      config: { api_version: '1.0', recipe_id: 'ui-recipe', recipe_summary: { image_exposures: 30000 },
        backend: { backend_id: 'igs_plus', version: '1.0', display_name: 'IGS+', available: true,
          unavailable_reason: null, input_formats: ['colmap'], mask_modes: ['none'], mask_sources: ['none'],
          mask_loss_modes: ['none'], preview_formats: ['ply'], artifact_formats: ['ply'], progress_units: ['image_exposures'] },
        input_requirements: { mask_source: 'none' }, limits: {} },
    });
  }, state);
}

async function attachView(page: Page, testInfo: TestInfo, name: string) {
  const screenshot = await page.screenshot({ animations: 'disabled' });
  await testInfo.attach(name, { body: screenshot, contentType: 'image/png' });
  await mkdir('.tmp/training-qualification/ui', { recursive: true });
  await writeFile(`.tmp/training-qualification/ui/${name}.png`, screenshot);
}

test.describe('Training hover panel', () => {
  test('opens on hover, stays open over content and closes when leaving', async ({ page }, testInfo) => {
    await openWorkspace(page);
    const trigger = page.getByRole('button', { name: 'Training', exact: true });
    const panel = page.getByRole('region', { name: 'Training', exact: true });
    await trigger.press('Escape');
    await trigger.blur();
    await page.mouse.move(100, 100);
    await expect(panel).toHaveCount(0);
    await trigger.hover();
    await expect(panel).toBeVisible();
    await panel.getByLabel('Server URL').hover();
    await expect(panel).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Training', exact: true })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: /Close|Resize/ })).toHaveCount(0);
    for (const phase of ['ready', 'running', 'failed', 'succeeded'] as const) {
      await setVisualState(page, phase);
      await expect(panel.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
      await expect(panel.getByRole('button')).toHaveCount(1);
      await expect(panel.locator('details, summary, pre')).toHaveCount(0);
      await expect(panel.getByText('Logs', { exact: true })).toHaveCount(0);
      if (phase !== 'ready') await expect(panel.getByRole('heading', { name: phase, exact: false })).toBeVisible();
      await expect.poll(async () => {
        const bounds = (await panel.boundingBox())!;
        return bounds.y + bounds.height;
      }).toBeLessThanOrEqual(page.viewportSize()!.height - 40);
      await attachView(page, testInfo, `hover-${phase}`);
    }
    await page.mouse.move(100, 100);
    await expect(panel).toHaveCount(0);
    await trigger.hover();
    await panel.getByLabel('Server URL').fill('http://localhost:9000');
    await expect(panel.getByLabel('Server URL')).toHaveValue('http://localhost:9000');
  });

  test('keyboard and status shortcut open the same toolbar panel', async ({ page }) => {
    await openWorkspace(page);
    const trigger = page.getByRole('button', { name: 'Training', exact: true });
    const panel = page.getByRole('region', { name: 'Training', exact: true });
    await setVisualState(page, 'running');
    await panel.getByLabel('Server URL').focus();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.getByRole('button', { name: 'Training 25%', exact: true }).click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('progressbar')).toHaveAttribute('value', '7500');
    await trigger.press('Escape');
    await trigger.press('ArrowDown');
    await expect(panel).toBeVisible();
  });
});

for (const viewport of [{ width: 390, height: 640 }, { width: 820, height: 900 }]) {
  test.describe(`Training touch panel ${viewport.width}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });
    test('opens by tap, fits the viewport and dismisses outside', async ({ page }, testInfo) => {
      await openWorkspace(page, true);
      await setVisualState(page, 'running');
      const panel = page.getByRole('region', { name: 'Training', exact: true });
      await expect.poll(async () => {
        const bounds = (await panel.boundingBox())!;
        return Math.max(-bounds.x, -bounds.y, bounds.y + bounds.height - (viewport.height - 40));
      }).toBeLessThanOrEqual(0);
      await expect(panel.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
      await attachView(page, testInfo, `hover-touch-${viewport.width}`);
      await page.touchscreen.tap(10, 10);
      await expect(panel).toHaveCount(0);
      await page.getByRole('button', { name: 'Training', exact: true }).tap();
      await expect(panel).toBeVisible();
    });
  });
}
