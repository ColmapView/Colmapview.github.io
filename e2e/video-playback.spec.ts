import { expect, test, type Page } from '@playwright/test';
import { stat } from 'node:fs/promises';
import { videoPixel } from './fixtures/video-pixel';

async function loadVideoFixture(page: Page, baseURL: string, touch = false, filename = 'colors.mp4') {
  const root = baseURL + '/e2e/fixtures/video-frames/';
  const bytes = (await stat('e2e/fixtures/video-frames/' + filename)).size;
  await page.route('**/playback.manifest.json', route => route.fulfill({ json: {
    version: 4, baseUrl: root, files: { cameras: 'cameras.txt', images: 'images.txt' }, splats: [],
    videoImages: { 'a.png': { url: filename, bytes, timestamp: 0 }, 'b.png': { url: filename, bytes, timestamp: 1 } },
  } }));
  await page.goto('/?touch=' + touch + '&url=' + encodeURIComponent(baseURL + '/playback.manifest.json'));
  if (touch) await page.getByRole('button', { name: 'Show gallery', exact: true }).tap();
  await expect(page.getByRole('img', { name: 'b.png', exact: true })).toBeVisible({ timeout: 45000 });
}

for (const mode of ['native', 'converted', 'without WebCodecs']) {
  test(`cached video keeps image bounds, overlays controls and seeks without another download (${mode})`, async ({ page, baseURL }) => {
    if (mode === 'converted') await page.addInitScript(() => {
      HTMLMediaElement.prototype.canPlayType = () => '';
      if (typeof VideoDecoder !== 'undefined') VideoDecoder.isConfigSupported = async config => ({ supported: false, config });
    });
    if (mode === 'without WebCodecs') await page.addInitScript(() => { Object.defineProperty(window, 'VideoDecoder', { value: undefined, configurable: true }); });
    const errors: string[] = [], downloads: string[] = [];
    const filename = mode === 'converted' ? 'hevc.mp4' : 'colors.mp4';
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().endsWith('/' + filename) && request.method() === 'GET' && !request.headers().range) downloads.push(request.url()); });
    await loadVideoFixture(page, baseURL!, false, filename);
    await page.getByRole('img', { name: 'a.png', exact: true }).dblclick();
    const still = page.getByRole('img', { name: 'a.png', exact: true }).last();
    const bounds = await still.boundingBox(), navigation = await page.getByRole('button', { name: 'Next', exact: true }).boundingBox();
    await page.getByRole('button', { name: 'Play camera video' }).click();
    const frame = page.getByLabel('Video frame a.png', { exact: true });
    await expect.poll(async () => frame.evaluate(element => (element as HTMLVideoElement).readyState), { timeout: 45000 }).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole('slider', { name: 'Video time' })).toBeEnabled();
    await page.getByRole('button', { name: 'Pause video' }).click();
    await expect.poll(async () => (await frame.evaluate(videoPixel))[0]).toBeGreaterThan(200);
    expect(await frame.boundingBox()).toEqual(bounds);
    expect(await page.getByRole('button', { name: 'Next', exact: true }).boundingBox()).toEqual(navigation);
    const controls = await page.getByLabel('Video controls', { exact: true }).boundingBox();
    expect(controls!.y).toBeGreaterThan(bounds!.y); expect(controls!.y + controls!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
    const slider = page.getByRole('slider', { name: 'Video time' });
    await slider.fill('1');
    await expect.poll(async () => (await frame.evaluate(videoPixel))[1]).toBeGreaterThan(90);
    await slider.fill('0.8');
    await expect.poll(async () => (await frame.evaluate(videoPixel))[0]).toBeGreaterThan(200);
    await expect(slider).toHaveValue('0.8');
    expect(downloads).toHaveLength(1);
    await page.getByRole('button', { name: 'Play video', exact: true }).click();
    await expect.poll(async () => (await frame.evaluate(videoPixel))[1]).toBeGreaterThan(90);
    expect(downloads).toHaveLength(1);
    await page.getByRole('button', { name: 'Back to matched frame' }).click();
    await expect(frame).toHaveCount(0);
    expect(await still.boundingBox()).toEqual(bounds);
    await expect(page.getByRole('button', { name: /Points2D/ })).toBeVisible();
    await page.getByRole('button', { name: 'Play camera video' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Camera video a.png', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Play camera video' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('phone controls float within the unchanged image and keep touch targets reachable', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, baseURL });
  const page = await context.newPage();
  try {
    await loadVideoFixture(page, baseURL!, true);
    const notifications = page.getByRole('button', { name: 'Close notification', exact: true });
    while (await notifications.count()) { const count = await notifications.count(); await notifications.first().tap(); await expect.poll(() => notifications.count()).toBeLessThan(count); }
    const image = page.getByRole('img', { name: 'a.png', exact: true });
    await image.tap(); await image.tap();
    const bounds = await image.last().boundingBox();
    await page.getByRole('button', { name: 'Play camera video' }).tap();
    const slider = page.getByRole('slider', { name: 'Video time' });
    await expect(slider).toBeEnabled(); await expect(slider).toBeInViewport();
    expect(await page.getByLabel('Video frame a.png', { exact: true }).boundingBox()).toEqual(bounds);
    const back = page.getByRole('button', { name: 'Back to matched frame' });
    const controls = await back.boundingBox();
    expect(controls!.width).toBeGreaterThanOrEqual(44); expect(controls!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath('camera-video-phone.png') });
    await back.tap(); await expect(page.getByRole('button', { name: 'Play camera video' })).toBeInViewport();
  } finally { await context.close().catch(() => {}); }
});

test('canceling a pending cache download releases the session without a background rejection', async ({ page, baseURL }) => {
  await page.goto('/');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  let received!: () => void, finish!: () => void;
  const pendingRead = new Promise<void>(resolve => { received = resolve; }), releaseRead = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/stalled-video.mp4', async route => { received(); await releaseRead; await route.abort(); });
  await page.evaluate(async url => {
    const module = '/src/dataset/video/cachedCameraVideo.ts';
    const { loadCachedCameraVideo } = await import(module) as typeof import('../src/dataset/video/cachedCameraVideo');
    const controller = new AbortController(); (window as any).pendingVideoController = controller;
    (window as any).pendingVideoResult = loadCachedCameraVideo({ url, bytes: 1000, timestamp: 0, width: 64, height: 80, signal: controller.signal }, document.createElement('video'), {
      signal: controller.signal, onProgress() {},
    }).then(() => 'unexpected completion', () => 'canceled');
  }, baseURL + '/stalled-video.mp4');
  await pendingRead; await page.evaluate(() => (window as any).pendingVideoController.abort());
  expect(await page.evaluate(() => (window as any).pendingVideoResult)).toBe('canceled'); finish();
  expect(errors).toEqual([]);
});
