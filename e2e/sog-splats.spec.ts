import { unzipSync, zipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures/test-fixtures';
import { loadTestDataset } from './fixtures/load-test-data';
import {
  PLY_FIXTURE, SOG_FIXTURE, compareScreenshots, getImageCount, getSplatBackendState,
  loadAndCaptureSplat, resetSession, setPointCloudMode, splatEntry, waitForSceneProbe,
} from './fixtures/splat-probe';

test.describe('SOG splats', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?e2eProbe=1', { waitUntil: 'domcontentloaded' });
    test.skip(!await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2'))), 'WebGL2 is unavailable');
    await waitForSceneProbe(page);
  });

  test('render a SOG through Spark in auto mode', async ({ page }) => {
    const { off, splats, state } = await loadAndCaptureSplat(page, splatEntry(SOG_FIXTURE, 'sog-scene.sog'), 'spark');
    expect(state.availability.activeSplatRenderer).toBe('spark-only');
    expect((await compareScreenshots(page, off, splats)).changedFraction).toBeGreaterThan(0.02);
    await expect(page.getByText('Failed to load splat')).toHaveCount(0);
  });

  test('explain why a damaged SOG cannot open and keep the scene usable', async ({ page }) => {
    const entries = unzipSync(readFileSync(SOG_FIXTURE));
    delete entries['meta.json'];
    await loadTestDataset(page, [splatEntry(SOG_FIXTURE, 'damaged.sog', zipSync(entries, { level: 0 }))]);
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45_000 });
    await setPointCloudMode(page, 'Splats');
    await expect(page.getByText("This SOG file can't be opened: meta.json is missing.")).toBeVisible({ timeout: 45_000 });
    expect(await getImageCount(page)).toBe(2);
    expect((await getSplatBackendState(page)).availability.webGpu).not.toBe('failed');

    await resetSession(page);
    const { off, splats } = await loadAndCaptureSplat(page, splatEntry(PLY_FIXTURE, 'sog-scene.ply'), 'spark');
    expect((await compareScreenshots(page, off, splats)).changedFraction).toBeGreaterThan(0.02);
  });

  test('match the source PLY when both render with Spark', async ({ page }) => {
    await page.goto('/?e2eProbe=1&splatBackend=spark', { waitUntil: 'domcontentloaded' });
    await waitForSceneProbe(page);
    const ply = await loadAndCaptureSplat(page, splatEntry(PLY_FIXTURE, 'sog-scene.ply'), 'spark');
    await resetSession(page);
    const sog = await loadAndCaptureSplat(page, splatEntry(SOG_FIXTURE, 'sog-scene.sog'), 'spark');
    expect((await compareScreenshots(page, ply.off, ply.splats)).changedFraction).toBeGreaterThan(0.02);
    expect((await compareScreenshots(page, sog.off, sog.splats)).changedFraction).toBeGreaterThan(0.02);
    expect((await compareScreenshots(page, ply.splats, sog.splats)).psnr).toBeGreaterThan(35);
  });
});
