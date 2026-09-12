import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const properties = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
const header = ['ply', 'format binary_little_endian 1.0', 'element vertex 27', ...properties.map(p => `property float ${p}`), 'end_header', ''].join('\n');
const rows = Buffer.alloc(27 * properties.length * 4);
let row = 0;
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
  const values = [x, y, z, 1.77245, -.8, -.8, 3, -2, -2, -2, 1, 0, 0, 0];
  values.forEach((value, column) => rows.writeFloatLE(value, (row * properties.length + column) * 4));
  row++;
}
const bytes = Buffer.concat([Buffer.from(header), rows]);

for (const backend of ['spark', 'webgpu']) for (let run = 0; run < Number(process.env.PERF_REPETITIONS || 5); run++) {
  test(`${backend} first production splat frame ${run + 1}`, async ({ page, browser }) => {
    test.skip(process.env.PERF_SPLAT_STARTUP !== '1', 'Opt-in real splat backend first-frame measurement');
    const output = resolve('.tmp/performance/splat-runs', process.env.PERF_RUN || 'splat');
    mkdirSync(output, { recursive: true });
    const path = resolve(output, `${backend}-${run}.json`);
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
    await page.evaluate(base64 => {
      const array = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([array], 'startup-gaussians.ply'));
      const event = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: transfer });
      (window as any).__splatStartup.start = performance.now();
      document.querySelector('[data-testid="drop-zone"]')!.dispatchEvent(event);
    }, bytes.toString('base64'));
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
    await page.screenshot({ path: resolve(output, `${backend}-${run}.png`) });
    expect(errors).toEqual([]);
    const hash = createHash('sha256');
    const root = resolve(process.env.PERF_DIST || 'dist');
    for (const name of readdirSync(root, { recursive: true }).map(String).sort()) if (/\.(js|html|css|wasm)$/.test(name)) hash.update(name).update(readFileSync(resolve(root, name)));
    writeFileSync(path, JSON.stringify({ backend, run, renderer, browser: browser.version(), buildSha256: hash.digest('hex'),
      fixture: { splats: 27, fingerprint: createHash('sha256').update(bytes).digest('hex') }, measurement, errors,
      definition: 'Prepared local 27-Gaussian binary PLY drop to first completed Spark-program instanced draw call to scene default framebuffer (draw-submission proxy), or in-page observed ready canvas opacity (WebGPU). Different backend proxies; not GPU presentation fences or large-splat throughput.' }, null, 2));
  });
}
