import { test, expect } from './fixtures/test-fixtures';
import type { Page } from '@playwright/test';
import { readFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { dropDatasetFiles, type TestDatasetFileEntry } from './fixtures/load-test-data';
import { cameraFixture, fixtureZip, fixtureTar } from './fixtures/camera-dataset';
import { writeCamerasBinary, writeImagesBinary, writePoints3DBinary } from '../src/parsers/colmapBinaryWriters';
import { parseImagesBinary } from '../src/parsers/images';

const layouts = [
  { label: 'root bins and adjacent photos', model: 'scene', rgb: 'scene', mask: 'scene/masks' },
  { label: 'sparse component and sibling images', model: 'scene/sparse/0', rgb: 'scene/images', mask: 'scene/masks' },
  { label: 'nested colmap sparse component', model: 'scene/colmap/sparse/0', rgb: 'scene/images', mask: 'scene/masks' },
  { label: 'colmap component with corrected images', model: 'scene/colmap/0', rgb: 'scene/corrected/images', mask: 'scene/corrected/masks' },
  { label: 'photos inside the model directory', model: 'scene/reference', rgb: 'scene/reference/images', mask: 'scene/reference/masks' },
  { label: 'custom calibration and shared DSLR images', model: 'scene/dslr_calibration_undistorted', rgb: 'scene/images/dslr', mask: 'scene/masks/dslr' },
  { label: 'resized image directory and singular mask', model: 'scene/sparse', rgb: 'scene/images_4', mask: 'scene/mask', suffix: false },
  { label: 'RGB frames and foreground masks', model: 'scene/model', rgb: 'scene/rgb', mask: 'scene/fg_masks', suffix: false },
  { label: 'renamed photos with an explicit CSV', model: 'scene/colmap', rgb: 'scene/raw/camera one', mask: 'scene/masks', mapping: true },
];
const binary = (relativePath: string, bytes: ArrayBuffer | Uint8Array): TestDatasetFileEntry => ({
  relativePath, name: relativePath.split('/').pop()!, base64: Buffer.from(bytes instanceof ArrayBuffer ? bytes : bytes.buffer as ArrayBuffer).toString('base64'),
});

async function fixture(page: Page, layout: typeof layouts[number]) {
  const photos = await cameraFixture(page);
  const blue = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 4;
    const context = canvas.getContext('2d')!; context.fillStyle = 'blue'; context.fillRect(0, 0, 8, 4);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const names = ['cam_1/a.png', 'cam_2/a.png'];
  const images = new Map(names.map((name, i) => [i + 1, { imageId: i + 1, cameraId: 1, name,
    qvec: [1, 0, 0, 0] as [number, number, number, number], tvec: [i + 1, 2, 3] as [number, number, number], points2D: [] }]));
  const files = [binary(layout.model + '/cameras.bin', writeCamerasBinary(new Map([[1, { cameraId: 1, modelId: 1, width: 8, height: 4, params: [5, 6, 4, 2] }]]))),
    binary(layout.model + '/images.bin', writeImagesBinary(images)), binary(layout.model + '/points3D.bin', writePoints3DBinary(new Map()))];
  const rgb = [photos.find(file => file.name === 'a.png')!.base64, blue];
  const mask = photos.find(file => file.name === 'one.png')!.base64;
  const paths = names.map((name, i) => layout.rgb + '/' + (layout.mapping ? `original_${i}.png` : name));
  names.forEach((name, i) => {
    files.push({ relativePath: paths[i], name: paths[i].split('/').pop()!, base64: rgb[i] });
    files.push({ relativePath: layout.mask + '/' + name + (layout.suffix === false ? '' : '.png'), name: 'mask.png', base64: mask });
  });
  if (layout.mapping) files.push({ relativePath: layout.model + '/image_mapping.csv', name: 'image_mapping.csv',
    base64: Buffer.from('colmap_image,raw_path\n' + names.map((name, i) => `${name},${paths[i]}`).join('\n')).toString('base64') });
  // A larger, independently complete scene must never supply this model's photos or masks.
  const foreign = 'z_unrelated' + layout.model.slice('scene'.length);
  for (const entry of files.slice(0, 3)) files.push({ ...entry, relativePath: foreign + '/' + entry.name });
  for (let i = 0; i < 12; i++) files.push({ relativePath: `z_unrelated/images/cam_${i}/a.png`, name: 'a.png', base64: blue });
  return { files, names, rgb, mask };
}
async function loaded(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/store/reconstructionStore.ts';
    const { useReconstructionStore } = await import(path) as typeof import('../src/store/reconstructionStore');
    const state = useReconstructionStore.getState();
    return { native: state.loadedFiles?.nativeMedia?.selection.schema, count: state.reconstruction?.images.size, error: state.error };
  });
}
for (const layout of layouts) for (const source of ['folder', 'zip', 'hf-url'] as const) {
  test(`${source}: ${layout.label} binds exact RGB and masks and exports original photos`, async ({ page }) => {
    await page.goto('/'); const data = await fixture(page, layout);
    if (source === 'hf-url') {
      const base = 'https://huggingface.co/datasets/colmapview-audit/layouts/resolve/main/';
      await page.route('https://huggingface.co/**', route => {
        const url = new URL(route.request().url());
        if (url.pathname.includes('/api/datasets/') && url.pathname.includes('/tree/')) return route.fulfill({ status: 200,
          json: data.files.map(file => ({ type: 'file', path: file.relativePath, size: Buffer.from(file.base64, 'base64').length })) });
        if (url.pathname.startsWith('/api/datasets/')) return route.fulfill({ status: 200, json: { private: false, gated: false } });
        const path = decodeURIComponent(url.href.split('/resolve/main/')[1]?.split('?')[0] ?? '');
        const file = data.files.find(file => file.relativePath === path);
        return route.fulfill(file ? { status: 200, body: Buffer.from(file.base64, 'base64'), headers: { 'Access-Control-Allow-Origin': '*' } } : { status: 404 });
      });
      await page.goto('/?url=' + encodeURIComponent(base));
    } else await dropDatasetFiles(page, source === 'folder' ? data.files : [{ relativePath: 'layouts.zip', name: 'layouts.zip', base64: fixtureZip(data.files).toString('base64') }]);
    await expect.poll(() => loaded(page)).toEqual({ native: 'colmap', count: 2, error: null });
    const media = await page.evaluate(async names => {
      const path = '/src/dataset/index.ts'; const { getDatasetManager } = await import(path) as typeof import('../src/dataset');
      const encode = async (file: File | null) => file ? btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer()))) : null;
      return Promise.all(names.map(async name => ({ rgb: await encode(await getDatasetManager().getOriginalImage(name)), mask: await encode(await getDatasetManager().getMask(name)) })));
    }, data.names);
    expect(media).toEqual(data.rgb.map(rgb => ({ rgb, mask: data.mask })));
    await page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first().hover();
    await page.locator('select').first().selectOption(layout.suffix === false ? 'zip-images' : 'zip-masks');
    const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download COLMAP', exact: true }).click();
    const download = await downloading, bytes = readFileSync((await download.path())!), entries = unzipSync(bytes);
    const exported = [...parseImagesBinary(new Uint8Array(entries['sparse/0/images.bin']).buffer).values()];
    expect(exported.map(image => image.name)).toEqual(data.names);
    expect(exported.map(image => image.tvec)).toEqual([[1, 2, 3], [2, 2, 3]]);
    data.names.forEach((name, i) => {
      expect(Buffer.from(entries['images/' + name]).toString('base64')).toBe(data.rgb[i]);
      if (layout.suffix !== false) expect(entries['masks/' + name + '.png']).toBeDefined();
    });
  });
}

