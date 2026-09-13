import { test as base, expect, type CDPSession, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Matrix4, Vector3 } from 'three';
import { STORAGE_KEYS } from '../../src/store/migration';
import { parsePoints3DBinary } from '../../src/parsers/points3d';
import { Scene3DPageObject } from '../fixtures/page-objects/scene-3d';

type MatrixSample = { at: number; modelView: number[]; projection: number[]; pointCount: number };
type InteractionProbe = {
  frames: number; drawCalls: number; smallPointDrawCalls: number; lastFrameStamp: number;
  lastDrawTime: number; lastPointCounts: number[]; sample: MatrixSample | null;
  samples: MatrixSample[]; captureSamples: boolean;
  visibility: Array<{ at: number; state: string; trusted: boolean }>;
  touch: Array<{ type: string; trusted: boolean; count: number }>;
};
declare global { interface Window { __interactionProbe?: InteractionProbe } }

const output = resolve('.tmp/performance/interaction-runs', process.env.PERF_RUN || 'interactions');
const distribution = resolve(process.env.PERF_DIST || 'dist');
const headed = process.env.PERF_INTERACTION_HEADED === '1';
const runs = new WeakMap<Page, { errors: string[]; checks: Record<string, unknown>; unsupported: string[] }>();
const nativeWindowBounds = new WeakMap<Page, unknown>();

// Extend the configured fixture so GPU/channel/default-argument settings remain
// intact. This changes only this opt-in spec, never the shared configuration.
const test = base.extend({
  launchOptions: async ({ launchOptions }, use) => {
    await use(headed ? { ...launchOptions, args: [
      ...(launchOptions.args || []).filter(argument => !argument.startsWith('--window-position=')),
      '--window-position=-32000,-32000',
    ] } : launchOptions);
  },
});

test.use({ headless: !headed, screenshot: 'only-on-failure' });

async function observe(page: Page): Promise<InteractionProbe> {
  return page.evaluate(() => {
    if (!window.__interactionProbe) throw new Error('WebGL observation was not installed');
    return window.__interactionProbe;
  });
}

function matrixDifference(first: number[], second: number[], rotationOnly = false): number {
  return Math.max(...first.map((value, index) => rotationOnly && (index >= 12 || index % 4 === 3)
    ? 0 : Math.abs(value - second[index])));
}

async function settle(page: Page): Promise<MatrixSample> {
  let previous = -1;
  let lastChange = Date.now();
  await expect.poll(async () => {
    const { frames } = await observe(page);
    if (frames !== previous) { previous = frames; lastChange = Date.now(); }
    return Date.now() - lastChange;
  }, { intervals: [100, 200, 300], timeout: 20000 }).toBeGreaterThan(1000);
  const sample = (await observe(page)).sample;
  expect(sample).not.toBeNull();
  return sample!;
}

async function frameWindow(page: Page, durationMs = 700): Promise<number> {
  return page.evaluate(duration => new Promise<number>(done => {
    const before = window.__interactionProbe!.frames;
    setTimeout(() => done(window.__interactionProbe!.frames - before), duration);
  }), durationMs);
}

