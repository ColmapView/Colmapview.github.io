import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { test, expect } from './fixtures/test-fixtures';
import { loadTestDataset } from './fixtures/load-test-data';

const yaml = 'ui:\n  background_color: "#123456"\ncamera:\n  scale: 0.4\npoint_cloud:\n  min_track_length: 0\n';
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
    await expect.poll(() => page.evaluate(() =>
      JSON.parse(localStorage.getItem('colmap-viewer-pointcloud') || '{}').state?.minTrackLength
    )).toBe(0);
    expect(errors).toEqual([]);
    expect(sidecarRequests).toBe(source === 'remote manifest' ? 1 : 0);
  });
}

const framePly = 'ply\nformat ascii 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n1 2 3 10 20 30\n-1 -2 -3 200 210 220\n';
// A streaming Zstandard block containing a directory and this complete PLY;
// the frame and TAR deliberately have no end marker, like a large source prefix.
const framePrefix = Buffer.from('KLUv/QBYFAYAEsshHYC1zQFowjapbev3Mba0vzMD04OBm0jJB46TVuo76Jk+pv90KpyFsUBPfvro5DSi1WPpIeBQFGnDBBTVHTh0vetgaApewm4tDPFzq23ZhtIJdasEdoomyhTdQCMQBmbZrWQXBD3W7qMKiKieHmvG+c8uxzSH4KMIqfCf/0oB/P8ZMJqsRQZGFgBWQAECKUQKcSK1OQJW+8B2AGFGE9lgQI1AdoDbB4gUCAEDRAHmgDoApIMVPx/ACgCOlcvcBJA=', 'base64');
const sha256 = (body: Buffer | string) => createHash('sha256').update(body).digest('hex');

for (const format of ['zip', 'tar.zst'] as const) {
  test(`version 3 reads a required ${format} frame in a real worker without inventing photos`, async ({ page }) => {
    const baseUrl = 'https://datasets.example.test/frame/', photoRequests: string[] = [], ranges: string[] = [];
    const zipped = Buffer.from(zipSync({ 'frames/frame.ply': strToU8(framePly) }));
    const totalBytes = format === 'zip' ? zipped.length : 1_000_000;
    const geometry = { url: baseUrl + 'sequence.' + format, bytes: totalBytes, format, role: 'points3D',
      member: { path: 'frames/frame.ply', bytes: Buffer.byteLength(framePly), sha256: sha256(framePly) },
      ...(format === 'tar.zst' ? { prefix: { bytes: framePrefix.length, sha256: sha256(framePrefix) } } : {}) };
    await page.route(baseUrl + '**', route => {
      const path = new URL(route.request().url()).pathname.replace('/frame/', '');
      if (/\.(png|jpg)$/.test(path)) photoRequests.push(path);
      if (path === 'manifest.json') return route.fulfill({ json: { version: 3, baseUrl,
        files: { cameras: 'sparse/0/cameras.txt', images: 'sparse/0/images.txt' }, geometryFiles: [geometry], skipImages: true, splats: [] } });
      if (path === 'sequence.' + format) {
        const range = route.request().headers()['range'];
        ranges.push(range);
        const match = /^bytes=(\d+)-(\d+)$/.exec(range)!;
        const start = Number(match[1]), end = Number(match[2]);
        const body = format === 'zip' ? zipped.subarray(start, end + 1) : Buffer.alloc(end - start + 1);
        if (format === 'tar.zst' && start === 0) framePrefix.copy(body);
        return route.fulfill({ status: 206, body, headers: { 'content-range': `bytes ${start}-${end}/${totalBytes}`, ETag: '"pinned"',
          'access-control-allow-origin': '*', 'access-control-expose-headers': 'Content-Range, ETag' } });
      }
      return route.fulfill({ status: files[path] ? 200 : 404, body: files[path] ?? '' });
    });
    await page.goto('/?url=' + encodeURIComponent(baseUrl + 'manifest.json'));
    await expect.poll(() => page.evaluate(async () => {
      const source = '/src/store/reconstructionStore.ts';
      const { useReconstructionStore } = await import(source) as typeof import('../src/store/reconstructionStore');
      const state = useReconstructionStore.getState();
      return { points: state.wasmReconstruction?.pointCount ?? state.reconstruction?.points3D?.size,
        error: state.error, imageBase: state.imageUrlBase };
    })).toEqual({ points: 2, error: null, imageBase: null });
    expect(photoRequests).toEqual([]);
    expect(ranges.length).toBeGreaterThan(0);
    if (format === 'tar.zst') expect(ranges).toEqual(['bytes=0-65535']);
    expect(await page.evaluate(async () => {
      const source = '/src/dataset/index.ts';
      const { getDatasetManager } = await import(source) as typeof import('../src/dataset');
      return getDatasetManager().hasImages();
    })).toBe(false);
    await expect(page.getByText(/files could not be loaded/)).toHaveCount(0);
  });
}
