import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { test, expect } from './fixtures/test-fixtures';
import { loadTestDataset } from './fixtures/load-test-data';

const yaml = 'ui:\n  background_color: "#123456"\ncamera:\n  scale: 0.4\n';
const files = Object.fromEntries(['cameras', 'images', 'points3D'].map(name => [
  `sparse/0/${name}.txt`, readFileSync(new URL(`./fixtures/test-data/sparse/${name}.txt`, import.meta.url)),
]));
const archive = Buffer.from(zipSync(Object.fromEntries(Object.entries({ ...files, 'colmapview.yaml': strToU8(yaml) })
  .map(([path, contents]) => ['project/' + path, contents]))));

for (const source of ['local folder', 'local archive', 'remote manifest', 'remote archive'] as const) {
  test(`restores colmapview.yaml from a ${source}`, async ({ page }) => {
    const errors: string[] = [];
    let sidecarRequests = 0;
    page.on('pageerror', error => errors.push(error.message));
    if (source.startsWith('remote')) {
      const baseUrl = 'https://datasets.example.test/project/';
      const manifest = { version: 1, baseUrl, files: { cameras: 'sparse/0/cameras.txt',
        images: 'sparse/0/images.txt', points3D: 'sparse/0/points3D.txt' }, splats: [], skipImages: true };
      await page.route(baseUrl + '**', route => {
        const path = new URL(route.request().url()).pathname.replace('/project/', '');
        if (path === 'colmapview.yaml') sidecarRequests++;
        const body = path === 'manifest.json' ? JSON.stringify(manifest) : path === 'colmapview.yaml' ? yaml
          : path === 'scene.zip' ? archive : files[path];
        return route.fulfill({ status: body === undefined ? 404 : 200, body: body ?? '',
          headers: { 'access-control-allow-origin': '*', 'content-length': String(body === undefined ? 0 : Buffer.byteLength(body)) } });
      });
      await page.goto('/?url=' + encodeURIComponent(baseUrl + (source === 'remote archive' ? 'scene.zip' : 'manifest.json')));
    } else {
      await page.goto('/');
      if (source === 'local folder') {
        await loadTestDataset(page, [{ name: 'colmapview.yaml', relativePath: 'colmapview.yaml', base64: Buffer.from(yaml).toString('base64') }]);
      } else {
        await page.evaluate(base64 => {
          const transfer = new DataTransfer();
          transfer.items.add(new File([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], 'project.zip', { type: 'application/zip' }));
          document.querySelector('[data-testid="drop-zone"]')!.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
        }, archive.toString('base64'));
      }
    }
    await expect(page.getByText('Source:', { exact: false }).first()).toBeVisible({ timeout: 45000 });
    await expect(page.getByTestId('scene-3d')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
    expect(errors).toEqual([]);
    expect(sidecarRequests).toBe(source === 'remote manifest' ? 1 : 0);
  });
}