async function loadScene(page: Page, options: { selection?: 'static' | 'rainbow'; recording?: 'gif' | 'webm' | 'mp4'; gotoDuration?: number } = {}) {
  await page.addInitScript(({ keys, settings }) => {
    localStorage.setItem(keys.camera, JSON.stringify({ state: {
      selectionColorMode: settings.selection || 'static', autoRotateMode: 'off', pointerLock: false,
      flyTransitionDuration: settings.gotoDuration || 600,
    }, version: 3 }));
    localStorage.setItem(keys.export, JSON.stringify({ state: {
      screenshotSize: '512x512', screenshotFormat: 'png', gifDuration: 5, gifDownsample: 4,
      recordingQuality: 'low', recordingFormat: settings.recording || 'webm', gifSpeed: 1,
    }, version: 0 }));
    const probe: InteractionProbe = {
      frames: 0, drawCalls: 0, smallPointDrawCalls: 0, lastFrameStamp: -1, lastDrawTime: 0,
      lastPointCounts: [], sample: null, samples: [], captureSamples: false, visibility: [], touch: [],
    };
    window.__interactionProbe = probe;
    let frameStamp = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => raf(time => { frameStamp = time; callback(time); });
    const activePrograms = new WeakMap<object, object>();
    const locations = new WeakMap<object, { program: object; name: string }>();
    const matrices = new WeakMap<object, Record<string, number[]>>();
    for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!Context) continue;
      const prototype = Context.prototype as any;
      const wrap = (name: string, observer: (context: any, args: any[], result: any) => void) => {
        if (!Object.prototype.hasOwnProperty.call(prototype, name)) return;
        const original = prototype[name];
        prototype[name] = function (...args: any[]) {
          const result = original.apply(this, args);
          if (this.canvas?.closest?.('[data-testid="scene-3d"]')) observer(this, args, result);
          return result;
        };
      };
      wrap('useProgram', (context, args) => { if (args[0]) activePrograms.set(context, args[0]); });
      wrap('getUniformLocation', (_context, args, result) => {
        if (result) locations.set(result, { program: args[0], name: args[1] });
      });
      wrap('uniformMatrix4fv', (_context, args) => {
        const location = args[0] && locations.get(args[0]);
        if (!location || !['modelViewMatrix', 'projectionMatrix'].includes(location.name)) return;
        const values = matrices.get(location.program) || {};
        values[location.name] = Array.from(args[2] as ArrayLike<number>).slice(args[3] || 0, (args[3] || 0) + 16);
        matrices.set(location.program, values);
      });
      for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        wrap(name, (context, args) => {
          probe.drawCalls++;
          probe.lastDrawTime = performance.now();
          if (probe.lastFrameStamp !== frameStamp) {
            probe.lastFrameStamp = frameStamp;
            probe.frames++;
            probe.lastPointCounts = [];
          }
          if (args[0] !== context.POINTS) return;
          const count = name.startsWith('drawArrays') ? args[2] : args[1];
          probe.lastPointCounts.push(count);
          if (count === 1) probe.smallPointDrawCalls++;
          const program = activePrograms.get(context);
          const values = program && matrices.get(program);
          if (!values?.modelViewMatrix || !values.projectionMatrix || count < 10000) return;
          probe.sample = { at: performance.now(), pointCount: count,
            modelView: values.modelViewMatrix, projection: values.projectionMatrix };
          if (probe.captureSamples) {
            probe.samples.push(probe.sample);
            if (probe.samples.length > 600) probe.samples.shift();
          }
        });
      }
    }
    document.addEventListener('visibilitychange', event => {
      probe.visibility.push({ at: performance.now(), state: document.visibilityState, trusted: event.isTrusted });
    });
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      document.addEventListener(type, event => {
        const touch = event as TouchEvent;
        probe.touch.push({ type, trusted: event.isTrusted, count: touch.touches.length });
      }, { capture: true, passive: true });
    }
  }, { keys: STORAGE_KEYS, settings: options });
  await page.goto('/');
  await expect(page.getByTestId('drop-zone')).toBeVisible();
  const dismiss = page.getByRole('button', { name: 'Dismiss this panel', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
  // Same local binary fixture and real drop workflow as the existing production probe.
  await page.evaluate(async () => {
    const files = await Promise.all(['cameras.bin', 'images.bin', 'points3D.bin'].map(async name => {
      const response = await fetch(`/fixtures/small/${name}`);
      if (!response.ok) throw new Error(`Fixture ${name}: HTTP ${response.status}`);
      return new File([await response.arrayBuffer()], name);
    }));
    const dataTransfer = new DataTransfer();
    files.forEach(file => dataTransfer.items.add(file));
    const event = new DragEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: {
      types: ['Files'], files: dataTransfer.files,
      items: files.map(file => ({ kind: 'file', getAsFile: () => file,
        webkitGetAsEntry: () => ({ isFile: true, isDirectory: false, name: file.name,
          file: (callback: (value: File) => void) => callback(file) }) })),
    } });
    document.querySelector('[data-testid="drop-zone"]')!.dispatchEvent(event);
  });
  const scene = new Scene3DPageObject(page);
  await scene.waitForCanvasReady();
  // Touch layouts may hide the gallery. The actual point draw proves parsing,
  // installation, and GPU upload completed independently of that layout.
  await expect.poll(async () => (await observe(page)).sample?.modelView.length, { timeout: 45000 }).toBe(16);
  return scene;
}

