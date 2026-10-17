import { test, expect } from './fixtures/test-fixtures';
import type { Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { cameraFixture } from './fixtures/camera-dataset';
import { writeCamerasBinary, writeImagesBinary, writePoints3DBinary } from '../src/parsers/colmapBinaryWriters';
import { parseImagesBinary } from '../src/parsers/images';

const output = resolve('.tmp/dataset-loading-review-6-2026-10-16');
async function state(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/store/reconstructionStore.ts';
    const { useReconstructionStore } = await import(path) as typeof import('../src/store/reconstructionStore');
    const store = useReconstructionStore.getState();
    return { error: store.error, names: [...(store.reconstruction?.images.values() ?? [])].map(image => image.name),
      matches: store.loadedFiles?.nativeMedia?.bindings.size };
  });
}
async function load(page: Page, names: string[], masks: number[]) {
  await page.goto('/');
  const source = await cameraFixture(page);
  const rgbs = [source.find(file => file.name === 'a.png')!.base64, await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 4;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = 'rgb(40,90,180)'; ctx.fillRect(0,0,8,4);
    return canvas.toDataURL('image/png').split(',')[1];
  })];
  const mask = Buffer.from(source.find(file => file.name === 'one.png')!.base64, 'base64');
  const images = new Map(names.map((name, index) => [7 + index, { imageId: 7 + index, cameraId: 9, name,
    qvec: [1,0,0,0] as [number,number,number,number], tvec: [index + 1,2,3] as [number,number,number], points2D: [] }]));
  const files = new Map<string, Buffer>([
    ['cameras.bin', Buffer.from(writeCamerasBinary(new Map([[9, { cameraId: 9, modelId: 1, width: 8, height: 4, params: [5,6,4,2] }]])))],
    ['images.bin', Buffer.from(writeImagesBinary(images))], ['points3D.bin', Buffer.from(writePoints3DBinary(new Map()))],
    ...rgbs.map((rgb, index): [string, Buffer] => [`rgb/${index}.png`, Buffer.from(rgb, 'base64')]),
    ...masks.map((index): [string, Buffer] => [`annotations/${index}.png`, mask]),
  ]);
  const baseUrl = 'https://package-paths.test/pinned/';
  const manifest = { version: 1, baseUrl, files: { cameras: 'cameras.bin', images: 'images.bin', points3D: 'points3D.bin' },
    images: [], masks: [], imageNameToPath: Object.fromEntries(names.map((name, index) => [name, `rgb/${index}.png`])),
    maskNameToPath: Object.fromEntries(masks.map(index => [names[index], `annotations/${index}.png`])), maskRole: 'validity' };
  await page.route('https://package-paths.test/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/pinned/', '');
    if (path === 'manifest.json') return route.fulfill({ json: manifest, headers: { 'Access-Control-Allow-Origin': '*' } });
    const bytes = files.get(path);
    return route.fulfill(bytes ? { body: bytes, headers: { 'Access-Control-Allow-Origin': '*' } } : { status: 404 });
  });
  await page.goto('/?url=' + encodeURIComponent(baseUrl + 'manifest.json'));
  await expect.poll(() => state(page)).toEqual({ error: null, names, matches: 2 });
  return { names, rgbs, masks };
}
async function choose(page: Page, format: string) {
  await page.mouse.move(2,2); await page.mouse.move(1,1);
  await page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first().hover();
  await page.locator('select').first().selectOption(format);
  return page.getByRole('button', { name: 'Download COLMAP', exact: true });
}
async function rejected(page: Page, format: string, names: string[]) {
  const downloads: string[] = [];
  const record = (download: import('@playwright/test').Download) => downloads.push(download.suggestedFilename());
  page.on('download', record);
  try {
    const button = await choose(page, format); await button.click();
    await expect(page.getByText(/Export failed: Package path conflict:/)).toBeVisible();
    await expect(button).toBeEnabled();
    expect(downloads).toEqual([]);
    expect(await state(page)).toEqual({ error: null, names, matches: 2 });
  } finally { page.off('download', record); }
}
async function exported(page: Page, format: string, stem: string, data: Awaited<ReturnType<typeof load>>, browser: string) {
  const button = await choose(page, format), pending = page.waitForEvent('download'); await button.click();
  const download = await pending, bytes = readFileSync((await download.path())!), entries = unzipSync(bytes);
  if (format === 'zip-masks' && data.masks.length > 0 && data.masks.length < data.names.length) {
    await expect(page.getByText(`Exported ${data.masks.length} of ${data.names.length} masks. COLMAP requires a mask for every image when using a mask folder. Process unmasked images separately.`, { exact: true })).toBeVisible();
  }
  expect([...parseImagesBinary(new Uint8Array(entries['sparse/0/images.bin']).buffer).values()].map(image => image.name)).toEqual(data.names);
  expect(Object.keys(entries).filter(path => path.startsWith('images/')).sort())
    .toEqual(format === 'zip' ? [] : data.names.map(name => 'images/' + name).sort());
  expect(Object.keys(entries).filter(path => path.startsWith('masks/')).sort())
    .toEqual(format === 'zip-masks' ? data.masks.map(index => 'masks/' + data.names[index] + '.png').sort() : []);
  if (format !== 'zip') data.names.forEach((name, index) => expect(Buffer.from(entries['images/' + name]).toString('base64')).toBe(data.rgbs[index]));
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, `${stem}-${browser}.zip`), bytes);
  writeFileSync(resolve(output, `${stem}-${browser}.json`), JSON.stringify({ ...data, format }));
}

test('RGB file/directory conflict reports an error and retains model-only export', async ({ page, browserName }) => {
  const data = await load(page, ['frame.png', 'frame.png/other.png'], []);
  await rejected(page, 'zip-images', data.names);
  await exported(page, 'zip', 'rgb-conflict-model-only', data, browserName);
});
test('mask-only file/directory conflict retains COLMAP plus original RGB export', async ({ page, browserName }) => {
  const data = await load(page, ['frame', 'frame.png/other.png'], [0,1]);
  await rejected(page, 'zip-masks', data.names);
  await exported(page, 'zip-images', 'mask-conflict-rgb', data, browserName);
});
for (const selected of [0,1]) test(`mask-prefix paths export when only optional mask ${selected} exists`, async ({ page, browserName }) => {
  const data = await load(page, ['frame', 'frame.png/other.png'], [selected]);
  await exported(page, 'zip-masks', `optional-mask-${selected}`, data, browserName);
});
test('neighboring image path prefixes export with all masks', async ({ page, browserName }) => {
  const data = await load(page, ['frame.png', 'frame.png-other/other.png'], [0,1]);
  await exported(page, 'zip-masks', 'neighbor-prefixes', data, browserName);
});
