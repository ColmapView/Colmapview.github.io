import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import { test, expect } from './fixtures/test-fixtures';
import { loadTestDataset } from './fixtures/load-test-data';
import { captureSceneCenter, compareScreenshots } from './fixtures/splat-probe';

type CameraDisplayMode = 'frustum' | 'arrow' | 'imageplane';

interface SceneObjectTarget {
  imageId: number;
  displayMode: CameraDisplayMode;
  selectedImageId: number | null;
  x: number;
  y: number;
}

interface TouchE2EApi {
  clearSelectedImage: () => void;
  getSceneObjectTarget: (name: 'camera-frustum-plane') => SceneObjectTarget | null;
  getSelectedImageId: () => number | null;
  setCameraDisplayMode: (mode: CameraDisplayMode) => void;
  setCameraScale: (scale: number) => void;
  waitForRenderFrames: (count?: number) => Promise<void>;
}

/** Local view of the page globals; other specs declare the probe with their own shape. */
type ProbeWindow = Window & {
  __COLMAP_WEBVIEW_E2E__?: TouchE2EApi;
  __pointerLockRequests?: number;
};

// Longer than TOUCH.doubleTapDelay (300 ms), so two taps never read as a double-tap reset.
const BETWEEN_TAPS_MS = 700;

async function openPhoneViewer(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript(() => {
    (window as ProbeWindow).__pointerLockRequests = 0;
    Element.prototype.requestPointerLock = function () {
      (window as ProbeWindow).__pointerLockRequests = ((window as ProbeWindow).__pointerLockRequests ?? 0) + 1;
      return Promise.resolve();
    };
  });
  await page.goto('/?e2eProbe=1&touch=true');
  const dismiss = page.getByRole('button', { name: 'Dismiss this panel', exact: true });
  if (await dismiss.isVisible({ timeout: 2_000 })) await dismiss.click();
  await loadTestDataset(page);
  await expect(page.getByTestId('scene-3d')).toBeVisible({ timeout: 45_000 });
  await page.waitForFunction(() => Boolean((window as ProbeWindow).__COLMAP_WEBVIEW_E2E__), null, { timeout: 10_000 });
  return page;
}

async function touchDrag(cdp: CDPSession, from: [number, number], to: [number, number]): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1] }] });
  for (let step = 1; step <= 6; step += 1) {
    const x = from[0] + ((to[0] - from[0]) * step) / 6;
    const y = from[1] + ((to[1] - from[1]) * step) / 6;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function cameraTarget(page: Page): Promise<SceneObjectTarget> {
  await page.evaluate(async () => {
    const api = (window as ProbeWindow).__COLMAP_WEBVIEW_E2E__!;
    api.clearSelectedImage();
    api.setCameraScale(0.05);
    api.setCameraDisplayMode('frustum');
    await api.waitForRenderFrames(3);
  });
  // The load's reset-view flight moves every camera on screen; tap only once it has settled.
  let previous = '';
  await expect.poll(async () => {
    const target = await page.evaluate(() => {
      const found = (window as ProbeWindow).__COLMAP_WEBVIEW_E2E__?.getSceneObjectTarget('camera-frustum-plane');
      return found && document.elementFromPoint(found.x, found.y)?.tagName === 'CANVAS'
        ? `${Math.round(found.x)},${Math.round(found.y)}` : '';
    });
    const settled = target !== '' && target === previous;
    previous = target;
    return settled;
  }, { intervals: [300], timeout: 15_000 }).toBe(true);
  return (await page.evaluate(() => (window as ProbeWindow).__COLMAP_WEBVIEW_E2E__!.getSceneObjectTarget('camera-frustum-plane')))!;
}

const selectedImageId = (page: Page) => page.evaluate(() => (window as ProbeWindow).__COLMAP_WEBVIEW_E2E__?.getSelectedImageId() ?? null);

test.describe('Phone touch gestures', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Touch input is dispatched through the Chromium DevTools protocol');

  let context: BrowserContext;
  let page: Page;

  test.beforeEach(async ({ browser, baseURL }) => {
    context = await browser.newContext({ viewport: { width: 412, height: 839 }, hasTouch: true, isMobile: true, baseURL });
    page = await openPhoneViewer(context);
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('a one-finger orbit never requests pointer lock', async () => {
    const cdp = await context.newCDPSession(page);
    await touchDrag(cdp, [120, 520], [260, 560]);
    await touchDrag(cdp, [260, 560], [140, 480]);

    expect(await page.evaluate(() => (window as ProbeWindow).__pointerLockRequests)).toBe(0);
  });

  test('the first tap selects a camera and the second flies into it', async () => {
    // After the load the chrome has idled, and the first tap only wakes it.
    await page.touchscreen.tap(20, 420);
    await page.waitForTimeout(BETWEEN_TAPS_MS);
    const target = await cameraTarget(page);
    const before = await captureSceneCenter(page);

    await page.touchscreen.tap(target.x, target.y);
    await expect.poll(() => selectedImageId(page)).toBe(target.imageId);
    await page.evaluate(() => (window as ProbeWindow).__COLMAP_WEBVIEW_E2E__!.waitForRenderFrames(10));
    await page.waitForTimeout(BETWEEN_TAPS_MS);
    const selected = await captureSceneCenter(page);
    // Selection only recolours the camera; the view itself stays put.
    const selectDiff = (await compareScreenshots(page, before, selected)).changedFraction;
    expect(selectDiff).toBeLessThan(0.01);

    await page.touchscreen.tap(target.x, target.y);
    await page.waitForTimeout(1_500);
    const flown = await captureSceneCenter(page);
    expect(await selectedImageId(page)).toBe(target.imageId);
    const flyDiff = (await compareScreenshots(page, selected, flown)).changedFraction;
    expect(flyDiff).toBeGreaterThan(0.03);
  });

  test('long-press on empty space opens no custom menu', async ({ scene3d }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 60, y: 760 }] });
    await page.waitForTimeout(900);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect(scene3d.contextMenu).toBeHidden();
  });
});
