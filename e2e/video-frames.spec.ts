import { expect, test } from '@playwright/test';
import { stat } from 'node:fs/promises';

for (const software of [false, true]) {
  test(`camera videos supply matching gallery frames with ${software ? 'software' : 'native'} decoding`, async ({ page, baseURL }) => {
    if (software) await page.addInitScript(() => {
      VideoDecoder.isConfigSupported = async config => ({ supported: false, config });
    });
    const root = baseURL + '/e2e/fixtures/video-frames/';
    const bytes = (await stat('e2e/fixtures/video-frames/colors.mp4')).size;
    await page.route(root + 'cameras.txt', route => route.fulfill({ body: '1 PINHOLE 64 80 64 64 32 40\n2 PINHOLE 64 80 64 64 32 40\n' }));
    await page.route(root + 'images.txt', route => route.fulfill({ body: '1 1 0 0 0 0 0 0 1 a.png\n\n2 1 0 0 0 1 0 0 2 b.png\n\n' }));
    await page.route('**/camera-video.manifest.json', route => route.fulfill({ json: {
      version: 4, name: 'Camera video fixture', baseUrl: root,
      files: { cameras: 'cameras.txt', images: 'images.txt' }, splats: [],
      videoImages: { 'a.png': { url: 'colors.mp4', bytes, timestamp: 0 }, 'b.png': { url: 'colors.mp4', bytes, timestamp: 1 } },
    } }));
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?url=' + encodeURIComponent(baseURL + '/camera-video.manifest.json'));
    const first = page.getByRole('img', { name: 'a.png', exact: true });
    const second = page.getByRole('img', { name: 'b.png', exact: true });
    await expect(first).toBeVisible({ timeout: 45000 });
    await expect(second).toBeVisible({ timeout: 45000 });
    const pixel = (image: typeof first) => image.evaluate(element => {
      const source = element as HTMLImageElement;
      const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
      const context = canvas.getContext('2d')!; context.drawImage(source, 0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    });
    const red = await pixel(first), green = await pixel(second);
    expect(red[0]).toBeGreaterThan(200); expect(red[1]).toBeLessThan(20);
    expect(green[1]).toBeGreaterThan(90); expect(green[0]).toBeLessThan(20);
    await page.clock.install();
    await page.evaluate(async () => {
      const module = '/src/store/index.ts';
      const { useReconstructionStore } = await import(module) as typeof import('../src/store');
      useReconstructionStore.getState().loadedFiles!.videoFrames!.clear();
    });
    await page.getByTestId('image-gallery-toolbar-slot').hover();
    await page.getByRole('combobox', { name: 'Camera filter' }).selectOption('1');
    await expect(first).toBeVisible();
    await page.getByTestId('image-gallery-toolbar-slot').hover();
    await page.getByRole('combobox', { name: 'Camera filter' }).selectOption('all');
    await page.clock.runFor(1000);
    await expect(second).toBeVisible();
    expect(await pixel(second)).toEqual(green);
    expect(await page.evaluate(async () => {
      const module = '/src/store/index.ts';
      const { useReconstructionStore } = await import(module) as typeof import('../src/store');
      return useReconstructionStore.getState().loadedFiles!.videoFrames!.getStats().count;
    })).toBe(0);
    expect(errors).toEqual([]);
  });
}

for (const version of [4, 5]) for (const software of [false, true]) {
test(`v${version} B-frame ${software ? 'pixels match independent FFmpeg references' : 'selection matches explicit source timestamps'}`, async ({ page, baseURL }) => {
  if (software) await page.addInitScript(() => { VideoDecoder.isConfigSupported = async config => ({ supported: false, config }); });
  const root = baseURL + '/e2e/fixtures/video-frames/', timestamps = [1.8, 2.2, 4.2, 4.8];
  const names = ['a.png', 'b.png', 'c.png', 'd.png'], bytes = (await stat('e2e/fixtures/video-frames/bframes.mp4')).size;
  await page.route(root + 'images.txt', route => route.fulfill({ body: names.map((name, index) => `${index + 1} 1 0 0 0 ${index} 0 0 1 ${name}\n\n`).join('') }));
  await page.route('**/bframes.manifest.json', route => route.fulfill({ json: { version, baseUrl: root,
    files: { cameras: 'cameras.txt', images: 'images.txt' }, splats: [],
    videoImages: Object.fromEntries(names.map((name, index) => [name, { url: 'bframes.mp4', bytes,
      ...(version === 5 ? { frameIndex: Math.round(timestamps[index] * 5) } : { timestamp: timestamps[index] }) } ])),
  } }));
  await page.goto('/?url=' + encodeURIComponent(baseURL + '/bframes.manifest.json'));
  for (let index = 0; index < names.length; index++) {
    const frame = page.getByRole('img', { name: names[index], exact: true });
    await expect(frame).toBeVisible({ timeout: 45000 });
    // Gallery thumbnails resample the source; compare the original/export read.
    const difference = await page.evaluate(async ({ name, referenceURL, timestamp, software }) => {
      const module = '/src/dataset/index.ts';
      const { getDatasetManager } = await import(module) as typeof import('../src/dataset');
      const manager = getDatasetManager(), file = await manager.getOriginalImage(name);
      if (!file) throw new Error('The matching source frame is missing.');
      const source = manager.getVideoSource(name)!, selected = await source.resolveFrame!(new AbortController().signal);
      let referenceBlob: Blob;
      if (software) referenceBlob = await fetch(referenceURL).then(response => response.blob());
      else {
        // Hardware chroma interpolation differs from FFmpeg. Compare native selection
        // against the explicit source-clock read, independently of the index resolver.
        const decoderModule = '/src/dataset/video/decodeVideoFrame.ts';
        const { decodeVideoFrame } = await import(decoderModule) as typeof import('../src/dataset/video/decodeVideoFrame');
        referenceBlob = await decodeVideoFrame(name, { url: source.url, bytes: source.bytes, width: source.width,
          height: source.height, timestamp }, new AbortController().signal);
      }
      const image = await createImageBitmap(file, { colorSpaceConversion: 'none' });
      const reference = await createImageBitmap(referenceBlob, { colorSpaceConversion: 'none' });
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 80;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0); image.close();
      const actual = context.getImageData(0, 0, 64, 80).data;
      context.drawImage(reference, 0, 0);
      reference.close();
      const expected = context.getImageData(0, 0, 64, 80).data;
      let sum = 0, maximum = 0;
      for (let index = 0; index < actual.length; index++) {
        const delta = Math.abs(actual[index] - expected[index]); sum += delta; maximum = Math.max(maximum, delta);
      }
      return { mean: sum / actual.length, maximum, timestamp: selected.timestamp };
    }, { name: names[index], referenceURL: root + `reference-${timestamps[index]}.png`, timestamp: timestamps[index], software });
    expect(difference.timestamp).toBeCloseTo(timestamps[index], 8);
    expect(difference.maximum, `${timestamps[index]}s maximum pixel difference`).toBeLessThanOrEqual(3);
    expect(difference.mean, `${timestamps[index]}s mean pixel difference`).toBeLessThan(0.75);
  }
});
}
