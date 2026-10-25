import { test, expect } from './fixtures/test-fixtures';
import { readFileSync } from 'node:fs';
import { encodeShareData } from '../src/utils/shareDataCodec';
import { encodeCameraState } from '../src/utils/urlCameraStateCodec';
import type { Page } from '@playwright/test';

const shortPath = '/s/d/AAAAAAAAAAAAAAAA';
const source = 'https://example.com/scene.manifest.json';
const viewerUrl = `https://colmapview.opsiclear.com/?url=${encodeURIComponent(source)}`;

async function installShortViewer(page: Page, baseURL: string | undefined, launchUrl = viewerUrl) {
  await page.route(`${baseURL}${shortPath}**`, async route => {
    const root = await route.fetch({ url: `${baseURL}/` });
    const body = (await root.text()).replace('</head>', `<script id="colmapview-hub-launch" type="application/json">${JSON.stringify({ version: 1, viewerUrl: launchUrl })}</script></head>`);
    await route.fulfill({ response: root, body });
  });
  await page.route('https://example.com/**', route => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (name === 'scene.manifest.json') return route.fulfill({ json: {
      version: 1, baseUrl: 'https://example.com/',
      files: { cameras: 'cameras.txt', images: 'images.txt', points3D: 'points3D.txt' },
    } });
    if (['cameras.txt', 'images.txt', 'points3D.txt'].includes(name)) {
      return route.fulfill({ body: readFileSync(`e2e/fixtures/test-data/sparse/${name}`), contentType: 'text/plain' });
    }
    return route.abort();
  });
}

test.beforeEach(async ({ page, baseURL }) => { await installShortViewer(page, baseURL); });

async function sceneCount(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/src/store/reconstructionStore.ts';
    const { useReconstructionStore } = await import(modulePath) as typeof import('../src/store/reconstructionStore');
    return useReconstructionStore.getState().reconstruction?.images.size ?? 0;
  });
}

test('loads and reloads the native viewer at the short address', async ({ page }) => {
  await page.goto(shortPath);
  await expect(page.locator('meta[name="colmapview-hub-launch"]')).toHaveAttribute('content', '1');
  await expect.poll(() => sceneCount(page)).toBeGreaterThan(0);
  expect(new URL(page.url()).pathname).toBe(shortPath);
  expect(new URL(page.url()).search).toBe('');
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.reload();
  await expect.poll(() => sceneCount(page)).toBeGreaterThan(0);
  expect(new URL(page.url()).pathname).toBe(shortPath);
});

test('restores the saved camera and a newer visitor view through short-address reloads', async ({ page, baseURL }) => {
  const state = (offset: number) => ({ position: [10 + offset, 20, 40] as [number, number, number],
    target: [10 + offset, 20, 30] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], distance: 10 });
  await installShortViewer(page, baseURL, `${viewerUrl}#${encodeCameraState(state(0))}`);
  const target = () => page.evaluate(async () => {
    const path = '/src/store/stores/cameraStore.ts';
    const { useCameraStore } = await import(path) as typeof import('../src/store/stores/cameraStore');
    return useCameraStore.getState().currentViewState?.target.map(Math.round);
  });
  await page.goto(shortPath);
  await expect.poll(target, { timeout: 15000 }).toEqual([10, 20, 30]);
  await page.reload();
  await expect.poll(target, { timeout: 15000 }).toEqual([10, 20, 30]);
  await page.goto(`${shortPath}#${encodeCameraState(state(30))}`);
  await page.reload();
  await expect.poll(target, { timeout: 15000 }).toEqual([40, 20, 30]);
  expect(new URL(page.url()).pathname).toBe(shortPath);
  expect(new URL(page.url()).search).toBe('');
});

test('pins the short dataset while restoring fragment settings and clears to the landing page', async ({ page }) => {
  const hash = encodeShareData('https://attacker.example/wrong.json', null,
    { ui: { backgroundColor: '#123456' }, camera: { selectedImageId: 2 } });
  const hostile: string[] = [];
  await page.route('https://attacker.example/**', route => { hostile.push(route.request().url()); return route.abort(); });
  await page.goto(`${shortPath}?url=https://attacker.example/query.json#${hash}`);
  await expect.poll(() => sceneCount(page)).toBeGreaterThan(0);
  expect(hostile).toEqual([]);
  const color = await page.evaluate(async () => {
    const path = '/src/store/stores/uiStore.ts';
    return (await import(path) as typeof import('../src/store/stores/uiStore')).useUIStore.getState().backgroundColor;
  });
  expect(color).toBe('#123456');
  await expect.poll(() => page.evaluate(async () => {
    const path = '/src/store/stores/cameraStore.ts';
    return (await import(path) as typeof import('../src/store/stores/cameraStore')).useCameraStore.getState().selectedImageId;
  })).toBe(2);
  await page.evaluate(async () => {
    const path = '/src/store/reconstructionStore.ts';
    const { useReconstructionStore } = await import(path) as typeof import('../src/store/reconstructionStore');
    useReconstructionStore.getState().clear();
  });
  expect(new URL(page.url()).pathname).toBe('/');
  expect(new URL(page.url()).search).toBe('');
});
