import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { STORAGE_KEYS } from '../../src/store/migration';
import { generateFileRetentionFixture } from '../../scripts/performance/memory-fixture';
import { sampleMemoryProcesses } from '../../scripts/performance/memory-processes';

test.use({ screenshot: 'only-on-failure' });

async function readFileCaches(page: Page) {
  await page.mouse.move(1, 1);
  const indicator = page.getByText('Source:', { exact: true });
  if (!await indicator.isVisible()) await page.keyboard.press('Tab');
  await indicator.hover();
  await expect(page.getByRole('columnheader', { name: 'Resource', exact: true })).toBeVisible();
  const result: Record<string, { count: number; formattedBytes: string }> = {};
  for (const label of ['URL Images', 'URL Masks', 'Thumbnails', 'Masked Thumbnails']) {
    const row = page.getByRole('row').filter({ has: page.getByText(label, { exact: true }) });
    if (await row.count()) {
      const cells = await row.getByRole('cell').allTextContents();
      result[label] = { count: Number(cells[1].replaceAll(',', '')), formattedBytes: cells[2] };
    }
  }
  await page.mouse.move(1, 1);
  return result;
}

async function loadedVisibleNames(page: Page, output: string): Promise<string[]> {
  try {
  await expect.poll(() => page.evaluate(() => {
    const gallery = document.querySelector('[data-testid="image-gallery"]');
    const names = Array.from(new Set(Array.from(gallery?.querySelectorAll('img') ?? []).map(image => image.alt).filter(name => /^image-\d{5}\.png$/.test(name))));
    const loaded = new Set(Array.from(gallery?.querySelectorAll('img') ?? []).filter(image => image.complete && image.naturalWidth > 0).map(image => image.alt));
    const probe = (window as any).__fileRetention;
    const hasPlaceholders = Array.from(gallery?.querySelectorAll('div') ?? []).some(element => element.childElementCount === 0 && element.textContent === '...');
    return names.length > 0 && !hasPlaceholders && names.every(name => loaded.has(name)) && probe.active === 0
      && performance.now() - Math.max(probe.lastActivity, probe.lastScroll) > 500;
  }), { timeout: 30000, intervals: [100, 250] }).toBe(true);
  } catch (error) {
    const failure = await page.evaluate(() => ({ at: new Date().toISOString(), probe: (window as any).__fileRetention,
      images: Array.from(document.querySelectorAll<HTMLImageElement>('[data-testid="image-gallery"] img')).map(image => ({ alt: image.alt, complete: image.complete, width: image.naturalWidth, src: image.src })),
      text: document.querySelector('[data-testid="image-gallery"]')?.textContent,
      scroller: Array.from(document.querySelectorAll('[data-testid="image-gallery"] > .overflow-auto')).map(element => ({ top: element.scrollTop, height: element.clientHeight, total: element.scrollHeight })) }));
    writeFileSync(resolve(output, 'readiness-failure.json'), JSON.stringify(failure, null, 2));
    writeFileSync(resolve(output, 'readiness-failure-caches.json'), JSON.stringify(await readFileCaches(page), null, 2));
    throw error;
  }
  return page.evaluate(() => Array.from(new Set(Array.from(document.querySelectorAll<HTMLImageElement>('[data-testid="image-gallery"] img')).map(image => image.alt).filter(name => /^image-\d{5}\.png$/.test(name)))));
}

