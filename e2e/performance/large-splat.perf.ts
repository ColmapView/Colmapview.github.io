import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { prepareSplatFixture } from '../../scripts/performance/splat-fixture';

for (const count of [100000, 1000000] as const) for (const backend of ['spark', 'webgpu']) for (let run = 0; run < Number(process.env.PERF_REPETITIONS || 1); run++) {
  test(`${backend} ${count} production splats ${run + 1}`, async ({ page, browser }) => {
    test.skip(process.env.PERF_LARGE_SPLAT !== '1', 'Opt-in large splat hardware validation');
    const { path: fixturePath, metadata } = prepareSplatFixture(count);
    const output = resolve('.tmp/performance/large-splat-runs', process.env.PERF_RUN || 'splat');
    mkdirSync(output, { recursive: true });
    const path = resolve(output, `${backend}-${count}-${run}.json`);
    if (existsSync(path)) throw new Error('Choose a new PERF_RUN');
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const probe = { start: 0, firstInstancedDraw: 0, instancedDraws: 0, firstWebGpuReady: 0,
        adapters: [] as any[], devices: [] as any[] };
      (window as any).__splatStartup = probe;
      const shaders = new WeakSet<WebGLShader>();
      const programs = new WeakSet<WebGLProgram>();
      const states = new WeakMap<WebGL2RenderingContext, { program: WebGLProgram | null; framebuffer: WebGLFramebuffer | null }>();
      const state = (gl: WebGL2RenderingContext) => {
        let value = states.get(gl);
        if (!value) { value = { program: null, framebuffer: null }; states.set(gl, value); }
        return value;
      };
      const proto = WebGL2RenderingContext.prototype as any;
      for (const name of ['shaderSource', 'attachShader', 'useProgram', 'bindFramebuffer']) {
        const original = proto[name];
        proto[name] = function (...args: any[]) {
          const result = original.apply(this, args);
          if (name === 'shaderSource' && args[1].includes('usampler2D ordering') && args[1].includes('renderToViewPos') && args[1].includes('gl_InstanceID')) shaders.add(args[0]);
          if (name === 'attachShader' && shaders.has(args[1])) programs.add(args[0]);
          if (name === 'useProgram') state(this).program = args[0];
          if (name === 'bindFramebuffer' && (args[0] === this.FRAMEBUFFER || args[0] === this.DRAW_FRAMEBUFFER)) state(this).framebuffer = args[1];
          return result;
        };
      }
      for (const name of ['drawArraysInstanced', 'drawElementsInstanced']) {
        const original = proto[name];
        proto[name] = function (...args: any[]) {
          const result = original.apply(this, args);
          const current = state(this);
          if (probe.start && args.at(-1) > 0 && this.canvas.closest?.('[data-testid="scene-3d"]')
            && current.framebuffer === null && current.program && programs.has(current.program)) {
            probe.instancedDraws++;
            if (!probe.firstInstancedDraw) probe.firstInstancedDraw = performance.now();
          }
          return result;
        };
      }
      new MutationObserver(() => {
        const canvas = document.querySelector('[data-testid="webgpu-splat-canvas"]');
        if (probe.start && !probe.firstWebGpuReady && canvas?.classList.contains('opacity-100')) probe.firstWebGpuReady = performance.now();
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
      const gpu = (navigator as any).gpu;
      if (gpu) {
        const requestAdapter = gpu.requestAdapter;
        gpu.requestAdapter = async function (...args: any[]) {
          const adapter = await requestAdapter.apply(this, args);
          if (!adapter) return adapter;
          const info = adapter.info;
          const record = { vendor: info?.vendor, architecture: info?.architecture, device: info?.device,
            description: info?.description, isFallbackAdapter: info?.isFallbackAdapter ?? adapter.isFallbackAdapter ?? null };
          probe.adapters.push(record);
          const requestDevice = adapter.requestDevice;
          adapter.requestDevice = async function (...deviceArgs: any[]) {
            const device = await requestDevice.apply(this, deviceArgs);
            probe.devices.push(record);
            (window as any).__largeSplatDevices ??= [];
            (window as any).__largeSplatDevices.push(device);
            return device;
          };
          return adapter;
        };
      }
    });
    await page.goto(`/?splatBackend=${backend}`);
    await expect(page.getByTestId('drop-zone')).toBeVisible();
    const dismiss = page.getByRole('button', { name: 'Dismiss this panel', exact: true });
    if (await dismiss.isVisible()) await dismiss.click();
    const renderer = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')!;
      const ext = gl.getExtension('WEBGL_debug_renderer_info')!;
      const result = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return result;
    });
    if (process.env.PERF_GPU === 'hardware') expect(renderer).not.toMatch(/swiftshader|software|llvmpipe/i);
    await page.evaluate(() => {
      const input = document.createElement('input'); input.type = 'file'; input.id = 'large-splat-file'; input.hidden = true; document.body.append(input);
    });
    await page.locator('#large-splat-file').setInputFiles(fixturePath);
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('#large-splat-file')!;
      const transfer = new DataTransfer(); transfer.items.add(input.files![0]); input.remove();
      const event = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: transfer });
      (window as any).__splatStartup.start = performance.now();
      document.querySelector('[data-testid="drop-zone"]')!.dispatchEvent(event);
    });
    if (backend === 'webgpu') {
      await expect(page.getByTestId('webgpu-splat-canvas')).toHaveCSS('opacity', '1', { timeout: 60000 });
      await expect.poll(() => page.evaluate(() => (window as any).__splatStartup.firstWebGpuReady)).toBeGreaterThan(0);
    } else {
      await expect.poll(() => page.evaluate(() => (window as any).__splatStartup.firstInstancedDraw), { timeout: 60000 }).toBeGreaterThan(0);
      await expect(page.getByTestId('webgpu-splat-canvas')).toHaveCount(0);
    }
    const measurement = await page.evaluate(backend => {
      const probe = (window as any).__splatStartup;
      return { ...probe, readyProxyMs: (backend === 'spark' ? probe.firstInstancedDraw : probe.firstWebGpuReady) - probe.start,
        requests: (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter(entry => /\.js(?:\?|$)/.test(entry.name)).map(entry => ({ url: entry.name, start: entry.startTime, gzipBodyBytes: entry.encodedBodySize })) };
    }, backend);
    if (backend === 'webgpu' && process.env.PERF_GPU === 'hardware') {
      expect(measurement.devices.length).toBeGreaterThan(0);
      for (const adapter of measurement.devices) {
        expect(adapter.isFallbackAdapter).not.toBe(true);
        expect(`${adapter.vendor} ${adapter.architecture} ${adapter.description}`).not.toMatch(/swiftshader|software|llvmpipe/i);
        expect(adapter.vendor).toMatch(/nvidia|amd|intel|apple/i);
      }
    }
    // Diagnostic fence is sampled after readiness; never part of readiness latency.
    const queueCompletion = await page.evaluate(async () => {
      const start = performance.now();
      const devices = (window as any).__largeSplatDevices || [];
      await Promise.all(devices.map((device: any) => device.queue.onSubmittedWorkDone()));
      return { deviceCount: devices.length, elapsedMs: performance.now() - start, definition: 'Post-readiness WebGPU submitted-work completion only; not display presentation. Spark has no queue fence here.' };
    });
    const screenshot = await page.getByTestId('scene-3d').screenshot({ path: resolve(output, `${backend}-${count}-${run}.png`) });
    const screenshotPixels = await page.evaluate(async base64 => {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let redPixels = 0;
      for (let i = 0; i < rgba.length; i += 4) if (rgba[i] > 100 && rgba[i] > rgba[i + 1] * 1.6 && rgba[i] > rgba[i + 2] * 1.6) redPixels++;
      return { width: canvas.width, height: canvas.height, redPixels };
    }, screenshot.toString('base64'));
    expect(screenshotPixels.redPixels, 'Expected visible red Gaussian cloud in scene screenshot').toBeGreaterThan(500);
    await page.goto('about:blank');
    await expect(page.getByTestId('scene-3d')).toHaveCount(0);
    expect(errors).toEqual([]);
    const hash = createHash('sha256');
    const root = resolve(process.env.PERF_DIST || 'dist');
    for (const name of readdirSync(root, { recursive: true }).map(String).sort()) if (/\.(js|html|css|wasm)$/.test(name)) hash.update(name).update(readFileSync(resolve(root, name)));
    writeFileSync(path, JSON.stringify({ backend, run, renderer, browser: browser.version(), buildSha256: hash.digest('hex'),
      fixture: metadata, measurement, queueCompletion, screenshotPixels, errors,
      cleanup: 'Navigated to about:blank and verified scene removal; browser context closes after each test. This is document teardown, not a same-page cache/resource reclamation assertion.',
      definition: 'Prepared native-file large binary PLY drop to first completed Spark-program instanced draw call to scene default framebuffer (draw-submission proxy), or in-page observed ready canvas opacity (WebGPU). Different backend proxies; not GPU presentation fences or sustained throughput. Screenshot red-pixel assertion validates visible content; manual visual review remains useful.' }, null, 2));
  });
}
