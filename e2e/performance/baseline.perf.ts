import { test, expect } from '@playwright/test';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cpus, platform, release, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { STORAGE_KEYS } from '../../src/store/migration';
import { sampleMemoryProcesses } from '../../scripts/performance/memory-processes';
import { installSelectionProbe } from '../../scripts/performance/selection-probe';

const fixture = process.env.PERF_FIXTURE || 'small';
const repetitions = Number(process.env.PERF_REPETITIONS || 5);
const run = process.env.PERF_RUN || `run-${Date.now()}`;
const output = resolve('.tmp/performance/runs', run);
const metadata = JSON.parse(readFileSync(resolve('.tmp/performance/fixtures', fixture, 'metadata.json'), 'utf8'));
const filtered = process.env.PERF_FILTERED === '1';
const format = process.env.PERF_FORMAT || 'bin';
const withRigs = process.env.PERF_RIGS === '1';
const buildRoot = resolve(process.env.PERF_DIST || 'dist');
const buildHash = createHash('sha256');
for (const name of readdirSync(buildRoot, { recursive: true }).map(String).sort()) {
  if (/\.(js|html|css|wasm)$/.test(name)) buildHash.update(name).update(readFileSync(resolve(buildRoot, name)));
}
const buildSha256 = buildHash.digest('hex');

