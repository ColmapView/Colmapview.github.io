import { readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { test, expect } from './fixtures/test-fixtures';
import { dropDatasetFiles } from './fixtures/load-test-data';
import { cameraFixture, fixtureZip, type CameraFixtureSchema } from './fixtures/camera-dataset';
import { parseImagesBinary } from '../src/parsers/images';

const schemas = ['gaussian-splatting', 'llff', 'dtu'] as const;
async function loadedSchema(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const path = '/src/store/reconstructionStore.ts';
    const { useReconstructionStore } = await import(path) as typeof import('../src/store/reconstructionStore');
    return useReconstructionStore.getState().loadedFiles?.cameraImport?.selection.schema;
  });
}
for (const schema of schemas) {
  test(`${schema} archive exports original RGB and masks and reimports as native COLMAP`, async ({ page }) => {
    await page.goto('/');
    const files = await cameraFixture(page, schema), archive = fixtureZip(files);
    await dropDatasetFiles(page, [{ relativePath: 'scene.zip', name: 'scene.zip', base64: archive.toString('base64') }]);
    await expect.poll(() => loadedSchema(page)).toBe(schema);
    const button = page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
    await button.hover(); await page.locator('select').first().selectOption('zip-masks');
    const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download COLMAP', exact: true }).click();
    const download = await downloading, output = readFileSync((await download.path())!), entries = unzipSync(output);
    const images = [...parseImagesBinary(new Uint8Array(entries['sparse/0/images.bin']).buffer).values()];
    expect(images.map(image => image.name)).toEqual(schema === 'dtu' ? ['image/a.png', 'image/b.png'] : ['a.png', 'b.png']);
    for (const image of images) {
      const source = files.find(file => file.relativePath === `scene/${schema === 'dtu' ? image.name : 'images/' + image.name}`)!;
      expect(Buffer.from(entries['images/' + image.name])).toEqual(Buffer.from(source.base64, 'base64'));
      expect(entries[`masks/${image.name}.png`]).toBeDefined();
    }
    await dropDatasetFiles(page, [{ relativePath: 'export.zip', name: 'export.zip', base64: output.toString('base64') }]);
    await expect.poll(() => loadedSchema(page)).toBeUndefined();
    const originals = await page.evaluate(async names => {
      const path = '/src/dataset/index.ts'; const { getDatasetManager } = await import(path) as typeof import('../src/dataset');
      return Promise.all(names.map(async name => {
        const original = await getDatasetManager().getOriginalImage(name);
        return original ? btoa(String.fromCharCode(...new Uint8Array(await original.arrayBuffer()))) : null;
      }));
    }, images.map(image => image.name));
    expect(originals).toEqual(images.map(image => files.find(file => file.relativePath === `scene/${schema === 'dtu' ? image.name : 'images/' + image.name}`)!.base64));
  });
  test(`${schema} metadata URL loads pinned photos with a declared array order where required`, async ({ page }) => {
    await page.goto('/'); const files = await cameraFixture(page, schema);
    const metadata = schema === 'gaussian-splatting' ? 'cameras.json' : schema === 'llff' ? 'poses_bounds.npy' : 'cameras.npz';
    const directory = schema === 'dtu' ? 'image' : 'images';
    const base = 'https://layouts.example.test/pinned/revision/';
    await page.route(base + '**', route => {
      const path = new URL(route.request().url()).pathname.replace('/pinned/revision/', '');
      if (path === 'list.txt') return route.fulfill({ status: 200, body: `${directory}/a.png\n${directory}/b.png\n`, headers: { 'Access-Control-Allow-Origin': '*' } });
      const file = files.find(file => file.relativePath === 'scene/' + path);
      return route.fulfill(file ? { status: 200, body: Buffer.from(file.base64, 'base64'), headers: { 'Access-Control-Allow-Origin': '*' } } : { status: 404 });
    });
    await page.goto('/?url=' + encodeURIComponent(base + metadata + '?download=1'));
    await expect.poll(() => loadedSchema(page)).toBe(schema);
    expect(await page.evaluate(async name => {
      const path = '/src/dataset/index.ts'; const { getDatasetManager } = await import(path) as typeof import('../src/dataset');
      return (await getDatasetManager().getOriginalImage(name))?.size;
    }, schema === 'dtu' ? 'image/a.png' : 'a.png')).toBeGreaterThan(0);
  });
}

test('an incomplete implicit LLFF order cannot replace the current scene', async ({ page }) => {
  await page.goto('/'); await dropDatasetFiles(page, await cameraFixture(page));
  await expect.poll(() => loadedSchema(page)).toBe('nerfstudio');
  const files = await cameraFixture(page, 'llff');
  await dropDatasetFiles(page, files.filter(file => file.relativePath !== 'scene/images/a.png'));
  await expect.poll(async () => page.evaluate(async () => {
    const path = '/src/store/reconstructionStore.ts'; const { useReconstructionStore } = await import(path) as typeof import('../src/store/reconstructionStore');
    return useReconstructionStore.getState().error;
  })).toMatch(/ordered image paths/);
  expect(await loadedSchema(page)).toBe('nerfstudio');
});

const publicFixtures = process.env.COLMAP_CAMERA_LAYOUT_FIXTURES;
for (const schema of schemas) {
  test(`qualifies original public ${schema} metadata and sample photos`, async ({ page }, testInfo) => {
    test.skip(!publicFixtures, 'Set COLMAP_CAMERA_LAYOUT_FIXTURES to the ignored public fixture folder.');
    test.setTimeout(120000);
    await page.goto('/'); const bytes = readFileSync(join(publicFixtures!, schema + '.zip'));
    await dropDatasetFiles(page, [{ relativePath: schema + '.zip', name: schema + '.zip', base64: bytes.toString('base64') }]);
    await expect.poll(() => loadedSchema(page), { timeout: 60000 }).toBe(schema as CameraFixtureSchema);
    // Real asset reads can outlast the viewer's idle chrome timer.
    await page.mouse.move(2, 2);
    await page.mouse.move(1, 1);
    const button = page.locator('button[aria-label*="Export" i], button[data-tooltip*="Export" i]').first();
    await button.hover(); await page.locator('select').first().selectOption(schema === 'dtu' ? 'zip-masks' : 'zip-images');
    const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download COLMAP', exact: true }).click();
    const download = await downloading, output = join(publicFixtures!, 'browser-' + testInfo.project.name + '-' + schema + '.zip');
    mkdirSync(publicFixtures!, { recursive: true }); copyFileSync((await download.path())!, output);
    const entries = unzipSync(readFileSync(output));
    expect([...parseImagesBinary(new Uint8Array(entries['sparse/0/images.bin']).buffer).values()]).toHaveLength(2);
  });
}
