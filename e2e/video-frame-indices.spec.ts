import { expect, test, type Page } from '@playwright/test';
import { readFile, stat } from 'node:fs/promises';
import { videoPixel } from './fixtures/video-pixel';

async function bind(page: Page, baseURL: string, video: string, bytes: number, indices: [number, number]) {
  const root = baseURL + '/e2e/fixtures/video-frames/';
  await page.route(root + 'images.txt', route => route.fulfill({ body: '1 1 0 0 0 0 0 0 1 a.jpg\n\n2 1 0 0 0 0.1 0 0 1 b.jpg\n\n' }));
  await page.route('**/indices.manifest.json', route => route.fulfill({ json: {
    version: 5, baseUrl: root, files: { cameras: 'cameras.txt', images: 'images.txt' }, splats: [],
    videoImages: { 'a.jpg': { url: video, bytes, frameIndex: indices[0] }, 'b.jpg': { url: video, bytes, frameIndex: indices[1] } },
  } }));
  await page.goto('/?url=' + encodeURIComponent(baseURL + '/indices.manifest.json'), { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('img', { name: 'a.jpg', exact: true })).toBeVisible({ timeout: 45000 });
}

for (const software of [false, true]) {
  test(`frame indices drive matching stills, cached playback and JPEG exports (${software ? 'software' : 'native'})`, async ({ page, baseURL }) => {
    if (software) await page.addInitScript(() => { VideoDecoder.isConfigSupported = async config => ({ supported: false, config }); });
    let downloads = 0;
    page.on('request', request => { if (request.url().endsWith('/long.mp4') && !request.headers().range) downloads++; });
    await bind(page, baseURL!, 'long.mp4', (await stat('e2e/fixtures/video-frames/long.mp4')).size, [0, 17]);
    await expect(page.getByRole('img', { name: 'b.jpg', exact: true })).toBeVisible({ timeout: 45000 });
    await page.getByRole('img', { name: 'a.jpg', exact: true }).dblclick();
    await page.getByRole('button', { name: 'Play camera video', exact: true }).click();
    const frame = page.getByLabel('Video frame a.jpg', { exact: true });
    await expect(page.getByRole('slider', { name: 'Video time', exact: true })).toBeEnabled({ timeout: 45000 });
    await page.getByRole('slider', { name: 'Video time', exact: true }).fill('2');
    await expect.poll(async () => (await frame.evaluate(videoPixel))[1]).toBeGreaterThan(90);
    const exported = await page.evaluate(async () => {
      const datasetModule = '/src/dataset/index.ts', storeModule = '/src/store/reconstructionStore.ts';
      const packageModule = '/src/parsers/cameraDatasetPackageExport.ts', publicationModule = '/src/features/datasetPublishing/preparePublication.ts';
      const transformModule = '/src/utils/sim3dTransforms.ts';
      const { getDatasetManager } = await import(datasetModule) as typeof import('../src/dataset');
      const { useReconstructionStore } = await import(storeModule) as typeof import('../src/store/reconstructionStore');
      const { writeCameraDatasetPackage } = await import(packageModule) as typeof import('../src/parsers/cameraDatasetPackageExport');
      const { preparePublication } = await import(publicationModule) as typeof import('../src/features/datasetPublishing/preparePublication');
      const { createIdentityEuler } = await import(transformModule) as typeof import('../src/utils/sim3dTransforms');
      const manager = getDatasetManager(), state = useReconstructionStore.getState(), signal = new AbortController().signal;
      const files: Record<string, Blob> = {};
      await writeCameraDatasetPackage(state.reconstruction!, null, createIdentityEuler(), manager, false, signal,
        async (path, blob) => { files[path] = blob; });
      const jpeg = files['images/a.jpg'], image = await createImageBitmap(jpeg);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, 1, 1); image.close();
      const publication = await preparePublication({ reconstruction: state.reconstruction!, source: null,
        dataset: state, sourceKey: 'test', modelRevision: 0, transform: createIdentityEuler(), splatTransform: createIdentityEuler(),
        config: {}, viewState: null, activeSplatId: null, appVersion: 'test', viewerBaseUrl: location.origin + '/' }, signal,
      { assertCurrent() {}, progress() {}, resolveRevision: async () => { throw new Error('Video frames must not use loose-photo discovery.'); }, listFiles: async () => [] });
      const published = await publication.assets.find(asset => asset.path === 'images/a.jpg')!.open(signal);
      return { signature: [...new Uint8Array(await jpeg.slice(0, 3).arrayBuffer())], type: jpeg.type,
        pixel: [...context.getImageData(0, 0, 1, 1).data], publishedSignature: [...new Uint8Array(await published.slice(0, 3).arrayBuffer())] };
    });
    expect(exported.signature).toEqual([255, 216, 255]); expect(exported.publishedSignature).toEqual(exported.signature);
    expect(exported.type).toBe('image/jpeg'); expect(exported.pixel[0]).toBeGreaterThan(200); expect(exported.pixel[1]).toBeLessThan(20);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    const next = page.getByLabel('Video frame b.jpg', { exact: true });
    await expect.poll(() => next.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThanOrEqual(17);
    expect(downloads).toBe(1);
  });
}

for (const extension of ['mp4', 'webm']) {
  test(`presentation indices preserve gaps in variable-frame-rate ${extension}`, async ({ page, baseURL }) => {
    await bind(page, baseURL!, 'vfr.' + extension, (await stat('e2e/fixtures/video-frames/vfr.' + extension)).size, [10, 25]);
    const times = await page.evaluate(async () => {
      const module = '/src/dataset/index.ts';
      const { getDatasetManager } = await import(module) as typeof import('../src/dataset');
      const manager = getDatasetManager(), signal = new AbortController().signal;
      return Promise.all(['a.jpg', 'b.jpg'].map(async name => (await manager.getVideoSource(name)!.resolveFrame!(signal)).timestamp));
    });
    expect(times[0]).toBeCloseTo(1.5); expect(times[1]).toBeCloseTo(4);
  });
}

test('large source clips supply indexed stills through ranges without offering oversized playback', async ({ page, baseURL }) => {
  const original = await readFile('e2e/fixtures/video-frames/colors.mp4'), bytes = 300000000;
  const header = Buffer.alloc(8); header.writeUInt32BE(bytes - original.length); header.write('free', 4);
  const prefix = Buffer.concat([original, header]); let transferred = 0, full = 0;
  await page.route('**/huge.mp4', async route => {
    const range = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range ?? '');
    if (!range) { full++; await route.abort(); return; }
    const start = Number(range[1]), end = Number(range[2]);
    const body = Buffer.alloc(end - start + 1);
    if (start < prefix.length) prefix.copy(body, 0, start, Math.min(end + 1, prefix.length));
    transferred += body.length;
    await route.fulfill({ status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/${bytes}`, 'Content-Type': 'video/mp4' }, body });
  });
  await bind(page, baseURL!, 'huge.mp4', bytes, [0, 1]);
  await page.getByRole('img', { name: 'a.jpg', exact: true }).dblclick();
  await expect(page.getByRole('button', { name: 'Video playback unavailable', exact: true })).toBeDisabled();
  expect(full).toBe(0); expect(transferred).toBeLessThan(4 * 1024 * 1024);
});
