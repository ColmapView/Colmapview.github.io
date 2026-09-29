import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { loadTestDataset, type TestDatasetFileEntry } from './load-test-data';

export interface SplatBackendProbeState {
  requestedBackend: string;
  availability: { webGpu: string; spark: boolean; sparkPreloadFailed?: boolean; activeSplatRenderer?: string };
  resolution: { status: string; backend: string | null; reason: string };
}
interface Probe {
  getImageIds: () => number[];
  getSplatBackendState: () => SplatBackendProbeState;
  resetSession: () => void;
  waitForRenderFrames: (count?: number) => Promise<void>;
}
type ProbeWindow = Window & { __COLMAP_WEBVIEW_E2E__?: Probe };

export const SOG_FIXTURE = new URL('./splats/sog-scene.sog', import.meta.url);
export const PLY_FIXTURE = new URL('./splats/sog-scene.ply', import.meta.url);

export function splatEntry(fixture: URL, name: string, bytes: Uint8Array = readFileSync(fixture)): TestDatasetFileEntry {
  return { relativePath: `splats/${name}`, name, base64: Buffer.from(bytes).toString('base64') };
}

export async function waitForSceneProbe(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as ProbeWindow).__COLMAP_WEBVIEW_E2E__), null, { timeout: 10_000 });
}

export async function getSplatBackendState(page: Page): Promise<SplatBackendProbeState> {
  return page.evaluate(() => (window as ProbeWindow).__COLMAP_WEBVIEW_E2E__!.getSplatBackendState());
}

export async function getImageCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as ProbeWindow).__COLMAP_WEBVIEW_E2E__!.getImageIds().length);
}

export async function waitForSplatBackend(page: Page, backend: 'spark' | 'webgpu'): Promise<SplatBackendProbeState> {
  await expect.poll(async () => {
    const state = await getSplatBackendState(page);
    return `${state.resolution.status}:${state.resolution.backend}`;
  }, { timeout: 45_000 }).toBe(`resolved:${backend}`);
  return getSplatBackendState(page);
}

export async function waitForFrames(page: Page, count = 5): Promise<void> {
  await page.evaluate((frames) => (window as ProbeWindow).__COLMAP_WEBVIEW_E2E__!.waitForRenderFrames(frames), count);
}

export async function resetSession(page: Page): Promise<void> {
  await page.evaluate(() => (window as ProbeWindow).__COLMAP_WEBVIEW_E2E__!.resetSession());
  await expect(page.getByTestId('webgpu-splat-canvas')).toHaveCount(0, { timeout: 30_000 });
}

/** Cycle the point-cloud mode with P until the button reports `label` (e.g. 'Splats', 'Off'). */
export async function setPointCloudMode(page: Page, label: 'Off' | 'Splats'): Promise<void> {
  await page.keyboard.press('Tab'); // wake auto-hidden controls
  // Tab also moves focus, and repeated calls walk it onto a form control (the FOV slider),
  // where the P hotkey is ignored. Hand focus back to the page before pressing P.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const button = page.locator('button[aria-label^="Point Cloud:"]').first();
  await expect(button).toBeVisible({ timeout: 10_000 });
  const wanted = `Point Cloud: ${label} (P)`;
  for (let attempt = 0; attempt < 7 && await button.getAttribute('aria-label') !== wanted; attempt += 1) {
    await page.keyboard.press('p');
    await page.waitForTimeout(50);
  }
  await expect(button).toHaveAttribute('aria-label', wanted);
}

export async function captureSceneCenter(page: Page): Promise<Buffer> {
  const box = (await page.getByTestId('scene-3d').boundingBox())!;
  const width = Math.floor(Math.min(320, box.width * 0.45));
  const height = Math.floor(Math.min(240, box.height * 0.45));
  return page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    // Toasts stack down from the top and auto-dismiss on a timer; keep them out of scene captures.
    style: '.z-toast { visibility: hidden !important; }',
    clip: { x: Math.floor(box.x + box.width / 2 - width / 2), y: Math.floor(box.y + box.height / 2 - height / 2), width, height },
  });
}

/** Compares two same-size screenshots in the page: PSNR (dB) and the share of visibly different pixels. */
export async function compareScreenshots(page: Page, a: Buffer, b: Buffer): Promise<{ psnr: number; changedFraction: number }> {
  return page.evaluate(async ([first, second]) => {
    const pixels = async (base64: string) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const [x, y] = [await pixels(first), await pixels(second)];
    let squared = 0;
    let changed = 0;
    for (let i = 0; i < x.length; i += 4) {
      let pixelDelta = 0;
      for (let c = 0; c < 3; c += 1) {
        const d = x[i + c] - y[i + c];
        squared += d * d;
        pixelDelta += Math.abs(d);
      }
      if (pixelDelta > 30) changed += 1;
    }
    const mse = squared / ((x.length / 4) * 3);
    return { psnr: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse), changedFraction: changed / (x.length / 4) };
  }, [a.toString('base64'), b.toString('base64')] as const);
}

/**
 * Waits for the splat to finish loading. A dropped splat keeps the loading overlay (its
 * "Loading" logo) up from the drop until the resolved renderer has loaded or rejected it.
 */
async function waitForSplatLoaded(page: Page): Promise<void> {
  await waitForFrames(page, 2); // let the resolved renderer take over the overlay
  await expect(page.getByAltText('Loading', { exact: true })).toHaveCount(0, { timeout: 45_000 });
}

/**
 * Loads the e2e dataset plus one splat, and returns the Off vs Splats captures of the same view.
 * Both captures follow the load, moments apart and each just after a Tab wake, so the loading
 * overlay and the idle auto-hide (which hides the grid after 3 s) cannot differ between them.
 */
export async function loadAndCaptureSplat(page: Page, splat: TestDatasetFileEntry, backend: 'spark' | 'webgpu') {
  await loadTestDataset(page, [splat]);
  await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45_000 });
  await setPointCloudMode(page, 'Splats');
  const state = await waitForSplatBackend(page, backend);
  await waitForSplatLoaded(page);
  await setPointCloudMode(page, 'Off');
  await waitForFrames(page);
  const off = await captureSceneCenter(page);
  await setPointCloudMode(page, 'Splats');
  await waitForFrames(page, 20);
  return { off, splats: await captureSceneCenter(page), state };
}