// Deliberately separate from timed runs: OS sampling blocks the test driver and
// can perturb readiness observations. These are sampled maxima, not true peaks.
let stopMemorySampling: (() => void) | undefined;
let memorySampling: Promise<void> | undefined;
let memorySamples: Awaited<ReturnType<typeof sampleMemoryProcesses>>[] = [];
test.beforeEach(async ({ browser }) => {
  if (process.env.PERF_PROCESS_MEMORY !== '1') return;
  let stopped = false;
  memorySamples = [];
  stopMemorySampling = () => { stopped = true; };
  memorySamples.push(await sampleMemoryProcesses(browser));
  memorySampling = (async () => {
    while (!stopped) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!stopped) memorySamples.push(await sampleMemoryProcesses(browser));
    }
  })();
});
test.afterEach(async ({ browser }, info) => {
  if (!stopMemorySampling) return;
  stopMemorySampling();
  await memorySampling;
  memorySamples.push(await sampleMemoryProcesses(browser));
  const directory = resolve('.tmp/performance/memory-runs', run);
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${fixture}-${info.title.match(/repetition (\d+)/)?.[1] || 0}.json`), JSON.stringify({
    buildSha256, fixture: metadata, browser: browser.version(), samples: memorySamples,
    definition: 'Diagnostic only. Samples CDP-owned Chromium processes through startup, load and selection; sampling perturbs driver timing. Maximum observed CPU private commit and OS GPU counters are not instantaneous peaks or additive totals.',
  }, null, 2));
  stopMemorySampling = undefined;
});

for (let repetition = 0; repetition < repetitions; repetition++) {
  test(`production ${fixture} repetition ${repetition + 1}`, async ({ page, browser }) => {
    mkdirSync(output, { recursive: true });
    const resultPath = resolve(output, `${fixture}-${repetition}.json`);
    if (existsSync(resultPath)) throw new Error(`Run already exists: ${resultPath}. Choose a new PERF_RUN.`);
    const errorPath = resolve(output, `${fixture}-${repetition}.browser.log`);
    page.on('pageerror', error => appendFileSync(errorPath, `PAGE: ${error.message}\n`));
    page.on('console', message => {
      if (message.type() === 'error') appendFileSync(errorPath, `CONSOLE: ${message.text()}\n`);
    });
    const selectionDiagnostic = process.env.PERF_SELECTION_DIAGNOSTIC === '1';
    const diagnostic = process.env.PERF_DIAGNOSTIC === '1' || selectionDiagnostic;
    const cdp = diagnostic ? await page.context().newCDPSession(page) : null;
    if (cdp) await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing,v8', transferMode: 'ReturnAsStream' });
    if (selectionDiagnostic) await installSelectionProbe(page);
    if (diagnostic) await page.addInitScript(() => {
      const events: any[] = [];
      (window as any).__workerDiagnostic = events;
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          events.push({ time: performance.now(), type: 'construct', url: String(url) });
          const nativePost = this.postMessage;
          this.postMessage = function (...args: any[]) {
            const data = args[0];
            events.push({ time: performance.now(), type: 'post-start', operation: data?.operation, requestId: data?.requestId });
            (nativePost as any).apply(this, args);
            events.push({ time: performance.now(), type: 'post-return', operation: data?.operation, requestId: data?.requestId });
          };
          this.addEventListener('message', event => {
            const data = event.data;
            const memberships = data?.result?.reconstruction?.imageToPoint3DIds;
            events.push({ time: performance.now(), type: data?.type, operation: data?.operation, phase: data?.phase,
              requestId: data?.requestId, diagnostics: data?.result?.diagnostics,
              membershipImages: memberships?.size,
              membershipEntries: memberships instanceof Map ? [...memberships.values()].reduce((sum, ids) => sum + ids.size, 0) : null });
          });
        }
      };
    });
    if (filtered) await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ state: { thinning: 50, minTrackLength: 2 }, version: 0 })), STORAGE_KEYS.pointCloud);
    await page.addInitScript(() => {
      (window as any).__perf = { longTasks: [] };
      new PerformanceObserver(list => {
        (window as any).__perf.longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration })));
      }).observe({ type: 'longtask', buffered: true });
    });
    const startup = [];
    for (const cache of ['cold', 'warm']) {
      await page.goto('/');
      await expect(page.getByTestId('drop-zone')).toBeVisible();
      await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
      startup.push(await page.evaluate(cache => ({
        cache,
        readyProxyMs: performance.now(),
        js: (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter(e => /\.js(?:\?|$)/.test(e.name)).map(e => ({ url: e.name, compressedBodyBytes: e.encodedBodySize, transferBytes: e.transferSize })),
      }), cache));
    }
    const close = page.getByRole('button', { name: 'Dismiss this panel', exact: true });
    if (await close.isVisible()) await close.click();
    // Large synthetic Blobs produced NotReadableError in this harness. Native
    // disk-backed Files match a real local drop and avoid that harness limit.
    const nativeFiles = process.env.PERF_NATIVE_FILES === '1';
    if (nativeFiles) {
      await page.evaluate(() => {
        const input = document.createElement('input');
        input.type = 'file'; input.multiple = true; input.id = 'perf-native-fixtures';
        input.style.display = 'none'; document.body.appendChild(input);
      });
      const names = ['cameras', 'images', 'points3D', ...(withRigs ? ['rigs', 'frames'] : [])].map(name => `${name}.${format}`);
      await page.locator('#perf-native-fixtures').setInputFiles(names.map(name => resolve('.tmp/performance/fixtures', fixture, name)));
      await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>('#perf-native-fixtures')!;
        (window as any).__files = Array.from(input.files!); input.remove();
      });
    } else await page.evaluate(async ({ fixture, format, withRigs }) => {
      const names = ['cameras', 'images', 'points3D', ...(withRigs ? ['rigs', 'frames'] : [])].map(name => `${name}.${format}`);
      (window as any).__files = await Promise.all(names.map(async name => {
        const response = await fetch(`/fixtures/${fixture}/${name}`);
        if (!response.ok) throw new Error(`Missing fixture ${name}`);
        return new File([await response.arrayBuffer()], name);
      }));
    }, { fixture, format, withRigs });
    const start = await page.evaluate(() => {
      const files = (window as any).__files as File[];
      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));
      const event = new DragEvent('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: {
        types: ['Files'], files: dataTransfer.files,
        items: files.map(file => ({ kind: 'file', getAsFile: () => file, webkitGetAsEntry: () => ({ isFile: true, isDirectory: false, name: file.name, file: (callback: (f: File) => void) => callback(file) }) })),
      } });
      const start = performance.now();
      document.querySelector('[data-testid="drop-zone"]')!.dispatchEvent(event);
      delete (window as any).__files;
      return start;
    });
    await expect(page.getByText('image-00001.png', { exact: true }).first()).toBeVisible({ timeout: 120000 });
    const scene = await page.evaluate(async start => {
      await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
      const canvas = document.querySelector('canvas');
      const gl = canvas?.getContext('webgl2');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        usefulSceneProxyMs: performance.now() - start,
        renderer: debug ? gl!.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
        longTasks: (window as any).__perf.longTasks.filter((e: { start: number }) => e.start >= start),
        heapAtReady: (performance as any).memory?.usedJSHeapSize ?? null,
      };
    }, start);
    if (process.env.PERF_GPU === 'hardware') {
      expect(scene.renderer).not.toMatch(/swiftshader|llvmpipe|software|unavailable/i);
      expect(scene.renderer).toMatch(/NVIDIA|AMD|Intel|Apple/i);
    }
    const selections = [];
    if (selectionDiagnostic && cdp) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
      await cdp.send('Profiler.start');
    }
    for (let image = 1; image <= Math.min(10, metadata.imageCount); image++) {
      const label = `image-${String(image).padStart(5, '0')}.png`;
      const target = page.getByText(label, { exact: true }).first();
      await target.scrollIntoViewIfNeeded();
      // DOM click plus two animation callbacks is a scheduling proxy, not a GPU presentation fence.
      selections.push(await target.evaluate(async (element, selectionIndex) => {
        const probe = (window as any).__selectionProbe;
        probe?.begin(selectionIndex);
        if ((window as any).__workerDiagnostic) performance.mark('diagnostic-selection-start');
        const start = performance.now();
        (element as HTMLElement).click();
        probe?.clickReturned();
        await new Promise<void>(done => requestAnimationFrame(() => {
          probe?.raf(1);
          requestAnimationFrame(() => { probe?.raf(2); done(); });
        }));
        probe?.end();
        if ((window as any).__workerDiagnostic) performance.mark('diagnostic-selection-end');
        return performance.now() - start;
      }, image));
      if (selectionDiagnostic) await page.evaluate(() => (window as any).__selectionProbe.settle());
    }
    if (selectionDiagnostic && cdp) {
      const profile = await cdp.send('Profiler.stop');
      writeFileSync(resolve(output, `${fixture}-${repetition}.cpuprofile`), JSON.stringify(profile.profile));
      const events = await page.evaluate(() => (window as any).__selectionProbe.events);
      writeFileSync(resolve(output, `${fixture}-${repetition}.selection`), JSON.stringify(events, null, 2));
    }
    const frameIntervals = await page.evaluate(() => new Promise<number[]>(done => {
      const intervals: number[] = [];
      let previous = performance.now();
      const end = previous + 2000;
      function frame(now: number) {
        intervals.push(now - previous); previous = now;
        if (now >= end) done(intervals.slice(1)); else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }));
    let workerDiagnostic = null;
    if (cdp) {
      workerDiagnostic = await page.evaluate(() => (window as any).__workerDiagnostic);
      const finished = new Promise<any>(done => cdp.once('Tracing.tracingComplete', done));
      await cdp.send('Tracing.end');
      const { stream } = await finished;
      const chunks: string[] = [];
      for (;;) {
        const part = await cdp.send('IO.read', { handle: stream });
        chunks.push(part.base64Encoded ? Buffer.from(part.data, 'base64').toString('utf8') : part.data);
        if (part.eof) break;
      }
      await cdp.send('IO.close', { handle: stream });
      writeFileSync(resolve(output, `${fixture}-${repetition}.trace`), chunks.join(''));
    }
    const result = {
      repetition, fixture: metadata, filtered, format, withRigs, nativeFiles, buildSha256, startup, scene, selections, frameIntervals, workerDiagnostic,
      instrumentation: { trace: diagnostic, processMemory: process.env.PERF_PROCESS_MEMORY === '1' },
      identity: resolve(process.env.PERF_DIST || 'dist') === resolve('.tmp/performance/baseline-dist')
        ? JSON.parse(readFileSync('.tmp/performance/baseline-identity.json', 'utf8').replace(/^\uFEFF/, ''))
        : resolve(process.env.PERF_DIST || 'dist') !== resolve('dist')
          ? { retainedBuildDirectory: process.env.PERF_DIST, buildSha256 }
        : { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirtyPatchSha256: createHash('sha256').update(execFileSync('git', ['diff', '--binary', 'HEAD'], { stdio: ['ignore', 'pipe', 'pipe'] })).digest('hex') },
      environment: { browser: browser.version(), cpu: cpus()[0]?.model, cpuCount: cpus().length, os: `${platform()} ${release()}`, ramBytes: totalmem(), viewport: page.viewportSize(), dpr: 1, backend: 'WebGL point cloud', headless: true },
      unavailable: ['GPU presentation timestamps', 'phase parse/conversion/upload boundaries', 'owned File/bitmap/GPU bytes', 'peak process/worker/WASM memory', 'draw calls and rendered idle frames', 'optional splat/recording/hardware WebGPU', 'floor colors'],
    };
    writeFileSync(resultPath, JSON.stringify(result, null, 2));
  });
}
