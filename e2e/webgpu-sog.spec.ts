import { test, expect } from './fixtures/test-fixtures';
import {
  PLY_FIXTURE, SOG_FIXTURE, compareScreenshots, getSplatBackendState, loadAndCaptureSplat, resetSession, splatEntry,
  waitForSceneProbe,
} from './fixtures/splat-probe';

test('a SOG renders with Spark without disturbing WebGPU, and the next PLY uses WebGPU', async ({ page }) => {
  await page.goto('/?e2eProbe=1&splatBackend=auto', { waitUntil: 'domcontentloaded' });
  test.skip(!await page.evaluate(() => Boolean((navigator as Navigator & { gpu?: unknown }).gpu)), 'WebGPU is unavailable');
  await waitForSceneProbe(page);

  await loadAndCaptureSplat(page, splatEntry(PLY_FIXTURE, 'sog-scene.ply'), 'webgpu');
  await expect(page.getByTestId('webgpu-splat-canvas')).toBeVisible({ timeout: 30_000 });

  await resetSession(page);
  const sog = await loadAndCaptureSplat(page, splatEntry(SOG_FIXTURE, 'sog-scene.sog'), 'spark');
  expect(sog.state.availability.webGpu).toBe('ready');
  await expect(page.getByTestId('webgpu-splat-canvas')).toHaveCount(0);
  expect((await compareScreenshots(page, sog.off, sog.splats)).changedFraction).toBeGreaterThan(0.02);

  await resetSession(page);
  await loadAndCaptureSplat(page, splatEntry(PLY_FIXTURE, 'sog-scene.ply'), 'webgpu');
  expect((await getSplatBackendState(page)).availability.webGpu).toBe('ready');
});