test('three masked-gallery traversals exceed the shared encoded File budget and preserve displayed media', async ({ page, browser }) => {
  test.skip(process.env.PERF_FILE_RETENTION !== '1', 'Opt-in 3-cycle URL mask File LRU stress, more than 128 MiB of original encoded masks');
  test.setTimeout(900000);
  await page.setViewportSize({ width: 1280, height: 1800 });
  const fixture = generateFileRetentionFixture(Number(process.env.PERF_FILE_IMAGES || 1100));
  const output = resolve('.tmp/performance/file-runs', process.env.PERF_RUN || `file-retention-${Date.now()}`);
  mkdirSync(output, { recursive: true });
  const hash = createHash('sha256');
  for (const name of readdirSync('dist', { recursive: true }).map(String).sort()) {
    if (/\.(js|html|css|wasm)$/.test(name)) hash.update(name).update(readFileSync(resolve('dist', name)));
  }
  await page.addInitScript(keys => {
    localStorage.setItem(keys.ui, JSON.stringify({ state: { galleryThumbnailDisplayMode: 'maskedImage', galleryViewMode: 'gallery', galleryColumns: 6, gallerySortField: 'name', gallerySortDirection: 'asc', autoHideElements: { axes: true, grid: true, gizmo: true, points: false, cameras: false, matches: false, rigs: false, buttons: false } }, version: 0 }));
    localStorage.setItem(keys.camera, JSON.stringify({ state: { cameraDisplayMode: 'frustum', showCameras: true, selectionColorMode: 'static', autoRotateMode: 'off' }, version: 3 }));
    const probe = { active: 0, lastActivity: performance.now(), lastScroll: performance.now(),
      requests: [] as Array<{ url: string; start: number; end?: number; bytes?: number; status?: number }>,
      fileSizes: {} as Record<string, number[]>, textureUploads: 0, detachedUploads: 0, revokedWhileMounted: 0,
      pngUrls: {} as Record<string, { bytes: number; created: number; revoked?: number }> };
    (window as any).__fileRetention = probe;
    // Record sizes only; do not retain File objects or extend their lifetime.
    const NativeFile = window.File;
    window.File = class extends NativeFile {
      constructor(bits: BlobPart[], name: string, options?: FilePropertyBag) {
        super(bits, name, options);
        if (/^image-\d{5}\.(?:png|jpg)$/.test(name)) {
          const sizes = probe.fileSizes[name] ??= [];
          if (!sizes.includes(this.size)) sizes.push(this.size);
        }
      }
    };
    const createObjectURL = URL.createObjectURL.bind(URL);
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = value => {
      const url = createObjectURL(value);
      // This controlled gallery creates PNG Blob URLs only for derived masked
      // thumbnails. Original Files are excluded; no Blob reference is retained.
      if (value instanceof Blob && !(value instanceof NativeFile) && value.type === 'image/png') {
        probe.pngUrls[url] = { bytes: value.size, created: performance.now() };
      }
      return url;
    };
    URL.revokeObjectURL = url => {
      const record = probe.pngUrls[url];
      if (record && record.revoked === undefined) {
        record.revoked = performance.now();
        if (Array.from(document.querySelectorAll('img')).some(image => image.src === url)) probe.revokedWhileMounted++;
      }
      revokeObjectURL(url);
    };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
      if (!/^\/fixtures\/memory\/(?:images|masks)\//.test(url.pathname)) return nativeFetch(input, options);
      const record = { url: url.pathname, start: performance.now() } as (typeof probe.requests)[number];
      probe.requests.push(record); probe.active++;
      let finished = false;
      const finish = () => { if (!finished) { finished = true; record.end = performance.now(); probe.active--; probe.lastActivity = performance.now(); } };
      try {
        const response = await nativeFetch(input, options); record.status = response.status;
        const blob = response.blob.bind(response);
        response.blob = async () => { try { const body = await blob(); record.bytes = body.size; return body; } finally { finish(); } };
        if (response.body) {
          const cancel = response.body.cancel.bind(response.body);
          response.body.cancel = async reason => { try { return await cancel(reason); } finally { finish(); } };
        }
        return response;
      } catch (error) { finish(); throw error; }
    };
    for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!Context) continue;
      for (const name of ['texImage2D', 'texSubImage2D']) {
        const prototype = Context.prototype as any;
        if (!Object.prototype.hasOwnProperty.call(prototype, name)) continue;
        const native = prototype[name];
        prototype[name] = function (...args: any[]) {
          if (this.canvas?.closest?.('[data-testid="scene-3d"]')) {
            probe.textureUploads++;
            if (args.some(value => value instanceof ImageBitmap && (value.width === 0 || value.height === 0))) probe.detachedUploads++;
          }
          return native.apply(this, args);
        };
      }
    }
  }, { ui: STORAGE_KEYS.ui, camera: STORAGE_KEYS.camera });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (['warning', 'error'].includes(message.type()) && /detached|disposed|tex(?:ture|Image|SubImage)/i.test(message.text())) errors.push(message.text());
  });
  console.log('File retention: navigating');
  await page.goto(`/?url=${encodeURIComponent('http://127.0.0.1:4173/fixtures/memory/file-manifest.json')}`);
  console.log('File retention: page loaded', await page.title());
  writeFileSync(resolve(output, 'startup-dom.txt'), await page.locator('body').innerText());
  await expect(page.getByTestId('image-gallery').getByRole('img', { name: 'image-00001.png', exact: true })).toBeVisible({ timeout: 30000 });
  console.log('File retention: first image visible');
  await loadedVisibleNames(page, output);
  console.log('File retention: initial gallery ready');
  // Select an unobstructed second-row image before cache pressure. The hidden
  // gallery toolbar slot overlaps the first row at this density. Selection stays active while the
  // gallery traverses other resources, and its scene texture must stay uploadable.
  await page.screenshot({ path: resolve(output, 'before-selection.png'), timeout: 5000 });
  await page.getByTestId('image-gallery').getByRole('img', { name: 'image-00007.png', exact: true }).locator('..').locator('..').click({ timeout: 10000 });
  console.log('File retention: first image selected');
  const scroller = page.getByTestId('image-gallery').locator(':scope > .overflow-auto');
  const samples: any[] = [];
  const checkpoints: any[] = [];
  const sample = async (phase: string) => {
    const caches = await readFileCaches(page);
    const probe = await page.evaluate(() => structuredClone((window as any).__fileRetention));
    const mountedUrls = await page.evaluate(() => Array.from(new Set(Array.from(document.querySelectorAll<HTMLImageElement>('[data-testid="image-gallery"] img')).map(image => image.src))));
    const pngRecords = Object.entries(probe.pngUrls as Record<string, { bytes: number; revoked?: number }>);
    const livePng = pngRecords.filter(([, record]) => record.revoked === undefined);
    const mountedPng = livePng.filter(([url]) => mountedUrls.includes(url));
    const liveBytes = livePng.reduce((sum, [, record]) => sum + record.bytes, 0);
    const mountedBytes = mountedPng.reduce((sum, [, record]) => sum + record.bytes, 0);
    const derivedPng = { liveCount: livePng.length, liveBytes, mountedCount: mountedPng.length, mountedBytes,
      inactiveBytesProxy: liveBytes - mountedBytes, createdBytes: pngRecords.reduce((sum, [, record]) => sum + record.bytes, 0),
      revokedBytes: pngRecords.filter(([, record]) => record.revoked !== undefined).reduce((sum, [, record]) => sum + record.bytes, 0) };
    const displaySizes = Object.entries(probe.fileSizes as Record<string, number[]>).filter(([name]) => name.endsWith('.jpg')).flatMap(([, sizes]) => sizes);
    const distinctDisplaySizes = [...new Set(displaySizes)];
    expect(distinctDisplaySizes.length).toBe(1);
    const retainedMaskBytes = (caches['URL Masks']?.count ?? 0) * fixture.maskBytes;
    const retainedDisplayBytes = (caches['URL Images']?.count ?? 0) * distinctDisplaySizes[0];
    const result = { phase, at: new Date().toISOString(), caches, retainedMaskBytes, retainedDisplayBytes,
      exactOwnedFileBytes: retainedMaskBytes + retainedDisplayBytes, displayFileBytes: distinctDisplaySizes[0], probe, derivedPng,
      processMemory: await sampleMemoryProcesses(browser) };
    expect(result.exactOwnedFileBytes).toBeLessThanOrEqual(128 * 1024 * 1024);
    samples.push(result);
    writeFileSync(resolve(output, 'samples.json'), JSON.stringify(samples, null, 2));
    return result;
  };
  for (let cycle = 1; cycle <= 3; cycle++) {
    const visited = new Set<string>();
    const start = performance.now();
    await scroller.evaluate(element => { element.scrollTop = 0; (window as any).__fileRetention.lastScroll = performance.now(); });
    let end = false;
    let step = 0;
    while (!end) {
      const names = await loadedVisibleNames(page, output);
      names.forEach(name => visited.add(name));
      checkpoints.push({ cycle, step, names });
      const progress = await scroller.evaluate(element => ({ top: element.scrollTop, height: element.clientHeight, total: element.scrollHeight }));
      const transfers = await page.evaluate(() => ({ active: (window as any).__fileRetention.active, completedMasks: (window as any).__fileRetention.requests.filter((request: any) => request.url.includes('/masks/') && request.bytes).length }));
      writeFileSync(resolve(output, 'progress.json'), JSON.stringify({ at: new Date().toISOString(), cycle, step, visited: visited.size, names, progress, transfers }, null, 2));
      end = progress.top + progress.height >= progress.total - 2;
      if (!end) await scroller.evaluate(element => {
        element.scrollTop += element.clientHeight * 0.8;
        (window as any).__fileRetention.lastScroll = performance.now();
      });
      step++;
      expect(step).toBeLessThan(250);
    }
    expect(visited.size).toBe(fixture.imageCount);
    const result = await sample(`cycle-${cycle}-at-end`);
    const successfulMasks = result.probe.requests.filter((request: any) => request.url.includes('/masks/') && request.bytes === fixture.maskBytes);
    expect(new Set(successfulMasks.map((request: any) => request.url)).size).toBe(fixture.imageCount);
    expect(successfulMasks.reduce((sum: number, request: any) => sum + request.bytes, 0)).toBeGreaterThan(128 * 1024 * 1024);
    expect(result.caches['URL Masks'].count).toBeLessThan(fixture.imageCount);
    expect(result.probe.detachedUploads).toBe(0);
    expect(result.probe.revokedWhileMounted).toBe(0);
    expect(result.derivedPng.inactiveBytesProxy).toBeLessThanOrEqual(64 * 1024 * 1024);
    checkpoints.push({ cycle, steps: step, durationMs: performance.now() - start, uniqueVisited: visited.size });
    await page.getByTestId('scene-3d').locator('canvas').first().screenshot({ path: resolve(output, `cycle-${cycle}-selected-after-eviction.png`) });
  }
  expect(samples[2].derivedPng.createdBytes).toBeGreaterThan(64 * 1024 * 1024);
  expect(samples[2].derivedPng.revokedBytes).toBeGreaterThan(0);
  const firstUrl = '/fixtures/memory/masks/image-00007.png';
  const beforeReturn = await page.evaluate(url => (window as any).__fileRetention.requests.filter((request: any) => request.url === url && request.bytes).length, firstUrl);
  await scroller.evaluate(element => { element.scrollTop = 0; (window as any).__fileRetention.lastScroll = performance.now(); });
  await loadedVisibleNames(page, output);
  await expect.poll(() => page.evaluate(url => (window as any).__fileRetention.requests.filter((request: any) => request.url === url && request.bytes).length, firstUrl)).toBeGreaterThan(beforeReturn);
  await expect(page.getByTestId('image-gallery').getByRole('img', { name: 'image-00007.png', exact: true })).toBeVisible();
  await sample('returned-selected-image-after-eviction');
  await page.evaluate(async () => {
    const files = await Promise.all(['cameras.bin', 'images.bin', 'points3D.bin'].map(async name => new File([await (await fetch(`/fixtures/small/${name}`)).arrayBuffer()], name)));
    const transfer = new DataTransfer(); files.forEach(file => transfer.items.add(file));
    const event = new DragEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files: transfer.files, items: files.map(file => ({ kind: 'file', getAsFile: () => file,
      webkitGetAsEntry: () => ({ isFile: true, isDirectory: false, name: file.name, file: (done: (file: File) => void) => done(file) }) })) } });
    document.querySelector('[data-testid="drop-zone"]')!.dispatchEvent(event);
  });
  await expect(page.getByText('Source:', { exact: true }).locator('..')).toContainText('Local');
  const cleared = await sample('same-page-replacement');
  expect(cleared.exactOwnedFileBytes).toBe(0);
  expect(cleared.derivedPng.liveBytes).toBe(0);
  expect(cleared.probe.revokedWhileMounted).toBe(0);
  expect(errors).toEqual([]);
  writeFileSync(resolve(output, 'report.json'), JSON.stringify({ fixture, samples, checkpoints, errors, browser: browser.version(), buildSha256: hash.digest('hex'),
    viewport: page.viewportSize(), galleryColumns: 6, gpuMode: process.env.PERF_GPU || 'default',
    definitions: { exactOwnedFileBytes: 'Existing cache entry counts times actual original mask File.size and the instrumented uniform compressed display File.size. Uniformity is asserted; cache byte strings retained independently for inspection.',
      visited: 'Every virtualized gallery image name is observed with an ordinary loaded HTMLImageElement, over three full top-to-bottom traversals.',
      selectedValidity: 'Image00007 (second row, clear of the toolbar) stays selected while scrolling; screenshots and detached-bitmap upload/error monitoring inspect its scene texture. Returning to its evicted mask refetches successfully and its gallery image has naturalWidth>0.',
      derivedPng: 'Exact PNG Blob payload bytes from createObjectURL/revokeObjectURL, excluding original Files. DOM-mounted unique gallery src bytes are an active-consumer proxy; live minus mounted bytes is a settled inactive-retention proxy, not a private lease counter. The64MiB limit applies to inactive ownership; mounted resources are additional.',
      consumers: 'Thumbnail object URLs, decoded bitmap/texture references, and selected-image File references may outlive cache eviction. They are not counted as cache-owned File bytes.' },
    limitations: ['This is one controlled 3-cycle traversal, not a five-repetition latency benchmark.', 'Known deterministic image and mask sizes permit exact cache-owned byte reconstruction; UI formatted values alone are rounded.',
      'Process CPU/GPU snapshots include other app allocations and allocator retention; they must not be equated with cache-owned bytes.', 'Selected plane screenshot/error checks are visual/integration coverage, not a private texture lease counter.'] }, null, 2));
});
