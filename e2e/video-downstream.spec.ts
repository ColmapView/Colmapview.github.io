import { expect, test } from '@playwright/test';
import { stat } from 'node:fs/promises';

for (const extension of ['mp4', 'webm']) {
  test(`software playback preserves variable frame timing (${extension})`, async ({ page, baseURL }) => {
    await page.addInitScript(() => { VideoDecoder.isConfigSupported = async config => ({ supported: false, config }); });
    await page.goto('/');
    const bytes = (await stat(`e2e/fixtures/video-frames/vfr.${extension}`)).size;
    const frames = await page.evaluate(async ({ url, bytes }) => {
      const module = '/src/dataset/video/videoPlayback.ts';
      const { playCameraVideo } = await import(module) as typeof import('../src/dataset/video/videoPlayback');
      const timestamps: number[] = [], signal = new AbortController().signal;
      await playCameraVideo({ url, bytes, timestamp: 0, width: 64, height: 80, signal }, document.createElement('canvas'), {
        signal, timestamp: 0, onReady() {}, onBuffering() {}, onFrame(value) { timestamps.push(Math.round(value * 10) / 10); },
      });
      return timestamps;
    }, { url: `${baseURL}/e2e/fixtures/video-frames/vfr.${extension}`, bytes });
    expect(frames).toEqual(Array.from({ length: 60 }, (_, index) => index).filter(index => !(index >= 10 && index <= 14 || index >= 30 && index <= 39)).map(index => index / 10));
  });
}

test('an uncached original read pauses playback and preserves the matched export frame', async ({ page, baseURL }) => {
  const root = baseURL + '/e2e/fixtures/video-frames/';
  const bytes = (await stat('e2e/fixtures/video-frames/long.mp4')).size;
  await page.route('**/downstream.manifest.json', route => route.fulfill({ json: {
    version: 4, baseUrl: root, files: { cameras: 'cameras.txt', images: 'images.txt' }, splats: [],
    videoImages: { 'a.png': { url: 'long.mp4', bytes, timestamp: 0 }, 'b.png': { url: 'long.mp4', bytes, timestamp: 1 } },
  } }));
  await page.goto('/?url=' + encodeURIComponent(baseURL + '/downstream.manifest.json'));
  await expect(page.getByRole('img', { name: 'b.png', exact: true })).toBeVisible({ timeout: 45000 });
  await page.getByRole('img', { name: 'a.png', exact: true }).dblclick();
  await page.getByRole('button', { name: 'Play camera video' }).click();
  const frame = page.getByLabel('Video frame a.png', { exact: true });
  await expect.poll(() => frame.evaluate(element => (element as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 1, 1).data[1])).toBeGreaterThan(90);
  await page.evaluate(async () => {
    const datasetModule = '/src/dataset/index.ts', storeModule = '/src/store/reconstructionStore.ts';
    const { getDatasetManager } = await import(datasetModule) as typeof import('../src/dataset');
    const { useReconstructionStore } = await import(storeModule) as typeof import('../src/store/reconstructionStore');
    // Model cache eviction: the gallery still owns its displayed thumbnail.
    useReconstructionStore.getState().loadedFiles!.videoFrames!.clear();
    (window as any).exportFrame = getDatasetManager().getOriginalImage('a.png').then(async file => {
      if (!file) throw new Error('The matched export frame is unavailable.');
      const image = await createImageBitmap(file), canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, 1, 1); image.close();
      (window as any).exportPixel = [...context.getImageData(0, 0, 1, 1).data];
    });
  });
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeVisible({ timeout: 5000 });
  const pixel = await page.evaluate(async () => { await (window as any).exportFrame; return (window as any).exportPixel as number[]; });
  expect(pixel[0]).toBeGreaterThan(200); expect(pixel[1]).toBeLessThan(20);
  await page.getByRole('slider', { name: 'Video time' }).fill('0.8');
  await expect.poll(() => frame.evaluate(element => (element as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 1, 1).data[0])).toBeGreaterThan(200);
  await expect(page.getByRole('slider', { name: 'Video time' })).toHaveValue('0.8');
});
