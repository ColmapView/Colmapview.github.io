import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus, platform, release } from 'node:os';
import { STORAGE_KEYS } from '../../src/store/migration';
import { generateMemoryFixture } from '../../scripts/performance/memory-fixture';
import { sampleMemoryProcesses } from '../../scripts/performance/memory-processes';

const labels = ['Decoded Bitmaps', 'Frustum Textures', 'URL Images', 'URL Masks'];

async function cacheRows(page: Page) {
  await page.mouse.move(1, 1);
  const source = page.getByText('Source:', { exact: true });
  if (!await source.isVisible()) await page.keyboard.press('Tab');
  await source.hover();
  await expect(page.getByRole('columnheader', { name: 'Resource', exact: true })).toBeVisible();
  const result: Record<string, { count: number; formattedBytes: string } | null> = {};
  for (const label of labels) {
    const row = page.getByRole('row').filter({ has: page.getByText(label, { exact: true }) });
    if (await row.count()) {
      const cells = await row.getByRole('cell').allTextContents();
      result[label] = { count: Number(cells[1].replaceAll(',', '')), formattedBytes: cells[2] };
    } else result[label] = null;
  }
  await page.mouse.move(1, 1);
  return result;
}

async function setPlaneMode(page: Page, enabled: boolean) {
  const desired = enabled ? 'Image plane mode (F)' : 'Cameras hidden (F)';
  await page.keyboard.press('Escape');
  for (let attempt = 0; attempt < 4; attempt++) {
    if (await page.getByRole('button', { name: desired, exact: true }).count()) return;
    const control = page.getByRole('button', { name: /^(Frustum mode|Arrow mode|Image plane mode|Cameras hidden) \(F\)$/ });
    if (!await control.isVisible()) await page.keyboard.press('Tab');
    await control.click();
  }
  await expect(page.getByRole('button', { name: desired, exact: true })).toBeAttached();
}

async function settleResources(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const probe = (window as any).__memoryRetention;
    return probe.bitmaps.pending === 0 && probe.transfers.active === 0 ? performance.now() - probe.lastActivity : 0;
  }), { intervals: [250, 500], timeout: 120000 }).toBeGreaterThan(2000);
}