async function openPanel(page: Page, label: string): Promise<Locator> {
  const button = page.getByRole('button', { name: label, exact: true });
  await button.hover();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const id = await button.getAttribute('aria-controls');
  if (!id) throw new Error(`Panel ${label} has no accessible target`);
  return page.locator(`[id="${id}"]`);
}

async function decodeImage(page: Page, bytes: Buffer, mimeType: string) {
  return page.evaluate(async ({ data, mime }) => {
    const image = new Image();
    image.src = `data:${mime};base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    // The fixture's camera bounds can place points near an edge. Exclude only the
    // watermark strip; colorful scene pixels distinguish points from the gray grid.
    const pixels = context.getImageData(0, 0, canvas.width, Math.floor(canvas.height * 0.9)).data;
    let colorful = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2])
        - Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) > 25 && pixels[index + 3] > 0) colorful++;
    }
    return { width: canvas.width, height: canvas.height, colorful };
  }, { data: bytes.toString('base64'), mime: mimeType });
}

async function touchGesture(page: Page, session: CDPSession, starts: Array<{ x: number; y: number }>, ends: Array<{ x: number; y: number }>, cancel = false) {
  const points = (fraction: number) => starts.map((start, index) => ({ id: index + 1,
    x: start.x + (ends[index].x - start.x) * fraction,
    y: start.y + (ends[index].y - start.y) * fraction, radiusX: 10, radiusY: 10, force: 1 }));
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(0) });
  for (let index = 1; index <= 10; index++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(index / 10) });
    // Gesture pacing supplies real velocity samples; this is not a readiness sleep.
    await new Promise(done => setTimeout(done, 20));
  }
  await session.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  return (await observe(page)).frames;
}

test.describe('production interaction parity', () => {
  test.skip(process.env.PERF_INTERACTIONS !== '1', 'Opt-in real browser interaction validation');

  test.beforeEach(async ({ page }) => {
    mkdirSync(output, { recursive: true });
    const state = { errors: [] as string[], checks: {}, unsupported: [] as string[] };
    runs.set(page, state);
    page.on('pageerror', error => state.errors.push(error.message));
    page.on('console', message => {
      if (['warning', 'error'].includes(message.type()) && /detached|disposed|tex(?:ture|Image|SubImage)|recording failed|encoder error/i.test(message.text())) {
        state.errors.push(`console.${message.type()}: ${message.text()}`);
      }
    });
    if (headed) {
      const session = await page.context().newCDPSession(page);
      let unavailable: string | undefined;
      try {
        const { windowId } = await session.send('Browser.getWindowForTarget');
        await session.send('Browser.setWindowBounds', { windowId,
          bounds: { windowState: 'normal' } });
        await session.send('Browser.setWindowBounds', { windowId,
          bounds: { left: -32000, top: -32000 } });
        const { bounds } = await session.send('Browser.getWindowBounds', { windowId });
        nativeWindowBounds.set(page, bounds);
        // Refuse to continue an interaction run if the window manager clamps
        // the requested offscreen window back onto the user's desktop.
        if (bounds.left !== -32000 || bounds.top !== -32000 || bounds.windowState !== 'normal') {
          unavailable = `Native window manager did not retain an offscreen normal window: ${JSON.stringify(bounds)}`;
        } else {
          await page.bringToFront();
          if (await page.evaluate(() => document.visibilityState) !== 'visible') {
            unavailable = 'The offscreen headed page is already natively hidden; it cannot establish the initial visible state';
          }
        }
      } catch (error) {
        unavailable = `Native offscreen window control is unavailable: ${String(error)}`;
      } finally { await session.detach(); }
      if (unavailable) {
        state.unsupported.push(unavailable);
        test.skip(true, unavailable);
      }
    }
  });

  test.afterEach(async ({ page, browser }, testInfo) => {
    const state = runs.get(page);
    if (!state) return;
    const probe = await observe(page).catch(() => null);
    const renderer = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="scene-3d"] canvas');
      const gl = canvas?.getContext('webgl2');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return debug ? String(gl!.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'unavailable';
    }).catch(() => 'unavailable');
    const build = createHash('sha256');
    for (const name of readdirSync(distribution, { recursive: true }).map(String).sort()) {
      if (/\.(js|html|css|wasm)$/.test(name)) build.update(name).update(readFileSync(resolve(distribution, name)));
    }
    mkdirSync(output, { recursive: true });
    writeFileSync(resolve(output, `${testInfo.title.replace(/[^a-z0-9]+/gi, '-')}.json`), JSON.stringify({
      test: testInfo.title, status: testInfo.status, browser: browser.version(), renderer,
      browserMode: headed ? 'headed offscreen' : 'headless',
      nativeWindowBounds: nativeWindowBounds.get(page) || null,
      buildSha256: build.digest('hex'), viewport: page.viewportSize(),
      fixture: JSON.parse(readFileSync('.tmp/performance/fixtures/small/metadata.json', 'utf8')),
      ...state, probe,
      definition: 'Observes actual WebGL draws and uploaded point-cloud view/projection matrices; no observer-owned rAF loop.',
      limitations: ['Browser-emulated native touch is not a physical touch-device test', 'Functional checks do not measure GPU presentation latency'],
    }, null, 2));
    expect(state.errors).toEqual([]);
  });

  test('static demand wakes for actual point hover and picking, then exports a valid scene PNG', async ({ page }) => {
    const scene = await loadScene(page);
    await settle(page);
    expect(await frameWindow(page)).toBeLessThanOrEqual(2);
    const panel = await openPanel(page, 'Align tools');
    await panel.getByRole('button', { name: '2-Point Scale', exact: true }).click();
    await expect(page.getByText('Select P1', { exact: true })).toBeVisible();
    await settle(page);
    const sample = (await observe(page)).sample!;
    const bounds = (await scene.getCanvasBoundingBox())!;
    const bytes = readFileSync('.tmp/performance/fixtures/small/points3D.bin');
    const points = parsePoints3DBinary(Uint8Array.from(bytes).buffer);
    const view = new Matrix4().fromArray(sample.modelView);
    const projection = new Matrix4().fromArray(sample.projection);
    const targets = [...points.values()].map(point => {
      const projected = new Vector3(...point.xyz).applyMatrix4(view).applyMatrix4(projection);
      return { x: bounds.x + (projected.x + 1) * bounds.width / 2,
        y: bounds.y + (1 - projected.y) * bounds.height / 2, z: projected.z };
    }).filter(point => point.z > -1 && point.z < 1 && point.x > bounds.x + 40
      && point.x < bounds.x + bounds.width - 250 && point.y > bounds.y + 65
      && point.y < bounds.y + bounds.height - 50);
    expect(targets.length).toBeGreaterThan(2);
    const first = targets[0];
    const second = targets.find(point => Math.hypot(point.x - first.x, point.y - first.y) > 90);
    expect(second).toBeDefined();
    const hoverBefore = (await observe(page)).smallPointDrawCalls;
    await page.mouse.move(first.x, first.y);
    await expect.poll(async () => (await observe(page)).smallPointDrawCalls).toBeGreaterThan(hoverBefore);
    await settle(page);
    expect((await observe(page)).lastPointCounts).toContain(1);
    await page.mouse.click(first.x, first.y);
    await expect(page.getByText('Select P2', { exact: true })).toBeVisible();
    await page.mouse.move(second!.x, second!.y);
    await page.mouse.click(second!.x, second!.y);
    const distance = page.getByTitle('Target distance', { exact: true });
    await expect(distance).toBeVisible();
    expect(Number(await distance.inputValue())).toBeGreaterThan(0);
    await page.getByTitle('Cancel', { exact: true }).click();
    await expect(distance).toBeHidden();
    await settle(page);

    const downloadPending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save screenshot', exact: true }).click();
    const download = await downloadPending;
    mkdirSync(output, { recursive: true });
    const path = resolve(output, 'scene-screenshot.png');
    await download.saveAs(path);
    const screenshot = readFileSync(path);
    expect(screenshot.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const image = await decodeImage(page, screenshot, 'image/png');
    expect(image).toMatchObject({ width: 512, height: 512 });
    expect(image.colorful).toBeGreaterThan(20);
    runs.get(page)!.checks = { pointHoverDraw: true, twoPickedPoints: true, screenshot: image, bytes: screenshot.length };
  });

  test('configured animated selection keeps continuous frames before and after the first image click', async ({ page }) => {
    const scene = await loadScene(page, { selection: 'rainbow' });
    const before = await frameWindow(page);
    expect(before).toBeGreaterThan(10);
    await page.getByText('image-00001.png', { exact: true }).first().click();
    await expect(page.getByTestId('image-gallery-hover-card')).toContainText('Left: details');
    const selected = await frameWindow(page);
    expect(selected).toBeGreaterThan(10);
    await page.keyboard.press('Escape');
    const after = await frameWindow(page);
    expect(after).toBeGreaterThan(10);
    await scene.canvas.screenshot({ path: resolve(output, 'animated-selection.png') });
    runs.get(page)!.checks = { unselectedFrames: before, selectedFrames: selected, afterEscapeFrames: after };
  });

  test.describe('native touch controls', () => {
    test.use({ hasTouch: true, isMobile: true });
    test('one-finger inertia, two-finger pinch and pan, and cancellation change the rendered view and settle', async ({ page, context }) => {
      const scene = await loadScene(page);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches && matchMedia('(hover: none)').matches)).toBe(true);
      const session = await context.newCDPSession(page);
      const bounds = (await scene.getCanvasBoundingBox())!;
      const center = { x: bounds.x + bounds.width * 0.5, y: bounds.y + bounds.height * 0.5 };
      const initial = await settle(page);
      const releasedAt = await touchGesture(page, session, [center], [{ x: center.x + 100, y: center.y + 45 }]);
      const rotated = await settle(page);
      expect((await observe(page)).frames - releasedAt).toBeGreaterThan(1);
      expect(matrixDifference(initial.modelView, rotated.modelView, true)).toBeGreaterThan(0.001);

      await touchGesture(page, session,
        [{ x: center.x - 55, y: center.y }, { x: center.x + 55, y: center.y }],
        [{ x: center.x - 95, y: center.y }, { x: center.x + 95, y: center.y }]);
      const zoomed = await settle(page);
      expect(matrixDifference(rotated.modelView, zoomed.modelView)).toBeGreaterThan(0.01);
      expect(matrixDifference(rotated.modelView, zoomed.modelView, true)).toBeLessThan(0.001);

      await touchGesture(page, session,
        [{ x: center.x - 65, y: center.y }, { x: center.x + 65, y: center.y }],
        [{ x: center.x - 20, y: center.y + 35 }, { x: center.x + 110, y: center.y + 35 }], true);
      const panned = await settle(page);
      expect(matrixDifference(zoomed.modelView, panned.modelView)).toBeGreaterThan(0.01);
      expect(matrixDifference(zoomed.modelView, panned.modelView, true)).toBeLessThan(0.001);
      const touch = (await observe(page)).touch;
      expect(touch.some(event => event.type === 'touchcancel')).toBe(true);
      expect(touch.every(event => event.trusted)).toBe(true);
      expect(await frameWindow(page)).toBeLessThanOrEqual(2);
      await scene.canvas.screenshot({ path: resolve(output, 'touch-controls.png') });
      runs.get(page)!.checks = { initial, rotated, zoomed, panned, trustedNativeTouchEvents: touch.length };
    });
  });

  test('real page visibility return resumes a paused goto instead of finishing in one frame', async ({ page, context }) => {
    const scene = await loadScene(page, { gotoDuration: 2000 });
    await settle(page);
    const session = await context.newCDPSession(page);
    // Playwright enables focus emulation for every main page (crPage.js). Remove
    // that forced-active state before testing native window/tab visibility.
    try {
      await session.send('Emulation.setFocusEmulationEnabled', { enabled: false });
      await page.bringToFront();
      await expect.poll(() => page.evaluate(() => document.visibilityState), { timeout: 2500 }).toBe('visible');
    } catch (setupError) {
      const reason = `Native visible state was unavailable after disabling Playwright focus emulation: ${String(setupError)}`;
      runs.get(page)!.unsupported.push(reason);
      test.skip(true, reason);
    }
    // Setup may itself change focus. Only subsequent native window/tab events
    // belong to the visibility evidence collected below.
    await page.evaluate(() => { window.__interactionProbe!.visibility = []; });
    let windowId: number | undefined;
    let alternate: Page | undefined;
    let visibilityMethod = 'native window minimize';
    const unavailableMethods: string[] = [];
    const hide = async () => {
      if (alternate) await alternate.bringToFront();
      else {
        if (windowId === undefined) throw new Error('Native browser window is unavailable');
        await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
      }
    };
    const restore = async () => {
      if (windowId !== undefined) {
        await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
        if (headed) await session.send('Browser.setWindowBounds', { windowId,
          bounds: { left: -32000, top: -32000 } });
      }
      await page.bringToFront();
    };
    // Verify native capability first; never replace document.hidden or dispatch a fake event.
    try {
      ({ windowId } = await session.send('Browser.getWindowForTarget'));
      await hide();
      await expect.poll(() => page.evaluate(() => document.hidden), { timeout: 2500 }).toBe(true);
    } catch (error) {
      await restore();
      unavailableMethods.push(`Native minimize did not hide this browser page: ${String(error)}`);
      visibilityMethod = 'native background tab';
      alternate = await context.newPage();
      await page.bringToFront();
      try {
        await hide();
        await expect.poll(() => page.evaluate(() => document.hidden), { timeout: 2500 }).toBe(true);
      } catch (tabError) {
        await restore();
        await alternate.close();
        const reason = `Neither native minimize nor a real tab switch hid this page: ${String(tabError)}`;
        runs.get(page)!.unsupported.push(reason);
        runs.get(page)!.checks = { focusEmulationDisabled: true, unavailableMethods };
        test.skip(true, reason);
      }
    }
    try {
      await restore();
      await expect.poll(() => page.evaluate(() => document.visibilityState), { timeout: 2500 }).toBe('visible');
    } catch (restoreError) {
      await alternate?.close();
      const reason = `Native window/tab activation did not restore page visibility: ${String(restoreError)}`;
      runs.get(page)!.unsupported.push(reason);
      runs.get(page)!.checks = { focusEmulationDisabled: true, visibilityMethod, unavailableMethods };
      test.skip(true, reason);
    }
    await settle(page);
    const initial = (await observe(page)).sample!;
    await page.evaluate(() => { window.__interactionProbe!.samples = []; window.__interactionProbe!.captureSamples = true; });
    await page.keyboard.press('Tab');
    await page.getByText('image-00001.png', { exact: true }).first().click({ button: 'right' });
    await expect.poll(async () => matrixDifference(initial.modelView, (await observe(page)).sample!.modelView)).toBeGreaterThan(0.001);
    try {
      await hide();
      await expect.poll(() => page.evaluate(() => document.hidden)).toBe(true);
      // Longer than the configured goto, so an unpaused animation would finish immediately on return.
      await new Promise(done => setTimeout(done, 2500));
    } finally { await restore(); }
    await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
    const final = await settle(page);
    const probe = await observe(page);
    const visibleAt = probe.visibility.filter(event => event.state === 'visible').at(-1)!.at;
    const resumed = probe.samples.filter(sample => sample.at >= visibleAt);
    expect(resumed.length).toBeGreaterThan(10);
    expect(matrixDifference(resumed[0].modelView, final.modelView)).toBeGreaterThan(0.01);
    expect(probe.visibility.every(event => event.trusted)).toBe(true);
    const beforeWheel = probe.frames;
    await scene.scrollCanvas(-80);
    await settle(page);
    expect((await observe(page)).frames).toBeGreaterThan(beforeWheel);
    await alternate?.close();
    runs.get(page)!.checks = { focusEmulationDisabled: true, visibilityMethod, unavailableMethods, nativeVisibilityEvents: probe.visibility, resumedFrames: resumed.length,
      firstVisibleMatrix: resumed[0].modelView, finalMatrix: final.modelView };
  });

  const recordingFormats = (process.env.PERF_RECORDING_FORMATS || 'webm').split(',');
  for (const format of (['webm', 'gif', 'mp4'] as const).filter(value => recordingFormats.includes(value))) {
    test(`static scene records a playable ${format} while continuous fallback runs, then settles`, async ({ page }) => {
      await loadScene(page, { recording: format });
      const supported = await page.evaluate(async nextFormat => {
        if (nextFormat === 'gif') return { supported: true };
        if (nextFormat === 'webm') return { supported: typeof MediaRecorder !== 'undefined'
          && MediaRecorder.isTypeSupported('video/webm') };
        if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return { supported: false };
        const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="scene-3d"] canvas')!;
        return VideoEncoder.isConfigSupported({ codec: 'avc1.64001f', width: Math.floor(canvas.width / 4) & ~1,
          height: Math.floor(canvas.height / 4) & ~1, bitrate: 2000000, framerate: 30 });
      }, format);
      if (!supported.supported) {
        const reason = `${format} encoder capability is unavailable in this browser`;
        runs.get(page)!.unsupported.push(reason);
        test.skip(true, reason);
      }
      await settle(page);
      expect(await frameWindow(page)).toBeLessThanOrEqual(2);
      const panel = await openPanel(page, 'Save screenshot');
      const downloadPending = page.waitForEvent('download', { timeout: 45000 });
      await panel.getByRole('button', { name: 'Record', exact: true }).click();
      await expect(panel.getByRole('button', { name: 'Recording...', exact: true })).toBeVisible({ timeout: 10000 });
      const duringFrames = await frameWindow(page, 1000);
      expect(duringFrames).toBeGreaterThan(15);
      const download = await downloadPending;
      mkdirSync(output, { recursive: true });
      const path = resolve(output, `scene-recording.${format}`);
      await download.saveAs(path);
      const bytes = readFileSync(path);
      expect(bytes.length).toBeGreaterThan(1000);
      let decoded: unknown;
      if (format === 'gif') {
        expect(bytes.subarray(0, 6).toString('ascii')).toMatch(/^GIF8[79]a$/);
        const image = await decodeImage(page, bytes, 'image/gif');
        expect(image.colorful).toBeGreaterThan(10);
        const frames = await page.evaluate(async data => {
          const Decoder = (window as any).ImageDecoder;
          if (!Decoder) return null;
          const decoder = new Decoder({ data: Uint8Array.from(atob(data), value => value.charCodeAt(0)), type: 'image/gif' });
          try { await decoder.tracks.ready; return decoder.tracks.selectedTrack.frameCount as number; }
          finally { decoder.close(); }
        }, bytes.toString('base64'));
        if (frames !== null) expect(frames).toBeGreaterThan(1);
        decoded = { ...image, frames };
      } else {
        const video = await page.evaluate(async ({ data, nextFormat }) => new Promise<{ width: number; height: number; colorful: number; duration: number | null }>((done, reject) => {
          const video = document.createElement('video');
          video.muted = true;
          const timer = setTimeout(() => reject(new Error('Downloaded video did not decode')), 10000);
          video.onerror = () => { clearTimeout(timer); reject(new Error(`Video decode error ${video.error?.message}`)); };
          video.addEventListener('loadeddata', () => { video.currentTime = 0.5; }, { once: true });
          video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            const context = canvas.getContext('2d', { willReadFrequently: true })!;
            context.drawImage(video, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, Math.floor(canvas.height * 0.9)).data;
            let colorful = 0;
            for (let index = 0; index < pixels.length; index += 4) {
              if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2])
                - Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) > 25) colorful++;
            }
            clearTimeout(timer);
            done({ width: video.videoWidth, height: video.videoHeight, colorful,
              duration: Number.isFinite(video.duration) ? video.duration : null });
            video.removeAttribute('src'); video.load();
          };
          video.src = `data:video/${nextFormat};base64,${data}`;
          video.load();
        }), { data: bytes.toString('base64'), nextFormat: format });
        expect(video.width).toBeGreaterThan(0);
        expect(video.height).toBeGreaterThan(0);
        expect(video.colorful).toBeGreaterThan(10);
        decoded = video;
      }
      await page.mouse.move(1, 1);
      await settle(page);
      expect(await frameWindow(page)).toBeLessThanOrEqual(2);
      runs.get(page)!.checks = { format, duringFrames, bytes: bytes.length, decoded, settledAfterRecording: true };
    });
  }
});
