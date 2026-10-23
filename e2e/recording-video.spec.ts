import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { loadTestDataset } from './fixtures/load-test-data';

for (const speed of [1, 4]) {
  test(`MP4 recording retains all captured frames at ${speed}x speed`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      (window as any).capturedFrames = 0;
      const encode = VideoEncoder.prototype.encode;
      VideoEncoder.prototype.encode = function (frame, options) {
        (window as any).capturedFrames++;
        return encode.call(this, frame, options);
      };
    });
    await page.goto('/');
    await loadTestDataset(page);
    await expect(page.getByTestId('scene-3d').locator('canvas')).toBeVisible({ timeout: 45000 });
    await page.getByTestId('scene-3d').hover();
    const button = page.getByRole('button', { name: 'Save screenshot', exact: true });
    await button.hover();
    const panel = page.getByRole('region', { name: 'Screenshot', exact: true });
    await panel.getByLabel('Format', { exact: true }).last().selectOption('mp4');
    await panel.getByLabel('Quality', { exact: true }).selectOption('low');
    await panel.getByRole('slider', { name: 'Duration', exact: true }).fill('5');
    await panel.getByLabel('Scale', { exact: true }).selectOption('4');
    await panel.getByLabel('Speed', { exact: true }).selectOption(String(speed));
    const downloaded = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'Record', exact: true }).click();
    const download = await downloaded, path = testInfo.outputPath(`recording-${speed}x.mp4`);
    await download.saveAs(path);
    const result = await page.evaluate(async data => {
      const module = '/node_modules/mediabunny/dist/modules/src/index.js';
      const { Input, BufferSource, MP4, EncodedPacketSink } = await import(module) as typeof import('mediabunny');
      const input = new Input({ source: new BufferSource(Uint8Array.from(atob(data), value => value.charCodeAt(0))), formats: [MP4] });
      try {
        const track = (await input.getPrimaryVideoTrack())!;
        let frames = 0;
        for await (const _packet of new EncodedPacketSink(track).packets(undefined, undefined, { metadataOnly: true })) frames++;
        return { captured: (window as any).capturedFrames as number, frames, duration: await track.computeDuration() };
      } finally { input.dispose(); }
    }, (await readFile(path)).toString('base64'));
    expect(result.captured).toBeGreaterThan(15);
    expect(result.frames).toBe(result.captured);
    expect(result.duration).toBeCloseTo(result.frames / (30 * speed), 2);
    expect(errors).toEqual([]);
    await testInfo.attach('recording-counts', { body: JSON.stringify(result), contentType: 'application/json' });
  });
}
