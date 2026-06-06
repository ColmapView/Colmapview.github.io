import { expect, type Page } from '@playwright/test';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { test } from './fixtures/test-fixtures';
import type { ColmapManifest } from '../src/types/manifest';

interface SplatPsnrState {
  frameReady: boolean;
  computing: boolean;
  readyCount: number;
  status: string | null;
  error: string | null;
  metric: {
    psnr: number;
    mse: number;
    validPixelCount: number;
    width: number;
    height: number;
    renderBackground?: {
      label: 'opaque-black' | 'opaque-white';
      rgba: [number, number, number, number];
    };
    diagnostics?: {
      backgroundDiagnostics?: {
        baseline: {
          label: 'opaque-black' | 'opaque-white';
          rgba: [number, number, number, number];
        };
        alternatives: Array<{
          label: 'opaque-black' | 'opaque-white';
          rgba: [number, number, number, number];
        }>;
        best: {
          label: 'opaque-black' | 'opaque-white';
          rgba: [number, number, number, number];
        };
      };
    };
  } | null;
}

interface ScreenshotPixelDiff {
  width: number;
  height: number;
  changedPixelRatio: number;
  meanAbsChannelDelta: number;
  maxAbsChannelDelta: number;
}

interface ColmapWebViewE2EApi {
  getImageIds: () => number[];
  getSplatPsnrState: (imageId?: number | null) => SplatPsnrState;
  loadManifest: (manifest: ColmapManifest) => Promise<boolean>;
  requestSplatPsnrCompute: (scope: 'selected' | 'all', selectedImageId?: number | null) => void;
  setSelectedImageId: (imageId: number | null) => void;
  waitForRenderFrames: (count?: number) => Promise<void>;
}

interface DatasetServer {
  baseUrl: string;
  close: () => Promise<void>;
}

const DATASET_ENV = 'COLMAP_WEBVIEW_BICYCLE_DATASET';
const DEFAULT_MIN_PSNR = 15;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_PSNR_SCENE_CHANGED_PIXEL_RATIO = 0.02;
const MAX_PSNR_SCENE_MEAN_ABS_CHANNEL_DELTA = 5;
const BICYCLE_SPLAT_REQUIRED_LIMITS = {
  maxBufferSize: 900_000_000,
  maxStorageBufferBindingSize: 900_000_000,
};

const datasetPath = process.env[DATASET_ENV];
const configuredSelectedImageId = getOptionalEnvNumber('COLMAP_WEBVIEW_BICYCLE_IMAGE_ID');
const configuredMoveImageId = getOptionalEnvNumber('COLMAP_WEBVIEW_BICYCLE_MOVE_IMAGE_ID');
const minPsnr = getEnvNumber('COLMAP_WEBVIEW_BICYCLE_MIN_PSNR', DEFAULT_MIN_PSNR);
const bicycleTimeoutMs = getEnvNumber('COLMAP_WEBVIEW_BICYCLE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);

function getEnvNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getOptionalEnvNumber(name: string): number | null {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getContentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.bin':
    case '.ply':
    case '.spz':
      return 'application/octet-stream';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    default:
      return 'application/octet-stream';
  }
}

function sendStatus(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, {
    'access-control-allow-origin': '*',
    'content-type': 'text/plain; charset=utf-8',
  });
  response.end(message);
}

async function startDatasetServer(rootPath: string): Promise<DatasetServer> {
  const root = resolve(rootPath);
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  const rootStat = await stat(root);
  if (!rootStat.isDirectory()) {
    throw new Error(`Bicycle dataset path is not a directory: ${root}`);
  }

  const server = createServer(async (request, response) => {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-methods', 'GET,HEAD,OPTIONS');

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendStatus(response, 405, 'Method not allowed');
      return;
    }

    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const relativePath = decodeURIComponent(url.pathname)
        .replace(/^\/+/, '')
        .replace(/\//g, sep);
      if (!relativePath || relativePath.includes('\0')) {
        sendStatus(response, 404, 'Not found');
        return;
      }

      const filePath = resolve(root, relativePath);
      if (filePath !== root && !filePath.startsWith(rootPrefix)) {
        sendStatus(response, 403, 'Forbidden');
        return;
      }

      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        sendStatus(response, 404, 'Not found');
        return;
      }

      response.writeHead(200, {
        'access-control-allow-origin': '*',
        'accept-ranges': 'bytes',
        'content-length': String(fileStat.size),
        'content-type': getContentType(filePath),
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }

      const stream = createReadStream(filePath);
      stream.on('error', () => {
        response.destroy();
      });
      stream.pipe(response);
    } catch (error) {
      sendStatus(response, 404, error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Failed to allocate bicycle dataset server port');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) {
        rejectClose(error);
        return;
      }
      resolveClose();
    });
  });
}

