import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus, platform, release } from 'node:os';
import { STORAGE_KEYS } from '../../src/store/migration';

const repetitions = Number(process.env.PERF_REPETITIONS || 5);
const output = resolve('.tmp/performance/render-runs', process.env.PERF_RUN || 'demand');
const buildHash = createHash('sha256');
for (const name of readdirSync('dist', { recursive: true }).map(String).sort()) {
  if (/\.(js|html|css|wasm)$/.test(name)) buildHash.update(name).update(readFileSync(resolve('dist', name)));
}
const buildSha256 = buildHash.digest('hex');
test.use({ screenshot: 'only-on-failure' });

async function drawnFrames(page: Page): Promise<number> {
  return page.evaluate(() => (window as any).__renderProbe.frames);
}

async function settle(page: Page): Promise<void> {
  let previous = -1;
  let lastChange = Date.now();
  await expect.poll(async () => {
    const count = await drawnFrames(page);
    if (count !== previous) { previous = count; lastChange = Date.now(); }
    return Date.now() - lastChange;
  }, { intervals: [100, 200, 300], timeout: 30000 }).toBeGreaterThan(1200);
}

test.describe('production demand scene rendering', () => {
  test.skip(process.env.PERF_RENDER_IDLE !== '1', 'Opt-in render measurement; uses actual WebGL draw calls');
  for (let repetition = 0; repetition < repetitions; repetition++) {
    test(`settled point scene and wake parity ${repetition + 1}`, async ({ page, browser }) => {
      await page.addInitScript(key => {
        localStorage.setItem(key, JSON.stringify({ state: {
          selectionColorMode: 'static', autoRotateMode: 'off', pointerLock: false,
        }, version: 3 }));
        const probe = { frames: 0, drawCalls: 0, textureUploads: 0, decodes: 0, delayDecodes: false,
          lastDrawFrame: -1, lastDrawTime: 0, lastDecodeIdleGapMs: 0 };
        (window as any).__renderProbe = probe;
        let frameStamp = 0;
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = callback => raf(time => { frameStamp = time; callback(time); });
        for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
          if (!Context) continue;
          for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
            const prototype = Context.prototype as any;
            if (!Object.prototype.hasOwnProperty.call(prototype, name)) continue;
            const original = prototype[name];
            if (!original) continue;
            prototype[name] = function (...args: any[]) {
              if (this.canvas?.closest?.('[data-testid="scene-3d"]')) {
                probe.drawCalls++;
                probe.lastDrawTime = performance.now();
                if (probe.lastDrawFrame !== frameStamp) { probe.lastDrawFrame = frameStamp; probe.frames++; }
              }
              return original.apply(this, args);
            };
          }
          for (const name of ['texImage2D', 'texSubImage2D']) {
            const prototype = Context.prototype as any;
            if (!Object.prototype.hasOwnProperty.call(prototype, name)) continue;
            const original = prototype[name];
            prototype[name] = function (...args: any[]) {
              if (this.canvas?.closest?.('[data-testid="scene-3d"]')) probe.textureUploads++;
              return original.apply(this, args);
            };
          }
        }
        const createBitmap = window.createImageBitmap.bind(window);
        window.createImageBitmap = (async (...args: any[]) => {
          if (probe.delayDecodes) await new Promise(done => setTimeout(done, 1500));
          const bitmap = await (createBitmap as any)(...args);
          probe.decodes++;
          if (probe.delayDecodes) probe.lastDecodeIdleGapMs = performance.now() - probe.lastDrawTime;
          return bitmap;
        }) as typeof createImageBitmap;
      }, STORAGE_KEYS.camera);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (['warning', 'error'].includes(message.type()) && /detached|disposed|tex(?:ture|Image|SubImage)/i.test(message.text())) {
          errors.push(`console.${message.type()}: ${message.text()}`);
        }
      });
      await page.goto('/');
      await expect(page.getByTestId('drop-zone')).toBeVisible();
      const dismiss = page.getByRole('button', { name: 'Dismiss this panel', exact: true });
      if (await dismiss.isVisible()) await dismiss.click();
      await page.evaluate(async () => {
        const files = await Promise.all(['cameras.bin', 'images.bin', 'points3D.bin'].map(async name => {
          const response = await fetch(`/fixtures/small/${name}`);
          return new File([await response.arrayBuffer()], name);
        }));
        const image = document.createElement('canvas'); image.width = 64; image.height = 64;
        const context = image.getContext('2d')!;
        context.fillStyle = '#ed3565'; context.fillRect(0, 0, 64, 64);
        const blob = await new Promise<Blob>(done => image.toBlob(blob => done(blob!)));
        files.push(new File([blob], 'image-00001.png', { type: 'image/png' }));
        const drop = (files: File[]) => {
          const dataTransfer = new DataTransfer();
          files.forEach(file => dataTransfer.items.add(file));
          const event = new DragEvent('drop', { bubbles: true, cancelable: true });
          Object.defineProperty(event, 'dataTransfer', { value: {
            types: ['Files'], files: dataTransfer.files,
            items: files.map(file => ({ kind: 'file', getAsFile: () => file,
              webkitGetAsEntry: () => ({ isFile: true, isDirectory: false, name: file.name, file: (callback: (f: File) => void) => callback(file) }) })),
          } });
          document.querySelector('[data-testid="drop-zone"]')!.dispatchEvent(event);
        };
        (window as any).__dropRenderFixture = drop;
        drop(files);
      });
      await expect(page.getByText('image-00001.png', { exact: true }).first()).toBeVisible({ timeout: 120000 });
      await expect.poll(() => drawnFrames(page)).toBeGreaterThan(0);
      await page.mouse.move(1, 1);
      await settle(page);
      const idle = await page.evaluate(() => new Promise(resolve => {
        const before = { ...(window as any).__renderProbe };
        const start = performance.now();
        setTimeout(() => {
          const after = (window as any).__renderProbe;
          resolve({ durationMs: performance.now() - start, renderedFrames: after.frames - before.frames,
            drawCalls: after.drawCalls - before.drawCalls });
        }, 10000);
      })) as { durationMs: number; renderedFrames: number; drawCalls: number };
      mkdirSync(output, { recursive: true });
      writeFileSync(resolve(output, `${repetition}-idle.json`), JSON.stringify(idle, null, 2));
      expect(idle.renderedFrames).toBeLessThanOrEqual(10);
      const canvas = page.getByTestId('scene-3d').locator('canvas').first();
      const bounds = await canvas.boundingBox();
      expect(bounds).not.toBeNull();
      const center = { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 };
      const wakes: Record<string, number> = {};
      let before = await drawnFrames(page);
      await page.mouse.move(center.x, center.y);
      await page.mouse.wheel(0, -200);
      await expect.poll(() => drawnFrames(page)).toBeGreaterThan(before);
      await settle(page);
      wakes.wheel = (await drawnFrames(page)) - before;
      expect(wakes.wheel).toBeGreaterThan(1);

      before = await drawnFrames(page);
      await page.mouse.down();
      await page.mouse.move(center.x + 80, center.y + 40, { steps: 8 });
      await page.mouse.up();
      await settle(page);
      wakes.orbit = (await drawnFrames(page)) - before;
      expect(wakes.orbit).toBeGreaterThan(1);

      before = await drawnFrames(page);
      await page.keyboard.down('w');
      await expect.poll(() => drawnFrames(page)).toBeGreaterThan(before + 3);
      await page.keyboard.up('w');
      await settle(page);
      wakes.keyboard = (await drawnFrames(page)) - before;

      before = await drawnFrames(page);
      const uploadsBefore = await page.evaluate(() => {
        (window as any).__renderProbe.delayDecodes = true;
        return (window as any).__renderProbe.textureUploads as number;
      });
      // Tab is the supported keyboard wake for filename overlays after viewer idle.
      await page.keyboard.press('Tab');
      await page.getByText('image-00001.png', { exact: true }).first().click({ button: 'right' });
      await settle(page);
      wakes.goto = (await drawnFrames(page)) - before;
      expect(wakes.goto).toBeGreaterThan(1);
      writeFileSync(resolve(output, `${repetition}-wake.json`), JSON.stringify({ wakes, errors,
        probe: await page.evaluate(() => ({ ...(window as any).__renderProbe })),
      }, null, 2));

      await expect.poll(() => page.evaluate(() => (window as any).__renderProbe.textureUploads as number), { timeout: 10000 }).toBeGreaterThan(uploadsBefore);
      await settle(page);
      const texture = await page.evaluate(() => ({ decodes: (window as any).__renderProbe.decodes,
        textureUploads: (window as any).__renderProbe.textureUploads,
        decodeIdleGapMs: (window as any).__renderProbe.lastDecodeIdleGapMs }));
      expect(texture.decodeIdleGapMs).toBeGreaterThan(100);
      await page.mouse.move(1, 1);
      await expect(page.getByTestId('image-gallery-hover-card')).toHaveCount(0);
      await canvas.screenshot({ path: resolve(output, `${repetition}-texture.png`) });

      // Auto-rotation must retain a continuous loop, then return to idle when disabled.
      before = await drawnFrames(page);
      await page.mouse.move(center.x, center.y);
      await page.keyboard.press('o');
      await expect.poll(() => drawnFrames(page)).toBeGreaterThan(before + 10);
      await page.keyboard.press('o');
      await page.keyboard.press('o');
      await settle(page);
      expect(errors).toEqual([]);
      await page.mouse.move(1, 1);
      await expect(page.getByTestId('image-gallery-hover-card')).toHaveCount(0);
      await canvas.screenshot({ path: resolve(output, `${repetition}.png`) });
      const renderer = await canvas.evaluate(element => {
        const gl = (element as HTMLCanvasElement).getContext('webgl2');
        const debug = gl?.getExtension('WEBGL_debug_renderer_info');
        return debug ? gl!.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string : 'unavailable';
      });
      writeFileSync(resolve(output, `${repetition}.json`), JSON.stringify({
        repetition, idle, wakes, texture, renderer, browser: browser.version(), viewport: page.viewportSize(),
        buildSha256, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        dirtyPatchSha256: createHash('sha256').update(execFileSync('git', ['diff', '--binary', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] })).digest('hex'),
        environment: { cpu: cpus()[0]?.model, os: `${platform()} ${release()}`, dpr: 1, backend: 'WebGL point cloud' },
        fixture: JSON.parse(readFileSync('.tmp/performance/fixtures/small/metadata.json', 'utf8')),
        definition: 'Rendered frames count distinct animation timestamps containing an actual WebGL draw call; the probe schedules no animation callbacks.',
        limitations: [
          ...(/swiftshader|llvmpipe|software|basic render|warp/i.test(renderer) ? ['Software GPU timings are not hardware performance'] : []),
          ...(renderer === 'unavailable' ? ['GPU renderer identity is unavailable'] : []),
          'Draw counts and wake checks do not measure GPU presentation latency',
          'Splat backends and recording retain continuous fallback',
        ],
      }, null, 2));
    });
  }
});