test('native text model and shared camera tree load from a TAR archive', async ({ page }) => {
  await page.goto('/'); const data = await fixture(page, layouts[1]);
  const files = data.files.filter(file => !/\.(bin|txt)$/.test(file.relativePath));
  for (const [name, text] of [['cameras.txt', '1 PINHOLE 8 4 5 6 4 2\n'],
    ['images.txt', '1 1 0 0 0 1 2 3 1 cam_1/a.png\n\n2 1 0 0 0 2 2 3 1 cam_2/a.png\n\n'], ['points3D.txt', '# Empty model\n']]) {
    files.push({ relativePath: 'scene/colmap/0/' + name, name, base64: Buffer.from(text).toString('base64') });
  }
  await dropDatasetFiles(page, [{ relativePath: 'scene.tar', name: 'scene.tar', base64: fixtureTar(files).toString('base64') }]);
  await expect.poll(() => loaded(page)).toEqual({ native: 'colmap', count: 2, error: null });
  expect(await page.evaluate(async () => {
    const path = '/src/dataset/index.ts'; const { getDatasetManager } = await import(path) as typeof import('../src/dataset');
    return Boolean(await getDatasetManager().getOriginalImage('cam_2/a.png'));
  })).toBe(true);
});

test('ambiguous native photo paths remain missing in the browser', async ({ page }) => {
  await page.goto('/'); const data = await fixture(page, layouts[1]);
  const files = data.files.filter(file => !file.relativePath.startsWith('scene/images/'));
  for (const root of ['scene/left', 'scene/right']) for (const name of data.names) files.push({ relativePath: root + '/' + name, name: 'a.png', base64: data.rgb[0] });
  await dropDatasetFiles(page, files);
  await page.getByRole('button', { name: 'Load cameras without photos', exact: true }).click();
  await expect.poll(() => loaded(page)).toEqual({ native: 'colmap', count: 2, error: null });
  expect(await page.evaluate(async () => {
    const path = '/src/dataset/index.ts'; const { getDatasetManager } = await import(path) as typeof import('../src/dataset');
    return await getDatasetManager().getOriginalImage('cam_1/a.png');
  })).toBeNull();
});