function createBicycleManifest(baseUrl: string): ColmapManifest {
  return {
    version: 1,
    name: 'bicycle local WebGPU validation',
    baseUrl,
    files: {
      cameras: 'sparse/0/cameras.bin',
      images: 'sparse/0/images.bin',
      points3D: 'sparse/0/points3D.bin',
    },
    imagesPath: 'images/',
    splats: ['output/splat_30000.ply'],
  };
}

function watchFatalWebGpuConsoleMessages(page: Page): string[] {
  const messages: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (isFatalWebGpuConsoleMessage(text)) {
      messages.push(text);
    }
  });
  return messages;
}

function expectNoFatalWebGpuConsoleMessages(messages: string[]): void {
  expect(messages, messages.join('\n')).toEqual([]);
}

function isFatalWebGpuConsoleMessage(message: string): boolean {
  return [
    'exceeds the max buffer size limit',
    'larger than the maximum storage buffer binding size',
    '[Invalid Buffer',
    '[Invalid BindGroup',
    '[WebGPU Splats] Failed to initialize runtime',
    'Splat render session WebGPU validation failed',
  ].some((pattern) => message.includes(pattern));
}

async function waitForSceneProbe(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as Window & { __COLMAP_WEBVIEW_E2E__?: unknown }).__COLMAP_WEBVIEW_E2E__),
    null,
    { timeout: 10_000 }
  );
}

async function getHardwareWebGpuStatus(page: Page): Promise<{ ok: boolean; reason?: string }> {
  return page.evaluate(async (requiredLimits) => {
    const webGpuNavigator = navigator as Navigator & {
      gpu?: {
        requestAdapter(options?: { powerPreference?: 'high-performance' | 'low-power' }): Promise<{
          limits: {
            maxBufferSize: number;
            maxStorageBufferBindingSize: number;
          };
          requestDevice(options?: { requiredLimits?: typeof requiredLimits }): Promise<{ destroy(): void }>;
        } | null>;
      };
    };

    if (!webGpuNavigator.gpu) {
      return { ok: false, reason: 'navigator.gpu is unavailable' };
    }

    try {
      const adapter = await webGpuNavigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) {
        return { ok: false, reason: 'WebGPU adapter is unavailable' };
      }
      if (adapter.limits.maxBufferSize < requiredLimits.maxBufferSize) {
        return {
          ok: false,
          reason: `WebGPU adapter maxBufferSize ${adapter.limits.maxBufferSize} is below bicycle requirement ${requiredLimits.maxBufferSize}`,
        };
      }
      if (adapter.limits.maxStorageBufferBindingSize < requiredLimits.maxStorageBufferBindingSize) {
        return {
          ok: false,
          reason: `WebGPU adapter maxStorageBufferBindingSize ${adapter.limits.maxStorageBufferBindingSize} is below bicycle requirement ${requiredLimits.maxStorageBufferBindingSize}`,
        };
      }

      const device = await adapter.requestDevice({ requiredLimits });
      device.destroy();
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }, BICYCLE_SPLAT_REQUIRED_LIMITS);
}

async function waitForWebGpuSplatCanvasVisible(page: Page): Promise<void> {
  await expect(page.getByTestId('webgpu-splat-canvas')).toBeVisible({ timeout: bicycleTimeoutMs });
  await expect.poll(async () => {
    return page.getByTestId('webgpu-splat-canvas').evaluate((canvas) => getComputedStyle(canvas).opacity);
  }, { timeout: bicycleTimeoutMs }).toBe('1');
}

async function switchPointCloudToSplats(page: Page): Promise<void> {
  const pointCloudButton = page.locator('button[aria-label^="Point Cloud:"]').first();
  await expect(pointCloudButton).toBeVisible({ timeout: 10_000 });

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const label = await pointCloudButton.getAttribute('aria-label');
    if (label === 'Point Cloud: Splats (P)') {
      return;
    }

    await page.keyboard.press('p');
    await page.waitForTimeout(50);
  }

  await expect(pointCloudButton).toHaveAttribute('aria-label', 'Point Cloud: Splats (P)');
}

async function waitForPsnrFrameReady(page: Page): Promise<void> {
  await expect.poll(async () => {
    return page.evaluate(() => {
      const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
      return api?.getSplatPsnrState(null).frameReady ?? false;
    });
  }, { timeout: bicycleTimeoutMs }).toBe(true);
}

async function getPsnrState(page: Page, imageId: number): Promise<SplatPsnrState> {
  return page.evaluate((nextImageId) => {
    const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
    if (!api) throw new Error('Scene E2E probe is not installed');
    return api.getSplatPsnrState(nextImageId);
  }, imageId);
}

