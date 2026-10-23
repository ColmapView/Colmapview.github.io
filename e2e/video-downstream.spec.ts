import { expect, test } from '@playwright/test';
import { stat } from 'node:fs/promises';
import { videoPixel } from './fixtures/video-pixel';

for (const extension of ['mp4', 'webm']) {
  test(`one-time video conversion preserves variable presentation timestamps (${extension})`, async ({ page, baseURL }) => {
    await page.goto('/');
    const frames = await page.evaluate(async url => {
      const videoModule = '/src/dataset/video/prepareCompatibleCameraVideo.ts', bunnyModule = '/node_modules/mediabunny/dist/modules/src/index.js';
      const { prepareCompatibleCameraVideo } = await import(videoModule) as typeof import('../src/dataset/video/prepareCompatibleCameraVideo');
      const { Input, BlobSource, MP4, EncodedPacketSink } = await import(bunnyModule) as typeof import('mediabunny');
      const blob = await fetch(url).then(response => response.blob()), signal = new AbortController().signal;
      const output = await prepareCompatibleCameraVideo(blob, { url, bytes: blob.size, timestamp: 0, width: 64, height: 80 }, 6, signal, () => {});
      const input = new Input({ source: new BlobSource(output), formats: [MP4] });
      try {
        const track = (await input.getPrimaryVideoTrack())!, timestamps: number[] = [];
        for await (const packet of new EncodedPacketSink(track).packets(undefined, undefined, { metadataOnly: true })) timestamps.push(Math.round(packet.timestamp * 10) / 10);
        return timestamps;
      } finally { input.dispose(); }
    }, `${baseURL}/e2e/fixtures/video-frames/vfr.${extension}`);
    expect(frames).toEqual(Array.from({ length: 60 }, (_, index) => index).filter(index => !(index >= 10 && index <= 14 || index >= 30 && index <= 39)).map(index => index / 10));
  });
}

test('an uncached original read returns the registered export frame while cached video keeps playing', async ({ page, baseURL }) => {
  const root = baseURL + '/e2e/fixtures/video-frames/', bytes = (await stat('e2e/fixtures/video-frames/long.mp4')).size;
  await page.route('**/downstream.manifest.json', route => route.fulfill({ json: {
    version: 4, baseUrl: root, files: { cameras: 'cameras.txt', images: 'images.txt' }, splats: [],
    videoImages: { 'a.png': { url: 'long.mp4', bytes, timestamp: 0 }, 'b.png': { url: 'long.mp4', bytes, timestamp: 1 } },
  } }));
  await page.goto('/?url=' + encodeURIComponent(baseURL + '/downstream.manifest.json'));
  await expect(page.getByRole('img', { name: 'b.png', exact: true })).toBeVisible({ timeout: 45000 });
  await page.getByRole('img', { name: 'a.png', exact: true }).dblclick();
  await page.getByRole('button', { name: 'Play camera video' }).click();
  const frame = page.getByLabel('Video frame a.png', { exact: true });
  await expect.poll(async () => (await frame.evaluate(videoPixel))[1]).toBeGreaterThan(90);
  const pixel = await page.evaluate(async () => {
    const datasetModule = '/src/dataset/index.ts', storeModule = '/src/store/reconstructionStore.ts';
    const { getDatasetManager } = await import(datasetModule) as typeof import('../src/dataset');
    const { useReconstructionStore } = await import(storeModule) as typeof import('../src/store/reconstructionStore');
    useReconstructionStore.getState().loadedFiles!.videoFrames!.clear();
    const file = await getDatasetManager().getOriginalImage('a.png');
    if (!file) throw new Error('The matched export frame is unavailable.');
    const image = await createImageBitmap(file), canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, 1, 1); image.close();
    return [...context.getImageData(0, 0, 1, 1).data];
  });
  expect(pixel[0]).toBeGreaterThan(200); expect(pixel[1]).toBeLessThan(20);
  await expect(page.getByRole('button', { name: 'Pause video', exact: true })).toBeVisible();
  expect(await frame.evaluate(element => (element as HTMLVideoElement).paused)).toBe(false);
});