const originalFixtures = process.env.COLMAP_NATIVE_LAYOUT_FIXTURES;
for (const label of ['glomap-example', 'plant-dense', 'bmvs-native', 'bmvs-text']) {
  test(`original public ${label} model loads all registered RGB and exports unchanged calibration`, async ({ page }, testInfo) => {
    test.skip(!originalFixtures, 'Set COLMAP_NATIVE_LAYOUT_FIXTURES to the ignored original fixture folder.');
    const examples = JSON.parse(readFileSync(join(originalFixtures!, 'original-example-sources.json'), 'utf8')) as {
      label: string; files: { path: string; sha256: string }[]; photos: { name: string; path: string }[]; masks: { name: string; path: string }[];
    }[];
    const example = examples.find(item => item.label === label)!;
    await page.goto('/');
    await dropDatasetFiles(page, [{ relativePath: label + '.zip', name: label + '.zip', base64: readFileSync(join(originalFixtures!, label + '.zip')).toString('base64') }]);
    await expect.poll(() => loaded(page)).toEqual({ native: 'colmap', count: example.photos.length, error: null });
    const hashes = await page.evaluate(async names => {
      const path = '/src/dataset/index.ts'; const { getDatasetManager } = await import(path) as typeof import('../src/dataset');
      const hash = async (file: File | null) => file ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))).map(n => n.toString(16).padStart(2, '0')).join('') : null;
      return Promise.all(names.map(async name => ({ rgb: await hash(await getDatasetManager().getOriginalImage(name)), mask: await hash(await getDatasetManager().getMask(name)) })));
    }, example.photos.map(photo => photo.name));
    expect(hashes).toEqual(example.photos.map(photo => ({ rgb: example.files.find(file => file.path === photo.path)!.sha256,
      mask: example.files.find(file => file.path === example.masks.find(mask => mask.name === photo.name)?.path)?.sha256 ?? null })));
    await page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first().hover();
    await page.locator('select').first().selectOption('zip-images');
    const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download COLMAP', exact: true }).click();
    const download = await downloading;
    copyFileSync((await download.path())!, join(originalFixtures!, `browser-${testInfo.project.name}-${label}.zip`));
    const entries = unzipSync(readFileSync((await download.path())!));
    expect([...parseImagesBinary(new Uint8Array(entries['sparse/0/images.bin']).buffer).values()].map(image => image.name).sort()).toEqual(example.photos.map(photo => photo.name).sort());
  });
}

test('original public native COLMAP loads directly from its pinned HF repository', async ({ page }) => {
  test.skip(!originalFixtures, 'Enable live public-source verification with COLMAP_NATIVE_LAYOUT_FIXTURES.');
  const examples = JSON.parse(readFileSync(join(originalFixtures!, 'original-example-sources.json'), 'utf8')) as { label: string; dataset: string; revision: string }[];
  const example = examples.find(item => item.label === 'glomap-example')!;
  await page.goto('/?url=' + encodeURIComponent(`https://huggingface.co/datasets/${example.dataset}/resolve/${example.revision}/`));
  await expect.poll(() => loaded(page), { timeout: 60000 }).toEqual({ native: 'colmap', count: 2, error: null });
  expect(await page.evaluate(async () => {
    const path = '/src/dataset/index.ts'; const { getDatasetManager } = await import(path) as typeof import('../src/dataset');
    return (await getDatasetManager().getOriginalImage('frame_00006.png'))?.size ?? 0;
  })).toBeGreaterThan(0);
});