test('three equivalent image-plane revisit cycles exceed decoded retention budget and release on replacement', async ({ page, browser }) => {
  test.skip(process.env.PERF_MEMORY_RETENTION !== '1', 'Opt-in memory stress: 1100 distinct 128px images and three revisit cycles');
  test.setTimeout(600000);
  const fixture = generateMemoryFixture(Number(process.env.PERF_MEMORY_IMAGES || 1100));
  const output = resolve('.tmp/performance/memory-runs', process.env.PERF_RUN || `retention-${Date.now()}`);
  mkdirSync(output, { recursive: true });
  const hash = createHash('sha256');
  for (const name of readdirSync('dist', { recursive: true }).map(String).sort()) {
    if (/\.(js|html|css|wasm)$/.test(name)) hash.update(name).update(readFileSync(resolve('dist', name)));
  }
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ state: {
    cameraDisplayMode: 'frustum', showCameras: true, selectionColorMode: 'static', autoRotateMode: 'off',
  }, version: 3 })), STORAGE_KEYS.camera);
  await page.addInitScript(() => {
    const probe = { lastActivity: performance.now(),
      thumbnail: { loadStartedAt: null as number | null, firstReadyAt: null as number | null, elapsedMs: null as number | null,
        naturalWidth: null as number | null, naturalHeight: null as number | null, alt: null as string | null },
      bitmaps: { created: 0, closed: 0, duplicateCloseCalls: 0, pending: 0, live: 0, liveRgbaBytes: 0, peakRgbaBytes: 0, createdRgbaBytes: 0, closedRgbaBytes: 0, decodedNames: {} as Record<string, number> },
      textures: { created: 0, deleted: 0, liveHandles: 0, peakHandles: 0, uploads: 0, contextLosses: 0 },
      transfers: { active: 0, completed: 0, bytes: 0, uniqueUrls: {} as Record<string, number> } };
    (window as any).__memoryRetention = probe;
    document.addEventListener('load', event => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.closest('[data-testid="image-gallery"]')
        || image.naturalWidth === 0 || probe.thumbnail.firstReadyAt !== null || probe.thumbnail.loadStartedAt === null) return;
      probe.thumbnail.firstReadyAt = performance.now();
      probe.thumbnail.elapsedMs = probe.thumbnail.firstReadyAt - probe.thumbnail.loadStartedAt;
      probe.thumbnail.naturalWidth = image.naturalWidth;
      probe.thumbnail.naturalHeight = image.naturalHeight;
      probe.thumbnail.alt = image.alt;
    }, true);
    // Weak collections never keep an ImageBitmap or WebGLTexture alive for the probe.
    const owned = new WeakMap<ImageBitmap, { bytes: number; closed: boolean }>();
    const nativeBitmap = window.createImageBitmap.bind(window);
    window.createImageBitmap = (async (...args: any[]) => {
      probe.bitmaps.pending++;
      try {
        const bitmap: ImageBitmap = await (nativeBitmap as any)(...args);
        const bytes = bitmap.width * bitmap.height * 4;
        owned.set(bitmap, { bytes, closed: false });
        probe.bitmaps.created++; probe.bitmaps.live++; probe.bitmaps.liveRgbaBytes += bytes; probe.bitmaps.createdRgbaBytes += bytes;
        probe.bitmaps.peakRgbaBytes = Math.max(probe.bitmaps.peakRgbaBytes, probe.bitmaps.liveRgbaBytes);
        if (args[0] instanceof File) probe.bitmaps.decodedNames[args[0].name] = (probe.bitmaps.decodedNames[args[0].name] ?? 0) + 1;
        return bitmap;
      } finally { probe.bitmaps.pending--; probe.lastActivity = performance.now(); }
    }) as typeof createImageBitmap;
    const nativeClose = ImageBitmap.prototype.close;
    ImageBitmap.prototype.close = function () {
      const entry = owned.get(this);
      if (entry && !entry.closed) {
        entry.closed = true; probe.bitmaps.closed++; probe.bitmaps.live--; probe.bitmaps.liveRgbaBytes -= entry.bytes; probe.bitmaps.closedRgbaBytes += entry.bytes;
      } else if (entry) probe.bitmaps.duplicateCloseCalls++;
      probe.lastActivity = performance.now();
      return nativeClose.call(this);
    };
    const textures = new WeakSet<WebGLTexture>();
    for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!Context) continue;
      const prototype = Context.prototype as any;
      for (const name of ['createTexture', 'deleteTexture', 'texImage2D', 'texSubImage2D']) {
        if (!Object.prototype.hasOwnProperty.call(prototype, name)) continue;
        const native = prototype[name];
        prototype[name] = function (...args: any[]) {
          const result = native.apply(this, args);
          if (this.canvas?.closest?.('[data-testid="scene-3d"]')) {
            if (name === 'createTexture' && result) {
              textures.add(result); probe.textures.created++; probe.textures.liveHandles++;
              probe.textures.peakHandles = Math.max(probe.textures.peakHandles, probe.textures.liveHandles);
            } else if (name === 'deleteTexture' && args[0] && textures.delete(args[0])) {
              probe.textures.deleted++; probe.textures.liveHandles--;
            } else if (name.startsWith('tex')) probe.textures.uploads++;
            probe.lastActivity = performance.now();
          }
          return result;
        };
      }
    }
    document.addEventListener('webglcontextlost', () => probe.textures.contextLosses++, true);
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
      if (url.pathname === '/fixtures/memory/manifest.json') probe.thumbnail.loadStartedAt ??= performance.now();
      if (!url.pathname.startsWith('/fixtures/memory/images/')) return nativeFetch(input, options);
      probe.transfers.active++;
      let finished = false;
      const finish = () => { if (!finished) { finished = true; probe.transfers.active--; probe.lastActivity = performance.now(); } };
      try {
        const response = await nativeFetch(input, options);
        const blob = response.blob.bind(response);
        response.blob = async () => {
          try {
            const body = await blob(); probe.transfers.completed++; probe.transfers.bytes += body.size;
            probe.transfers.uniqueUrls[url.pathname] = (probe.transfers.uniqueUrls[url.pathname] ?? 0) + 1;
            return body;
          } finally { finish(); }
        };
        if (response.body) {
          const cancel = response.body.cancel.bind(response.body);
          response.body.cancel = async reason => { try { return await cancel(reason); } finally { finish(); } };
        }
        return response;
      } catch (error) { finish(); throw error; }
    };
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type()) && /detached|disposed|tex(?:ture|Image|SubImage)/i.test(message.text())) errors.push(message.text());
  });
  const session = await page.context().newCDPSession(page);
  const samples: any[] = [];
  const sample = async (phase: string) => {
    // Finish UI/cache and native-resource reads before slow OS counter collection.
    const rows = await cacheRows(page);
    const at = new Date().toISOString();
    const probe = await page.evaluate(() => ({ ...structuredClone((window as any).__memoryRetention), sampledAtPerformanceMs: performance.now() }));
    const result = { phase, at, probe, cacheRows: rows,
      jsHeap: await session.send('Runtime.getHeapUsage'), processMemory: await sampleMemoryProcesses(browser) };
    samples.push(result);
    writeFileSync(resolve(output, 'samples.json'), JSON.stringify(samples, null, 2));
    return result;
  };
  await page.goto(`/?url=${encodeURIComponent('http://127.0.0.1:4173/fixtures/memory/manifest.json')}`);
  await expect(page.getByText('image-00001.png', { exact: true }).first()).toBeVisible({ timeout: 120000 });
  await sample('loaded-before-plane-prefetch');
  for (let cycle = 1; cycle <= 3; cycle++) {
    await setPlaneMode(page, true);
    await expect.poll(() => page.evaluate(() => Object.keys((window as any).__memoryRetention.transfers.uniqueUrls).length), { timeout: 180000 }).toBe(fixture.imageCount);
    // Unique URL transfers are warm after cycle one; explicitly await full plane
    // cache population on every revisit instead of mistaking a quiet gap for completion.
    await expect.poll(async () => (await cacheRows(page))['Decoded Bitmaps']?.count, { intervals: [500, 1000], timeout: 180000 }).toBe(fixture.imageCount);
    await settleResources(page);
    const active = await sample(`cycle-${cycle}-active-planes`);
    expect(active.probe.bitmaps.createdRgbaBytes).toBeGreaterThan(64 * 1024 * 1024);
    await page.getByTestId('scene-3d').locator('canvas').first().screenshot({ path: resolve(output, `cycle-${cycle}-planes.png`) });
    await setPlaneMode(page, false);
    await expect.poll(async () => (await cacheRows(page))['Decoded Bitmaps']?.count, { intervals: [250, 500], timeout: 30000 }).toBeLessThanOrEqual(1024);
    await settleResources(page);
    const inactive = await sample(`cycle-${cycle}-released-planes`);
    // Existing UI diagnostics expose exact entry counts but formatted bytes. Since
    // every fixture image is 128x128 RGBA, 1024 inactive entries are exactly 64 MiB.
    expect(inactive.cacheRows['Decoded Bitmaps']?.count).toBeGreaterThan(0);
    expect(inactive.cacheRows['Decoded Bitmaps']?.count).toBeLessThanOrEqual(1024);
    expect(inactive.probe.textures.contextLosses).toBe(0);
  }
  const beforeSwitch = samples[samples.length - 1];
  // Same-page replacement exercises application clear/disposal, not browser teardown.
  await page.evaluate(async () => {
    const files = await Promise.all(['cameras.bin', 'images.bin', 'points3D.bin'].map(async name => new File([await (await fetch(`/fixtures/small/${name}`)).arrayBuffer()], name)));
    const transfer = new DataTransfer(); files.forEach(file => transfer.items.add(file));
    const event = new DragEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files: transfer.files, items: files.map(file => ({ kind: 'file', getAsFile: () => file,
      webkitGetAsEntry: () => ({ isFile: true, isDirectory: false, name: file.name, file: (done: (file: File) => void) => done(file) }) })) } });
    document.querySelector('[data-testid="drop-zone"]')!.dispatchEvent(event);
  });
  await expect(page.getByText('Source:', { exact: true }).locator('..')).toContainText('Local');
  await settleResources(page);
  const cleared = await sample('same-page-replaced-with-local-small');
  expect(cleared.cacheRows['Decoded Bitmaps']).toBeNull();
  expect(cleared.cacheRows['URL Images']).toBeNull();
  expect(cleared.probe.bitmaps.liveRgbaBytes).toBeLessThan(beforeSwitch.probe.bitmaps.liveRgbaBytes);
  expect(errors).toEqual([]);
  const canvas = page.getByTestId('scene-3d').locator('canvas').first();
  const renderer = await canvas.evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return debug ? gl!.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable';
  });
  writeFileSync(resolve(output, 'report.json'), JSON.stringify({ fixture, samples, errors, renderer, browser: browser.version(), buildSha256: hash.digest('hex'),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirtyPatchSha256: createHash('sha256').update(execFileSync('git', ['diff', '--binary', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] })).digest('hex'), viewport: page.viewportSize(), dpr: 1,
    environment: { cpu: cpus()[0]?.model, os: `${platform()} ${release()}`, gpuMode: process.env.PERF_GPU || 'default' },
    definitions: { firstThumbnail: 'Diagnostic only: elapsed from application manifest fetch start to the first captured load event on an ordinary HTMLImageElement inside data-testid=image-gallery with naturalWidth>0. Readiness does not prove first paint; null means unobserved. No timing gate.', bitmapBytes: 'Sum width*height*4 for instrumented main-thread createImageBitmap results minus explicit close calls; not process memory. Probe keeps only WeakMap references.',
      textureHandles: 'Native WebGL create/delete handles and upload call counts on the scene canvas; not THREE texture object counts or exact GPU bytes.',
      cacheRows: 'Existing Source tooltip entry counts and rounded byte strings. No private app cache API or debug build was injected.',
      jsHeap: 'CDP Runtime.getHeapUsage for the page isolate; not worker heaps or total WASM resident memory.' },
    limitations: ['Pinned image planes may exceed inactive retention budgets by design; budget assertions occur only after hiding all cameras.',
      'Encoded File cache workload does not exceed 128 MiB; this scenario cannot establish URL File budget pressure behavior.',
      'ImageBitmaps created solely in workers and implicit GC reclamation without close are not directly observable. OS GPU counters are allocation estimates, not exact physical VRAM residency.',
      'Main+worker WASM capacity is included in process private commit but cannot be separately and exactly attributed.',
      'Three equivalent cycle endpoints reveal owned-reference growth; process allocators may retain committed pages after resource disposal.',
      'Instrumentation has overhead; resource checkpoints precede timestamped OS counter collection, so measurements are adjacent rather than simultaneous. Process totals are snapshots, not an exhaustive peak sampler. RSS sums may double-count shared pages.'] }, null, 2));
  await session.detach();
});
