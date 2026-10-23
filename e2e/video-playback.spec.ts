import { expect, test, type Page } from '@playwright/test';
import { stat } from 'node:fs/promises';

async function loadVideoFixture(page: Page, baseURL: string, touch = false) {
  const root = baseURL + '/e2e/fixtures/video-frames/';
  const bytes = (await stat('e2e/fixtures/video-frames/colors.mp4')).size;
  await page.route('**/playback.manifest.json', route => route.fulfill({ json: {
    version: 4, baseUrl: root, files: { cameras: 'cameras.txt', images: 'images.txt' }, splats: [],
    videoImages: { 'a.png': { url: 'colors.mp4', bytes, timestamp: 0 }, 'b.png': { url: 'colors.mp4', bytes, timestamp: 1 } },
  } }));
  await page.goto('/?touch=' + touch + '&url=' + encodeURIComponent(baseURL + '/playback.manifest.json'));
  if (touch) await page.getByRole('button', { name: 'Show gallery', exact: true }).tap();
  await expect(page.getByRole('img', { name: 'b.png', exact: true })).toBeVisible({ timeout: 45000 });
}

for (const software of [false, true]) {
  test(`individual camera playback, seek and cleanup (${software ? 'software' : 'native'})`, async ({ page, baseURL }) => {
    if (software) await page.addInitScript(() => { Object.defineProperty(window, 'VideoDecoder', { value: undefined, configurable: true }); });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await loadVideoFixture(page, baseURL!);
    await page.getByRole('img', { name: 'a.png', exact: true }).dblclick();
    await expect(page.getByRole('button', { name: 'Play camera video' })).toBeVisible();
    expect(await page.locator('canvas[aria-label^="Video frame"]').count()).toBe(0);
    await page.getByRole('button', { name: 'Play camera video' }).click();
    const frame = page.getByLabel('Video frame a.png', { exact: true });
    const pixel = () => frame.evaluate(element => {
      const canvas = element as HTMLCanvasElement;
      return [...canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data];
    });
    await expect.poll(async () => (await pixel())[0], { timeout: 45000 }).toBeGreaterThan(200);
    await page.getByRole('button', { name: 'Pause video' }).click();
    await page.getByRole('slider', { name: 'Video time' }).fill('1');
    await expect.poll(async () => (await pixel())[1], { timeout: 45000 }).toBeGreaterThan(90);
    await page.getByRole('button', { name: 'Back to matched frame' }).click();
    await expect(frame).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Play camera video' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Points2D/ })).toBeVisible();
    await page.getByRole('button', { name: 'Play camera video' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Camera video a.png', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Play camera video' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('camera playback and return controls remain reachable on a phone', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, baseURL });
  const page = await context.newPage();
  try {
    await loadVideoFixture(page, baseURL!, true);
    const notifications = page.getByRole('button', { name: 'Close notification', exact: true });
    while (await notifications.count()) {
      const count = await notifications.count();
      await notifications.first().tap();
      await expect.poll(() => notifications.count()).toBeLessThan(count);
    }
    const image = page.getByRole('img', { name: 'a.png', exact: true });
    await image.tap(); await image.tap();
    await page.getByRole('button', { name: 'Play camera video' }).tap();
    const slider = page.getByRole('slider', { name: 'Video time' });
    await expect(slider).toBeEnabled();
    await expect(slider).toBeInViewport();
    const back = page.getByRole('button', { name: 'Back to matched frame' });
    await expect(back).toBeInViewport();
    const bounds = await back.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44); expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath('camera-video-phone.png') });
    await back.tap();
    await expect(page.getByRole('button', { name: 'Play camera video' })).toBeInViewport();
  } finally { await context.close().catch(() => {}); }
});

test('software playback windows preserve open-GOP B-frames and the final frame', async ({ page, baseURL }) => {
  await page.addInitScript(() => { VideoDecoder.isConfigSupported = async config => ({ supported: false, config }); });
  await page.goto('/');
  const root = baseURL + '/e2e/fixtures/video-frames/';
  const bytes = (await stat('e2e/fixtures/video-frames/bframes.mp4')).size;
  const differences = await page.evaluate(async ({ root, bytes }) => {
    const module = '/src/dataset/video/videoPlayback.ts';
    const { playCameraVideo } = await import(module) as typeof import('../src/dataset/video/videoPlayback');
    const references = new Map<number, Uint8ClampedArray>();
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 80;
    const context = canvas.getContext('2d')!;
    for (const time of [1.8, 2.2, 4.2, 4.8]) {
      const image = new Image(); image.src = root + `reference-${time}.png`; await image.decode();
      context.drawImage(image, 0, 0); references.set(time, context.getImageData(0, 0, 64, 80).data);
    }
    const differences: { time: number; mean: number; maximum: number }[] = [];
    const signal = new AbortController().signal;
    await playCameraVideo({ url: root + 'bframes.mp4', bytes, timestamp: 1.8, width: 64, height: 80, signal }, canvas, {
      signal, timestamp: 1.8, onReady() {}, onBuffering() {},
      onFrame(timestamp) {
        const time = Math.round(timestamp * 10) / 10, expected = references.get(time);
        if (!expected) return;
        const actual = context.getImageData(0, 0, 64, 80).data;
        let sum = 0, maximum = 0;
        for (let index = 0; index < actual.length; index++) {
          const delta = Math.abs(actual[index] - expected[index]); sum += delta; maximum = Math.max(maximum, delta);
        }
        differences.push({ time, mean: sum / actual.length, maximum });
      },
    });
    return differences;
  }, { root, bytes });
  expect(differences.map(result => result.time)).toEqual([1.8, 2.2, 4.2, 4.8]);
  for (const result of differences) { expect(result.maximum).toBeLessThanOrEqual(3); expect(result.mean).toBeLessThan(0.75); }
});

test('canceling a pending video read releases the session without a background rejection', async ({ page, baseURL }) => {
  await page.goto('/');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let received!: () => void;
  const pendingRead = new Promise<void>(resolve => { received = resolve; });
  let finish!: () => void;
  const releaseRead = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/stalled-video.mp4', async route => { received(); await releaseRead; await route.abort(); });
  await page.evaluate(async url => {
    const module = '/src/dataset/video/videoPlayback.ts';
    const { playCameraVideo } = await import(module) as typeof import('../src/dataset/video/videoPlayback');
    const controller = new AbortController();
    (window as any).pendingVideoController = controller;
    (window as any).pendingVideoResult = playCameraVideo({ url, bytes: 1000, timestamp: 0, width: 64, height: 80, signal: controller.signal }, document.createElement('canvas'), {
      signal: controller.signal, timestamp: 0, onReady() {}, onFrame() {}, onBuffering() {},
    }).then(() => 'unexpected completion', () => 'canceled');
  }, baseURL + '/stalled-video.mp4');
  await pendingRead;
  await page.evaluate(() => (window as any).pendingVideoController.abort());
  expect(await page.evaluate(() => (window as any).pendingVideoResult)).toBe('canceled');
  finish();
  // Let the aborted source worker settle as well as the foreground reader.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(errors).toEqual([]);
});
