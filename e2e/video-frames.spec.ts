import { expect, test } from '@playwright/test';
import { stat } from 'node:fs/promises';

for (const software of [false, true]) {
  test(`camera videos supply matching gallery frames with ${software ? 'software' : 'native'} decoding`, async ({ page, baseURL }) => {
    if (software) await page.addInitScript(() => {
      VideoDecoder.isConfigSupported = async config => ({ supported: false, config });
    });
    const root = baseURL + '/e2e/fixtures/video-frames/';
    const bytes = (await stat('e2e/fixtures/video-frames/colors.mp4')).size;
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
    expect(errors).toEqual([]);
  });
}