async function getBicycleImageIds(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
    if (!api) throw new Error('Scene E2E probe is not installed');
    return api.getImageIds();
  });
}

async function resolveBicycleImageIds(page: Page): Promise<{ selectedImageId: number; moveImageId: number }> {
  const imageIds = await getBicycleImageIds(page);
  if (imageIds.length === 0) {
    throw new Error('Bicycle dataset loaded without any registered image ids');
  }

  const selectedImageId = configuredSelectedImageId ?? imageIds[0];
  const moveImageId = configuredMoveImageId
    ?? imageIds.find((imageId) => imageId !== selectedImageId)
    ?? selectedImageId;

  return { selectedImageId, moveImageId };
}

async function loadBicycleDataset(page: Page, baseUrl: string): Promise<void> {
  const loaded = await page.evaluate(async (manifest) => {
    const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
    if (!api) throw new Error('Scene E2E probe is not installed');
    return api.loadManifest(manifest);
  }, createBicycleManifest(baseUrl));

  expect(loaded).toBe(true);
  await expect(page.getByTestId('scene-3d')).toBeVisible({ timeout: bicycleTimeoutMs });
  await switchPointCloudToSplats(page);
  await waitForWebGpuSplatCanvasVisible(page);
  await waitForPsnrFrameReady(page);
}

async function selectImage(page: Page, imageId: number): Promise<void> {
  await page.evaluate(async (nextImageId) => {
    const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
    if (!api) throw new Error('Scene E2E probe is not installed');
    api.setSelectedImageId(nextImageId);
    await api.waitForRenderFrames(8);
  }, imageId);
}

async function captureSceneCenter(page: Page): Promise<Buffer> {
  const box = await page.getByTestId('scene-3d').boundingBox();
  if (!box) {
    throw new Error('Scene container is not visible');
  }
  const width = Math.max(64, Math.min(320, Math.floor(box.width * 0.45)));
  const height = Math.max(64, Math.min(240, Math.floor(box.height * 0.45)));
  return page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    clip: {
      x: Math.floor(box.x + box.width / 2 - width / 2),
      y: Math.floor(box.y + box.height / 2 - height / 2),
      width,
      height,
    },
  });
}

async function compareScreenshotsByPixel(
  page: Page,
  before: Buffer,
  after: Buffer
): Promise<ScreenshotPixelDiff> {
  return page.evaluate(async ({ beforeBase64, afterBase64 }) => {
    async function decodeImage(base64: string): Promise<ImageData> {
      const image = new Image();
      const loaded = new Promise<void>((resolveLoaded, rejectLoaded) => {
        image.onload = () => resolveLoaded();
        image.onerror = () => rejectLoaded(new Error('Failed to decode scene screenshot'));
      });
      image.src = `data:image/png;base64,${base64}`;
      await loaded;

      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Failed to create scene screenshot diff context');
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    }

    const beforeImage = await decodeImage(beforeBase64);
    const afterImage = await decodeImage(afterBase64);
    if (beforeImage.width !== afterImage.width || beforeImage.height !== afterImage.height) {
      throw new Error(
        `Scene screenshot sizes differ: ${beforeImage.width}x${beforeImage.height} vs ${afterImage.width}x${afterImage.height}`
      );
    }

    let changedPixels = 0;
    let absChannelDeltaSum = 0;
    let maxAbsChannelDelta = 0;
    const pixelCount = beforeImage.width * beforeImage.height;
    for (let index = 0; index < beforeImage.data.length; index += 4) {
      let pixelChanged = false;
      for (let channel = 0; channel < 4; channel += 1) {
        const delta = Math.abs(beforeImage.data[index + channel] - afterImage.data[index + channel]);
        absChannelDeltaSum += delta;
        maxAbsChannelDelta = Math.max(maxAbsChannelDelta, delta);
        if (delta > 2) {
          pixelChanged = true;
        }
      }
      if (pixelChanged) {
        changedPixels += 1;
      }
    }

    return {
      width: beforeImage.width,
      height: beforeImage.height,
      changedPixelRatio: pixelCount > 0 ? changedPixels / pixelCount : 0,
      meanAbsChannelDelta: pixelCount > 0 ? absChannelDeltaSum / (pixelCount * 4) : 0,
      maxAbsChannelDelta,
    };
  }, {
    beforeBase64: before.toString('base64'),
    afterBase64: after.toString('base64'),
  });
}

async function requestSelectedPsnr(page: Page, imageId: number): Promise<void> {
  await page.evaluate((nextImageId) => {
    const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
    if (!api) throw new Error('Scene E2E probe is not installed');
    api.requestSplatPsnrCompute('selected', nextImageId);
  }, imageId);
}

