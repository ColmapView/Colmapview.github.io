import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { STORAGE_KEYS } from '../../src/store/migration';
import { mkdirSync, writeFileSync } from 'node:fs';

interface RequestRecord { key: string; attempt: number; start: number; end: number | null; status: number }
let pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ state: { galleryThumbnailDisplayMode: 'maskedImage' }, version: 0 })), STORAGE_KEYS.ui);
  await page.addInitScript(() => {
    const stats = { active: 0, peak: 0, origins: {} as Record<string, number>, originPeaks: {} as Record<string, number>, requests: [] as Array<{ url: string; start: number; status?: number; headersAt?: number; end?: number }> };
    (window as any).__mediaTransfers = stats;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
      if (!url.pathname.startsWith('/media/')) return originalFetch(input, options);
      stats.active++;
      const request = { url: url.href, start: Date.now() } as (typeof stats.requests)[number];
      stats.requests.push(request);
      stats.peak = Math.max(stats.peak, stats.active);
      stats.origins[url.origin] = (stats.origins[url.origin] ?? 0) + 1;
      stats.originPeaks[url.origin] = Math.max(stats.originPeaks[url.origin] ?? 0, stats.origins[url.origin]);
      let finished = false;
      const finish = () => { if (!finished) { finished = true; request.end = Date.now(); stats.active--; stats.origins[url.origin]--; } };
      try {
        const response = await originalFetch(input, options);
        request.status = response.status;
        request.headersAt = Date.now();
        const blob = response.blob.bind(response);
        response.blob = async () => { try { return await blob(); } finally { finish(); } };
        if (response.body) {
          const cancel = response.body.cancel.bind(response.body);
          response.body.cancel = async reason => { try { return await cancel(reason); } finally { finish(); } };
        }
        return response;
      } catch (error) { finish(); throw error; }
    };
  });
  page.on('pageerror', error => pageErrors.push(error.message));
});

test.afterEach(() => expect(pageErrors).toEqual([]));

async function mediaRequests(page: Page, namespace: string): Promise<RequestRecord[]> {
  const response = await page.request.get('/__metrics');
  return (await response.json()).requests.filter((r: RequestRecord) => r.key.includes(`/media/${namespace}/`));
}

function peakConcurrency(requests: RequestRecord[]): number {
  const events = requests.flatMap(r => [{ time: r.start, delta: 1 }, { time: r.end ?? Date.now(), delta: -1 }]);
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);
  let active = 0;
  let peak = 0;
  for (const event of events) { active += event.delta; peak = Math.max(peak, active); }
  return peak;
}

test('application image and mask requests share body-lifetime limits and recover from 429', async ({ page }) => {
  const namespace = `scheduler-${Date.now()}`;
  await page.goto(`/?url=${encodeURIComponent(`http://127.0.0.1:4173/manifest.json?fixture=small&namespace=${namespace}`)}`);
  await expect(page.getByText('image-00001.png', { exact: true }).first()).toBeVisible();
  await expect.poll(async () => (await mediaRequests(page, namespace)).some(r => r.key.includes('/limited/') && r.status === 200 && r.end !== null), { timeout: 30000 }).toBe(true);
  await expect.poll(async () => (await mediaRequests(page, namespace)).filter(r => r.key.includes('/masks/') && r.end !== null).length).toBeGreaterThan(0);
  const requests = await mediaRequests(page, namespace);
  mkdirSync('.tmp/performance/media-runs', { recursive: true });
  writeFileSync(`.tmp/performance/media-runs/${namespace}.json`, JSON.stringify(requests, null, 2));
  const transfers = await page.evaluate(() => (window as any).__mediaTransfers);
  writeFileSync(`.tmp/performance/media-runs/${namespace}-client.json`, JSON.stringify(transfers, null, 2));
  expect(transfers.peak).toBeLessThanOrEqual(8);
  expect(transfers.originPeaks['http://127.0.0.1:4173']).toBe(4);
  // Server-side socket close notification can trail client cancellation by a
  // millisecond; verify successful delayed bodies separately from that tail.
  expect(peakConcurrency(requests.filter(r => r.status === 200 && !r.key.includes('/disconnect/')))).toBeLessThanOrEqual(4);
  const limited = requests.filter(r => r.key.includes('/limited/'));
  expect(limited.slice(0, 3).map(r => r.status)).toEqual([429, 429, 200]);
  // Initial virtualizer settlement can cancel a request before fetch exposes its
  // headers. Only a 429 actually delivered to the application establishes cooldown.
  const clientLimited = transfers.requests.filter((r: { url: string }) => r.url.includes('/limited/'));
  expect(clientLimited.some((r: { status?: number }) => r.status === 429)).toBe(true);
  for (let index = 0; index < clientLimited.length - 1; index++) {
    if (clientLimited[index].status === 429) {
      expect(clientLimited[index + 1].start - clientLimited[index].headersAt).toBeGreaterThanOrEqual(900);
    }
  }
});

test('same-page dataset replacement aborts obsolete response bodies', async ({ page }) => {
  const namespace = `slow-replace-${Date.now()}`;
  await page.goto(`/?url=${encodeURIComponent(`http://127.0.0.1:4173/manifest.json?fixture=small&namespace=${namespace}`)}`);
  await expect(page.getByText('image-00001.png', { exact: true }).first()).toBeVisible();
  await expect.poll(async () => (await mediaRequests(page, namespace)).filter(r => r.status === 200 && r.end === null).length).toBeGreaterThan(0);
  const started = Date.now();
  // A local-file drop replaces the dataset without navigating or recreating the page.
  await page.evaluate(async () => {
    const files = await Promise.all(['cameras.bin', 'images.bin', 'points3D.bin'].map(async name => new File([await (await fetch(`/fixtures/small/${name}`)).arrayBuffer()], name)));
    const transfer = new DataTransfer();
    files.forEach(file => transfer.items.add(file));
    const event = new DragEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files: transfer.files, items: files.map(file => ({ kind: 'file', getAsFile: () => file, webkitGetAsEntry: () => ({ isFile: true, isDirectory: false, name: file.name, file: (callback: (value: File) => void) => callback(file) }) })) } });
    document.querySelector('[data-testid="drop-zone"]')!.dispatchEvent(event);
  });
  await expect.poll(async () => (await mediaRequests(page, namespace)).filter(r => r.end === null).length, { timeout: 5000 }).toBe(0);
  const requests = await mediaRequests(page, namespace);
  expect(requests.some(r => r.status === 200 && r.end !== null && r.end - r.start < 9000)).toBe(true);
  expect(Date.now() - started).toBeLessThan(9000);
  await expect(page.getByText('image-00001.png', { exact: true }).first()).toBeVisible();
});