async function waitForSelectedPsnrReady(page: Page, imageId: number): Promise<SplatPsnrState> {
  await expect.poll(async () => {
    const state = await getPsnrState(page, imageId);
    return state.status === 'error' ? `error: ${state.error}` : state.status;
  }, { timeout: bicycleTimeoutMs }).toBe('ready');

  return getPsnrState(page, imageId);
}

test.describe('WebGPU bicycle PSNR validation', () => {
  test.skip(!datasetPath, `Set ${DATASET_ENV} to run the local bicycle validation gate`);
  test.describe.configure({ mode: 'serial' });

  test('keeps real-dataset PSNR isolated and reaches a plausible score', async ({ page, scene3d }) => {
    test.setTimeout(bicycleTimeoutMs);
    const fatalWebGpuMessages = watchFatalWebGpuConsoleMessages(page);

    const server = await startDatasetServer(datasetPath!);
    try {
      await page.goto('/?e2eProbe=1&splatBackend=webgpu', { waitUntil: 'domcontentloaded' });
      const webGpuStatus = await getHardwareWebGpuStatus(page);
      test.skip(!webGpuStatus.ok, webGpuStatus.reason ?? 'Hardware WebGPU is unavailable');

      await waitForSceneProbe(page);
      await loadBicycleDataset(page, server.baseUrl);
      const {
        selectedImageId,
        moveImageId,
      } = await resolveBicycleImageIds(page);
      await selectImage(page, selectedImageId);

      const canvasCountBefore = await page.locator('canvas').count();
      const before = await captureSceneCenter(page);
      await requestSelectedPsnr(page, selectedImageId);
      const state = await waitForSelectedPsnrReady(page, selectedImageId);
      await page.evaluate(async () => {
        const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
        await api?.waitForRenderFrames(4);
      });
      const after = await captureSceneCenter(page);
      const canvasCountAfter = await page.locator('canvas').count();
      const sceneDiff = await compareScreenshotsByPixel(page, before, after);

      expect(canvasCountAfter).toBe(canvasCountBefore);
      expect(sceneDiff.changedPixelRatio).toBeLessThan(MAX_PSNR_SCENE_CHANGED_PIXEL_RATIO);
      expect(sceneDiff.meanAbsChannelDelta).toBeLessThan(MAX_PSNR_SCENE_MEAN_ABS_CHANNEL_DELTA);
      expectNoFatalWebGpuConsoleMessages(fatalWebGpuMessages);
      expect(state.error).toBeNull();
      expect(state.metric?.validPixelCount).toBeGreaterThan(0);
      expect(state.metric?.renderBackground).toEqual({
        label: 'opaque-black',
        rgba: [0, 0, 0, 1],
      });
      if (state.metric?.diagnostics?.backgroundDiagnostics) {
        expect(state.metric.diagnostics.backgroundDiagnostics.baseline).toMatchObject({
          label: 'opaque-black',
          rgba: [0, 0, 0, 1],
        });
        expect(state.metric.diagnostics.backgroundDiagnostics.alternatives).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              label: 'opaque-white',
              rgba: [1, 1, 1, 1],
            }),
          ])
        );
        expect(['opaque-black', 'opaque-white']).toContain(
          state.metric.diagnostics.backgroundDiagnostics.best.label
        );
      }
      expect(state.metric?.psnr).toBeGreaterThanOrEqual(minPsnr);

      await selectImage(page, moveImageId);
      await requestSelectedPsnr(page, moveImageId);
      await scene3d.dragCanvas(180, 180, 420, 240);
      await page.evaluate(async () => {
        const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
        await api?.waitForRenderFrames(4);
      });
      const movedState = await waitForSelectedPsnrReady(page, moveImageId);

      expect(movedState.error).toBeNull();
      expect(movedState.metric?.validPixelCount).toBeGreaterThan(0);
      expect(movedState.metric?.renderBackground).toEqual({
        label: 'opaque-black',
        rgba: [0, 0, 0, 1],
      });
      if (movedState.metric?.diagnostics?.backgroundDiagnostics) {
        expect(movedState.metric.diagnostics.backgroundDiagnostics.baseline).toMatchObject({
          label: 'opaque-black',
          rgba: [0, 0, 0, 1],
        });
        expect(movedState.metric.diagnostics.backgroundDiagnostics.alternatives).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              label: 'opaque-white',
              rgba: [1, 1, 1, 1],
            }),
          ])
        );
      }
      expect(movedState.metric?.psnr).toBeGreaterThanOrEqual(minPsnr);
      expect(movedState.computing).toBe(false);
      expectNoFatalWebGpuConsoleMessages(fatalWebGpuMessages);
    } finally {
      await server.close();
    }
  });
});
