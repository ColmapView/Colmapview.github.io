import type { Page } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';
import { rgbToSHDC, saveSPZ } from 'gs-toolbox';
import { test, expect } from './fixtures/test-fixtures';
import { loadTestDataset, type TestDatasetFileEntry } from './fixtures/load-test-data';

type CameraDisplayMode = 'frustum' | 'arrow' | 'imageplane';
type SceneObjectTargetName = 'camera-frustum-plane' | 'camera-arrow-cone';

interface SceneObjectTarget {
  name: SceneObjectTargetName;
  imageId: number;
  displayMode: CameraDisplayMode;
  selectedImageId: number | null;
  x: number;
  y: number;
}

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
    computedAt: number;
  } | null;
}

interface WebGpuSplatDebugCounters {
  devices: number;
  canvases: number;
  buffers: number;
  textures: number;
  renderSessions: number;
  psnrSessions: number;
  activePsnrImageJobs: number;
}

interface ColmapWebViewE2EApi {
  clearSelectedImage: () => void;
  getSceneObjectTarget: (name: SceneObjectTargetName) => SceneObjectTarget | null;
  getSelectedImageId: () => number | null;
  getSplatBackendState: () => {
    requestedBackend: string;
    availability: {
      webGpu: string;
      webGpuFailureReason?: string | null;
      spark: boolean;
    };
    resolution: {
      status: string;
      backend: string | null;
      reason: string;
    };
  };
  getSplatPsnrState: (imageId?: number | null) => SplatPsnrState;
  getWebGpuSplatDebugCounters: () => Promise<WebGpuSplatDebugCounters>;
  requestSplatPsnrCompute: (scope: 'selected' | 'all', selectedImageId?: number | null) => void;
  resetSession: () => void;
  setCameraDisplayMode: (mode: CameraDisplayMode) => void;
  setCameraScale: (scale: number) => void;
  setSelectedImageId: (imageId: number | null) => void;
  waitForRenderFrames: (count?: number) => Promise<void>;
}

interface ScreenshotStats {
  width: number;
  height: number;
  visiblePixelCount: number;
  nonBlackPixelCount: number;
  meanLuma: number;
}

const SELECTED_IMAGE_ID = 1;
const EXPECTED_RENDER_WIDTH = 640;
const EXPECTED_RENDER_HEIGHT = 480;
const TEST_IMAGE_PNG_BASE64 = createSolidPngBase64(EXPECTED_RENDER_WIDTH, EXPECTED_RENDER_HEIGHT, [12, 18, 24, 255]);

function createPsnrImageFixtureFiles(): TestDatasetFileEntry[] {
  return [
    {
      relativePath: 'images/photo.jpg',
      name: 'photo.jpg',
      base64: TEST_IMAGE_PNG_BASE64,
    },
    {
      relativePath: 'images/photo-2.jpg',
      name: 'photo-2.jpg',
      base64: TEST_IMAGE_PNG_BASE64,
    },
  ];
}

function createPsnrFixtureFiles(): TestDatasetFileEntry[] {
  return [
    ...createPsnrImageFixtureFiles(),
    createTinyGaussianPlyEntry(),
  ];
}

function createPsnrSpzFixtureFiles(): TestDatasetFileEntry[] {
  return [
    ...createPsnrImageFixtureFiles(),
    createTinyGaussianSpzEntry(),
  ];
}

function createTinyGaussianPlyEntry(): TestDatasetFileEntry {
  const properties = [
    'x', 'y', 'z',
    'f_dc_0', 'f_dc_1', 'f_dc_2',
    'opacity',
    'scale_0', 'scale_1', 'scale_2',
    'rot_0', 'rot_1', 'rot_2', 'rot_3',
  ];
  const header = [
    'ply',
    'format binary_little_endian 1.0',
    'element vertex 1',
    ...properties.map((property) => `property float ${property}`),
    'end_header',
    '',
  ].join('\n');
  const row = Buffer.alloc(properties.length * 4);
  const values = [
    0, 0, 1,
    1.772453850905516, -1.772453850905516, -1.772453850905516,
    2,
    -3, -3, -3,
    1, 0, 0, 0,
  ];
  values.forEach((value, index) => row.writeFloatLE(value, index * 4));

  return {
    relativePath: 'splats/tiny-gaussian.ply',
    name: 'tiny-gaussian.ply',
    base64: Buffer.concat([Buffer.from(header), row]).toString('base64'),
  };
}

function createTinyGaussianSpzEntry(): TestDatasetFileEntry {
  const cloud: Parameters<typeof saveSPZ>[0] = {
    count: 1,
    positions: new Float32Array([0, 0, 1]),
    scales: new Float32Array([0.05, 0.05, 0.05]),
    rotations: new Float32Array([1, 0, 0, 0]),
    opacities: new Float32Array([0.95]),
    sh0: rgbToSHDC(new Float32Array([1, 0, 0])),
    shDegree: 0,
  };

  return {
    relativePath: 'splats/tiny-gaussian.spz',
    name: 'tiny-gaussian.spz',
    base64: Buffer.from(new Uint8Array(saveSPZ(cloud))).toString('base64'),
  };
}

function createSolidPngBase64(
  width: number,
  height: number,
  rgba: [number, number, number, number]
): string {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const offset = row + 1 + x * 4;
      raw[offset] = rgba[0];
      raw[offset + 1] = rgba[1];
      raw[offset + 2] = rgba[2];
      raw[offset + 3] = rgba[3];
    }
  }

  return Buffer.concat([
    signature,
    createPngChunk('IHDR', ihdr),
    createPngChunk('IDAT', deflateSync(raw)),
    createPngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(getCrc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function getCrc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function waitForSceneProbe(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as Window & { __COLMAP_WEBVIEW_E2E__?: unknown }).__COLMAP_WEBVIEW_E2E__),
    null,
    { timeout: 10_000 }
  );
}

async function installLowLimitWebGpuMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = {
      requestAdapterCalls: 0,
      requestDeviceCalls: 0,
      requestDeviceRequiredLimitCalls: 0,
    };
    Object.defineProperty(window, '__COLMAP_WEBVIEW_LOW_LIMIT_WEBGPU__', {
      configurable: true,
      value: state,
    });

    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: {
        getPreferredCanvasFormat: () => 'rgba8unorm',
        requestAdapter: async () => {
          state.requestAdapterCalls += 1;
          return {
            limits: {
              maxBufferSize: 268_435_456,
              maxStorageBufferBindingSize: 134_217_728,
            },
            requestDevice: async (options?: { requiredLimits?: unknown }) => {
              state.requestDeviceCalls += 1;
              if (options?.requiredLimits) {
                state.requestDeviceRequiredLimitCalls += 1;
              }
              return {
                limits: {
                  maxBufferSize: 268_435_456,
                  maxStorageBufferBindingSize: 134_217_728,
                },
                lost: new Promise(() => undefined),
                destroy() {
                  // No-op fake device. The limit policy should throw before this is used.
                },
              };
            },
          };
        },
      },
    });

    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patchedGetContext(
      this: HTMLCanvasElement,
      contextId: string,
      ...args: unknown[]
    ) {
      if (contextId === 'webgpu') {
        return {
          configure() {
            // No-op fake context. Adapter-limit validation should fail before configure.
          },
          unconfigure() {
            // No-op fake context.
          },
        };
      }
      return (getContext as (this: HTMLCanvasElement, id: string, ...rest: unknown[]) => ReturnType<typeof getContext>).call(this, contextId, ...args) as RenderingContext | null;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}

async function routeLargeGaussianCloudLoader(page: Page): Promise<void> {
  await page.route('**/src/splat/gaussianCloudLoader.ts*', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `
        export function getGaussianCloudFormatForFile() {
          return 'ply';
        }
        export function isGaussianCloudFile() {
          return true;
        }
        export async function loadGaussianCloudFromFile(file) {
          return {
            file,
            format: 'ply',
            byteLength: file.size,
            cloud: {
              count: 5000000,
              positions: new Float32Array(3),
              scales: new Float32Array(3),
              rotations: new Float32Array(4),
              opacities: new Float32Array(1),
              sh0: new Float32Array(3),
              shN: new Float32Array(45),
              shDegree: 3,
            },
          };
        }
      `,
    });
  });
}

async function routeDelayedTinyGaussianCloudLoader(page: Page, delayMs: number): Promise<void> {
  await page.route('**/src/splat/gaussianCloudLoader.ts*', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `
        export function getGaussianCloudFormatForFile(file) {
          const name = String(file?.name ?? '').toLowerCase();
          if (name.endsWith('.spz')) return 'spz';
          return 'ply';
        }
        export function isGaussianCloudFile() {
          return true;
        }
        export async function loadGaussianCloudFromFile(file) {
          await new Promise((resolve) => setTimeout(resolve, ${Math.max(0, Math.trunc(delayMs))}));
          return {
            file,
            format: getGaussianCloudFormatForFile(file),
            byteLength: file.size,
            cloud: {
              count: 1,
              positions: new Float32Array([0, 0, 1]),
              scales: new Float32Array([0.05, 0.05, 0.05]),
              rotations: new Float32Array([1, 0, 0, 0]),
              opacities: new Float32Array([0.95]),
              sh0: new Float32Array([1.772453850905516, -1.772453850905516, -1.772453850905516]),
              shDegree: 0,
            },
          };
        }
      `,
    });
  });
}

async function routeFakeSparkRuntime(page: Page): Promise<void> {
  await page.route('**/src/utils/sparkSplatRuntime.ts*', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `
        import * as THREE from '/node_modules/three/build/three.module.js';

        class FakeSparkRenderer extends THREE.Object3D {
          dispose() {}
        }

        class FakeSplatMesh extends THREE.Mesh {
          constructor(options = {}) {
            super(
              new THREE.SphereGeometry(0.08, 16, 12),
              new THREE.MeshBasicMaterial({ color: 0xff3333, depthTest: false, depthWrite: false })
            );
            this.name = options.fileName || 'fake-splat';
            this.position.set(0, 0, 1);
            this.initialized = Promise.resolve();
          }

          dispose() {
            this.geometry.dispose();
            this.material.dispose();
          }
        }

        export function preloadSparkModule() {
          return Promise.resolve({
            SparkRenderer: FakeSparkRenderer,
            SplatMesh: FakeSplatMesh,
          });
        }

        export async function getSplatMeshSourceOptions(sourceFile) {
          return {
            fileBytes: new Uint8Array(await sourceFile.arrayBuffer()),
          };
        }
      `,
    });
  });
}

async function routeFakeDelayedPsnrSession(page: Page, delaysMs: number[]): Promise<void> {
  const delays = delaysMs.map((delay) => Math.max(0, Math.trunc(delay)));
  const installState = (nextDelays: number[]) => {
    Object.defineProperty(window, '__COLMAP_WEBVIEW_FAKE_PSNR__', {
      configurable: true,
      value: {
        delays: nextDelays,
        sessionCount: 0,
        computeCount: 0,
        disposedCount: 0,
        completed: [] as number[],
      },
    });
  };

  await page.addInitScript(installState, delays);
  await page.evaluate(installState, delays);

  await page.route('**/src/splat/webgpu/psnrSplatSession.ts*', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `
        const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        export async function createWebGpuSplatPsnrSession() {
          const state = window.__COLMAP_WEBVIEW_FAKE_PSNR__;
          ++state.sessionCount;
          return {
            async computeImageMetric(options) {
              const computeId = ++state.computeCount;
              await delay(state.delays[computeId - 1] ?? 0);
              state.completed.push(computeId);
              return {
                psnr: 20 + computeId,
                mse: computeId,
                validPixelCount: options.width * options.height,
              };
            },
            dispose() {
              state.disposedCount += 1;
            },
          };
        }
      `,
    });
  });
}

async function resetFakeDelayedPsnrSession(page: Page, delaysMs: number[]): Promise<void> {
  const delays = delaysMs.map((delay) => Math.max(0, Math.trunc(delay)));
  await page.evaluate((nextDelays) => {
    const state = (window as Window & {
      __COLMAP_WEBVIEW_FAKE_PSNR__?: {
        delays: number[];
        sessionCount: number;
        computeCount: number;
        disposedCount: number;
        completed: number[];
      };
    }).__COLMAP_WEBVIEW_FAKE_PSNR__;
    if (!state) {
      throw new Error('Fake PSNR state is not installed');
    }

    state.delays = nextDelays;
    state.sessionCount = 0;
    state.computeCount = 0;
    state.disposedCount = 0;
    state.completed = [];
  }, delays);
}

async function getLowLimitWebGpuMockState(page: Page): Promise<{
  requestAdapterCalls: number;
  requestDeviceCalls: number;
  requestDeviceRequiredLimitCalls: number;
} | undefined> {
  return page.evaluate(() => {
    return (window as Window & {
      __COLMAP_WEBVIEW_LOW_LIMIT_WEBGPU__?: {
        requestAdapterCalls: number;
        requestDeviceCalls: number;
        requestDeviceRequiredLimitCalls: number;
      };
    }).__COLMAP_WEBVIEW_LOW_LIMIT_WEBGPU__;
  });
}

async function getSplatBackendState(page: Page): Promise<ReturnType<ColmapWebViewE2EApi['getSplatBackendState']>> {
  return page.evaluate(() => {
    const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
    if (!api) throw new Error('Scene E2E probe is not installed');
    return api.getSplatBackendState();
  });
}

async function waitForSplatBackend(
  page: Page,
  expected: { requested: string; backend: string | null; status?: string }
): Promise<ReturnType<ColmapWebViewE2EApi['getSplatBackendState']>> {
  await expect.poll(async () => {
    const state = await getSplatBackendState(page);
    return `${state.requestedBackend}:${state.resolution.status}:${state.resolution.backend}`;
  }, { timeout: 45_000 }).toBe(`${expected.requested}:${expected.status ?? 'resolved'}:${expected.backend}`);

  return getSplatBackendState(page);
}

async function setCameraModeForTarget(
  page: Page,
  mode: CameraDisplayMode,
  cameraScale: number
): Promise<void> {
  await page.evaluate(async ({ nextMode, nextCameraScale, preselectedImageId }) => {
    const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
    if (!api) throw new Error('Scene E2E probe is not installed');

    api.clearSelectedImage();
    api.setCameraScale(nextCameraScale);
    api.setCameraDisplayMode(nextMode);
    api.setSelectedImageId(preselectedImageId);
    await api.waitForRenderFrames(3);
  }, { nextMode: mode, nextCameraScale: cameraScale, preselectedImageId: SELECTED_IMAGE_ID });
}

async function waitForSceneObjectTarget(
  page: Page,
  name: SceneObjectTargetName,
  mode: CameraDisplayMode
): Promise<SceneObjectTarget> {
  await page.waitForFunction(
    ({ targetName, expectedMode }) => {
      const target = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi })
        .__COLMAP_WEBVIEW_E2E__?.getSceneObjectTarget(targetName);
      return Boolean(
        target &&
        target.displayMode === expectedMode &&
        target.x > 0 &&
        target.y > 0
      );
    },
    { targetName: name, expectedMode: mode },
    { timeout: 10_000 }
  );

  const target = await page.evaluate((targetName) => {
    return (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi })
      .__COLMAP_WEBVIEW_E2E__?.getSceneObjectTarget(targetName) ?? null;
  }, name);

  if (!target) throw new Error(`Scene object target "${name}" was not available`);
  return target;
}

async function waitForWebGpuSplatCanvasVisible(page: Page): Promise<void> {
  await expect(page.getByTestId('webgpu-splat-canvas')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => {
    return page.getByTestId('webgpu-splat-canvas').evaluate((canvas) => getComputedStyle(canvas).opacity);
  }, { timeout: 30_000 }).toBe('1');
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
  }, { timeout: 30_000 }).toBe(true);
}

async function waitForBackgroundPsnrSettled(page: Page): Promise<void> {
  await page.waitForTimeout(350);
  await expect.poll(async () => {
    return (await getPsnrState(page)).computing;
  }, { timeout: 15_000 }).toBe(false);
}

async function getPsnrState(page: Page, imageId = SELECTED_IMAGE_ID): Promise<SplatPsnrState> {
  return page.evaluate((nextImageId) => {
    const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
    if (!api) throw new Error('Scene E2E probe is not installed');
    return api.getSplatPsnrState(nextImageId);
  }, imageId);
}

async function getWebGpuSplatDebugCounters(page: Page): Promise<WebGpuSplatDebugCounters> {
  return page.evaluate(async () => {
    const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
    if (!api) throw new Error('Scene E2E probe is not installed');
    return api.getWebGpuSplatDebugCounters();
  });
}

async function resetE2ESession(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
    if (!api) throw new Error('Scene E2E probe is not installed');
    api.resetSession();
  });
  await expect(page.getByTestId('webgpu-splat-canvas')).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(async () => {
    const counters = await getWebGpuSplatDebugCounters(page);
    return {
      canvases: counters.canvases,
      buffers: counters.buffers,
      textures: counters.textures,
      renderSessions: counters.renderSessions,
      psnrSessions: counters.psnrSessions,
      activePsnrImageJobs: counters.activePsnrImageJobs,
    };
  }, { timeout: 30_000 }).toEqual({
    canvases: 0,
    buffers: 0,
    textures: 0,
    renderSessions: 0,
    psnrSessions: 0,
    activePsnrImageJobs: 0,
  });
}

async function loadWebGpuFixtureAndWait(
  page: Page,
  fixtureFiles: TestDatasetFileEntry[]
): Promise<WebGpuSplatDebugCounters> {
  await loadTestDataset(page, fixtureFiles);
  await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45_000 });
  await switchPointCloudToSplats(page);
  await waitForWebGpuSplatCanvasVisible(page);
  await waitForPsnrFrameReady(page);
  await page.evaluate(async () => {
    const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
    await api?.waitForRenderFrames(6);
  });
  await waitForBackgroundPsnrSettled(page);

  return getWebGpuSplatDebugCounters(page);
}

async function waitForSelectedPsnrReadyAfter(
  page: Page,
  previousComputedAt: number
): Promise<SplatPsnrState> {
  await expect.poll(async () => {
    const state = await getPsnrState(page);
    if (state.status === 'error') {
      return `error: ${state.error}`;
    }
    if (state.computing) {
      return 'computing';
    }
    const computedAt = state.metric?.computedAt ?? 0;
    return `${state.status}:${computedAt > previousComputedAt}`;
  }, { timeout: 45_000 }).toBe('ready:true');

  return getPsnrState(page);
}

async function prepareWebGpuPsnrApp(
  page: Page,
  fixtureFiles: TestDatasetFileEntry[] = createPsnrFixtureFiles()
): Promise<void> {
  test.skip(!await page.evaluate(() => Boolean((navigator as Navigator & { gpu?: unknown }).gpu)), 'WebGPU is unavailable');

  const closeButton = page.locator('button:has-text("x"), button:has-text("×")').first();
  if (await closeButton.isVisible({ timeout: 2_000 })) {
    await closeButton.click();
  }

  await loadTestDataset(page, fixtureFiles);
  await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45_000 });
  await waitForSceneProbe(page);
  await switchPointCloudToSplats(page);
  await waitForWebGpuSplatCanvasVisible(page);
  await waitForPsnrFrameReady(page);
  await page.evaluate(async (selectedImageId) => {
    const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
    if (!api) throw new Error('Scene E2E probe is not installed');
    api.setSelectedImageId(selectedImageId);
    await api.waitForRenderFrames(6);
  }, SELECTED_IMAGE_ID);
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

async function getScreenshotStats(page: Page, png: Buffer): Promise<ScreenshotStats> {
  return page.evaluate(async (base64) => {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to decode screenshot'));
    });
    image.src = `data:image/png;base64,${base64}`;
    await loaded;

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to create screenshot stats canvas context');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let visiblePixelCount = 0;
    let nonBlackPixelCount = 0;
    let lumaSum = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha === 0) continue;
      visiblePixelCount += 1;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      lumaSum += luma;
      if (red + green + blue > 8) {
        nonBlackPixelCount += 1;
      }
    }

    return {
      width: canvas.width,
      height: canvas.height,
      visiblePixelCount,
      nonBlackPixelCount,
      meanLuma: visiblePixelCount > 0 ? lumaSum / visiblePixelCount : 0,
    };
  }, png.toString('base64'));
}

async function captureNonBlankSceneCenterSamplesUntilWebGpu(
  page: Page,
  options: {
    minSamples: number;
    timeoutMs: number;
    intervalMs: number;
  }
): Promise<ScreenshotStats[]> {
  const startedAt = Date.now();
  const samples: ScreenshotStats[] = [];

  while (Date.now() - startedAt < options.timeoutMs) {
    const stats = await getScreenshotStats(page, await captureSceneCenter(page));
    samples.push(stats);
    expect(stats.nonBlackPixelCount, `sample ${samples.length} nonblack pixels`).toBeGreaterThan(0);
    expect(stats.meanLuma, `sample ${samples.length} mean luma`).toBeGreaterThan(0);

    const state = await getSplatBackendState(page);
    if (
      state.resolution.status === 'resolved' &&
      state.resolution.backend === 'webgpu' &&
      samples.length >= options.minSamples
    ) {
      return samples;
    }

    await page.waitForTimeout(options.intervalMs);
  }

  throw new Error(`Timed out waiting for WebGPU backend after ${samples.length} nonblank handoff samples`);
}

async function requestSelectedPsnr(page: Page): Promise<void> {
  await page.evaluate((selectedImageId) => {
    const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
    if (!api) throw new Error('Scene E2E probe is not installed');
    api.requestSplatPsnrCompute('selected', selectedImageId);
  }, SELECTED_IMAGE_ID);
}

async function waitForSelectedPsnrReady(page: Page): Promise<SplatPsnrState> {
  await expect.poll(async () => {
    const state = await getPsnrState(page);
    return state.status === 'error' ? `error: ${state.error}` : state.status;
  }, { timeout: 45_000 }).toBe('ready');

  return getPsnrState(page);
}

async function waitForSelectedPsnrComputing(page: Page): Promise<void> {
  await expect.poll(async () => {
    const state = await getPsnrState(page);
    return state.computing;
  }, { timeout: 15_000 }).toBe(true);
}

test.describe('WebGPU PSNR app integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?e2eProbe=1&splatBackend=webgpu', { waitUntil: 'domcontentloaded' });
  });

  test('keeps selected-image PSNR off the visible viewer surface', async ({ page }) => {
    await prepareWebGpuPsnrApp(page);
    const canvasCountBefore = await page.locator('canvas').count();
    const before = await captureSceneCenter(page);

    await requestSelectedPsnr(page);
    const state = await waitForSelectedPsnrReady(page);
    await page.evaluate(async () => {
      const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
      await api?.waitForRenderFrames(4);
    });
    const after = await captureSceneCenter(page);
    const canvasCountAfter = await page.locator('canvas').count();

    expect(canvasCountAfter).toBe(canvasCountBefore);
    expect(Buffer.compare(after, before)).toBe(0);
    expect(state.error).toBeNull();
    expect(state.metric?.width).toBe(EXPECTED_RENDER_WIDTH);
    expect(state.metric?.height).toBe(EXPECTED_RENDER_HEIGHT);
    expect(state.metric?.validPixelCount).toBeGreaterThan(0);
  });

  test('completes selected-image PSNR after real viewer camera movement', async ({ page, scene3d }) => {
    await prepareWebGpuPsnrApp(page);

    await requestSelectedPsnr(page);
    await scene3d.dragCanvas(180, 180, 420, 240);
    await page.evaluate(async () => {
      const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
      await api?.waitForRenderFrames(4);
    });
    const state = await waitForSelectedPsnrReady(page);

    expect(state.error).toBeNull();
    expect(state.metric?.width).toBe(EXPECTED_RENDER_WIDTH);
    expect(state.metric?.height).toBe(EXPECTED_RENDER_HEIGHT);
    expect(state.metric?.validPixelCount).toBeGreaterThan(0);
    expect(state.computing).toBe(false);
  });

  test('repeats selected-image PSNR without leaking WebGPU resources', async ({ page }) => {
    await prepareWebGpuPsnrApp(page);
    const baselineCounters = await getWebGpuSplatDebugCounters(page);
    expect(baselineCounters).toMatchObject({
      canvases: 1,
      activePsnrImageJobs: 0,
    });

    let previousComputedAt = (await getPsnrState(page)).metric?.computedAt ?? 0;
    let steadyCounters: WebGpuSplatDebugCounters | null = null;
    for (let iteration = 0; iteration < 3; iteration += 1) {
      await requestSelectedPsnr(page);
      const state = await waitForSelectedPsnrReadyAfter(page, previousComputedAt);
      previousComputedAt = state.metric?.computedAt ?? previousComputedAt;

      expect(state.error).toBeNull();
      expect(state.metric?.validPixelCount).toBeGreaterThan(0);
      const counters = await getWebGpuSplatDebugCounters(page);
      expect(counters).toMatchObject({
        canvases: 1,
        activePsnrImageJobs: 0,
      });
      expect(counters.buffers).toBeGreaterThanOrEqual(baselineCounters.buffers);
      expect(counters.textures).toBeGreaterThanOrEqual(baselineCounters.textures);
      expect(counters.renderSessions).toBeGreaterThanOrEqual(baselineCounters.renderSessions);
      if (steadyCounters) {
        expect(counters).toEqual(steadyCounters);
      } else {
        steadyCounters = counters;
      }
    }
  });

  test('publishes only the latest selected-image PSNR request when an older request resolves late', async ({ page }) => {
    await routeFakeDelayedPsnrSession(page, [650, 25]);
    await prepareWebGpuPsnrApp(page);
    await waitForBackgroundPsnrSettled(page);
    await resetFakeDelayedPsnrSession(page, [650, 25]);

    const previousComputedAt = (await getPsnrState(page)).metric?.computedAt ?? 0;
    await requestSelectedPsnr(page);
    await waitForSelectedPsnrComputing(page);
    await requestSelectedPsnr(page);

    await waitForSelectedPsnrReadyAfter(page, previousComputedAt);
    await expect.poll(async () => {
      return (await getPsnrState(page)).metric?.psnr ?? null;
    }, { timeout: 15_000 }).toBe(22);
    const latestState = await getPsnrState(page);
    expect(latestState.metric?.psnr).toBe(22);
    expect(latestState.metric?.mse).toBe(2);
    expect(latestState.metric?.validPixelCount).toBe(EXPECTED_RENDER_WIDTH * EXPECTED_RENDER_HEIGHT);

    const latestComputedAt = latestState.metric?.computedAt ?? 0;
    await page.waitForTimeout(750);
    const afterLateFirstResult = await getPsnrState(page);

    expect(afterLateFirstResult.metric?.psnr).toBe(22);
    expect(afterLateFirstResult.metric?.computedAt).toBe(latestComputedAt);
    expect(afterLateFirstResult.computing).toBe(false);
  });

  test('does not publish stale selected-image PSNR after the dataset and splat switch', async ({ page }) => {
    await routeFakeDelayedPsnrSession(page, [650]);
    await prepareWebGpuPsnrApp(page);
    await waitForBackgroundPsnrSettled(page);
    await resetFakeDelayedPsnrSession(page, [650, 25]);

    await requestSelectedPsnr(page);
    await waitForSelectedPsnrComputing(page);

    await loadTestDataset(page, createPsnrSpzFixtureFiles());
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45_000 });
    await switchPointCloudToSplats(page);
    await waitForWebGpuSplatCanvasVisible(page);
    await waitForPsnrFrameReady(page);
    await page.waitForTimeout(750);

    const switchedState = await getPsnrState(page);
    expect(switchedState.metric?.psnr ?? null).not.toBe(21);
    expect(switchedState.metric?.mse ?? null).not.toBe(1);
  });
});

test.describe('WebGPU visible splat resource lifecycle', () => {
  test('repeated load, switch, and clear returns WebGPU counters to baseline', async ({ page }) => {
    await page.goto('/?e2eProbe=1&splatBackend=webgpu', { waitUntil: 'domcontentloaded' });
    test.skip(!await page.evaluate(() => Boolean((navigator as Navigator & { gpu?: unknown }).gpu)), 'WebGPU is unavailable');
    await waitForSceneProbe(page);

    let postClearBaseline: WebGpuSplatDebugCounters | null = null;
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const firstLoadCounters = await loadWebGpuFixtureAndWait(page, createPsnrFixtureFiles());
      expect(firstLoadCounters).toMatchObject({
        canvases: 1,
        activePsnrImageJobs: 0,
      });
      expect(firstLoadCounters.buffers).toBeGreaterThan(0);
      expect(firstLoadCounters.textures).toBeGreaterThan(0);
      expect(firstLoadCounters.renderSessions).toBeGreaterThan(0);

      const switchedCounters = await loadWebGpuFixtureAndWait(page, createPsnrSpzFixtureFiles());
      expect(switchedCounters).toMatchObject({
        canvases: 1,
        activePsnrImageJobs: 0,
      });
      expect(switchedCounters.buffers).toBeGreaterThan(0);
      expect(switchedCounters.textures).toBeGreaterThan(0);
      expect(switchedCounters.renderSessions).toBeGreaterThan(0);

      await resetE2ESession(page);
      const clearedCounters = await getWebGpuSplatDebugCounters(page);
      expect(clearedCounters).toMatchObject({
        canvases: 0,
        buffers: 0,
        textures: 0,
        renderSessions: 0,
        psnrSessions: 0,
        activePsnrImageJobs: 0,
      });
      expect(clearedCounters.devices).toBeLessThanOrEqual(firstLoadCounters.devices);

      if (postClearBaseline) {
        expect(clearedCounters).toEqual(postClearBaseline);
      } else {
        postClearBaseline = clearedCounters;
      }
    }
  });
});

test.describe('Splat backend preference integration', () => {
  test('resolves forced Spark without mounting the visible WebGPU canvas', async ({ page }) => {
    await routeFakeSparkRuntime(page);

    await page.goto('/?e2eProbe=1&splatBackend=spark', { waitUntil: 'domcontentloaded' });
    await waitForSceneProbe(page);
    await loadTestDataset(page, createPsnrFixtureFiles());
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45_000 });

    const state = await waitForSplatBackend(page, { requested: 'spark', backend: 'spark' });

    expect(state.resolution).toMatchObject({
      status: 'resolved',
      backend: 'spark',
      reason: 'Spark renderer forced by splatBackend=spark',
    });
    await expect(page.getByTestId('webgpu-splat-canvas')).toHaveCount(0);
  });

  test('resolves forced WebGPU and makes the WebGPU canvas visible after the first frame', async ({ page }) => {
    await page.goto('/?e2eProbe=1&splatBackend=webgpu', { waitUntil: 'domcontentloaded' });
    await prepareWebGpuPsnrApp(page);

    const state = await waitForSplatBackend(page, { requested: 'webgpu', backend: 'webgpu' });

    expect(state.resolution).toMatchObject({
      status: 'resolved',
      backend: 'webgpu',
      reason: 'WebGPU renderer forced by splatBackend=webgpu',
    });
    await waitForWebGpuSplatCanvasVisible(page);
  });

  test('loads a real SPZ splat through visible WebGPU and reaches first frame', async ({ page }) => {
    await page.goto('/?e2eProbe=1&splatBackend=webgpu', { waitUntil: 'domcontentloaded' });
    await prepareWebGpuPsnrApp(page, createPsnrSpzFixtureFiles());

    const state = await waitForSplatBackend(page, { requested: 'webgpu', backend: 'webgpu' });

    expect(state.resolution).toMatchObject({
      status: 'resolved',
      backend: 'webgpu',
      reason: 'WebGPU renderer forced by splatBackend=webgpu',
    });
    await waitForWebGpuSplatCanvasVisible(page);
  });

  test('resolves auto from Spark fallback to WebGPU after the hidden WebGPU first frame', async ({ page }) => {
    await routeFakeSparkRuntime(page);
    await routeDelayedTinyGaussianCloudLoader(page, 1_200);

    await page.goto('/?e2eProbe=1&splatBackend=auto', { waitUntil: 'domcontentloaded' });
    test.skip(!await page.evaluate(() => Boolean((navigator as Navigator & { gpu?: unknown }).gpu)), 'WebGPU is unavailable');

    await waitForSceneProbe(page);
    await loadTestDataset(page, createPsnrFixtureFiles());
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45_000 });
    await switchPointCloudToSplats(page);
    await expect.poll(async () => {
      const pendingState = await getSplatBackendState(page);
      return `${pendingState.availability.webGpu}:${pendingState.availability.spark}:${pendingState.resolution.backend}`;
    }, { timeout: 10_000 }).toBe('unavailable:true:spark');
    await page.evaluate(async () => {
      const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
      await api?.waitForRenderFrames(3);
    });
    const sparkFallbackStats = await getScreenshotStats(page, await captureSceneCenter(page));
    const handoffStats = await captureNonBlankSceneCenterSamplesUntilWebGpu(page, {
      minSamples: 3,
      timeoutMs: 45_000,
      intervalMs: 120,
    });

    const state = await waitForSplatBackend(page, { requested: 'auto', backend: 'webgpu' });
    await waitForWebGpuSplatCanvasVisible(page);
    await page.evaluate(async () => {
      const api = (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi }).__COLMAP_WEBVIEW_E2E__;
      await api?.waitForRenderFrames(3);
    });
    const webGpuStats = await getScreenshotStats(page, await captureSceneCenter(page));

    expect(state.availability.spark).toBe(true);
    expect(state.resolution).toMatchObject({
      status: 'resolved',
      backend: 'webgpu',
      reason: 'WebGPU renderer selected automatically',
    });
    expect(sparkFallbackStats.nonBlackPixelCount).toBeGreaterThan(0);
    expect(sparkFallbackStats.meanLuma).toBeGreaterThan(0);
    expect(handoffStats.length).toBeGreaterThanOrEqual(3);
    expect(webGpuStats.nonBlackPixelCount).toBeGreaterThan(0);
    expect(webGpuStats.meanLuma).toBeGreaterThan(0);
  });

  test('keeps Three camera overlays interactive with WebGPU splats behind them', async ({ page }) => {
    await page.goto('/?e2eProbe=1&splatBackend=webgpu', { waitUntil: 'domcontentloaded' });
    await prepareWebGpuPsnrApp(page);
    await waitForWebGpuSplatCanvasVisible(page);

    await setCameraModeForTarget(page, 'frustum', 0.05);
    const target = await waitForSceneObjectTarget(page, 'camera-frustum-plane', 'frustum');

    expect(target.selectedImageId).toBe(SELECTED_IMAGE_ID);
    expect(target.imageId).not.toBe(SELECTED_IMAGE_ID);

    await page.mouse.click(target.x, target.y);

    await expect.poll(async () => page.evaluate(() => {
      return (window as Window & { __COLMAP_WEBVIEW_E2E__?: ColmapWebViewE2EApi })
        .__COLMAP_WEBVIEW_E2E__?.getSelectedImageId() ?? null;
    })).toBe(target.imageId);
  });
});

test.describe('WebGPU adapter-limit failure integration', () => {
  test('surfaces low-limit adapter failure and unmounts the WebGPU canvas', async ({ page }) => {
    await installLowLimitWebGpuMock(page);
    await routeLargeGaussianCloudLoader(page);

    await page.goto('/?e2eProbe=1&splatBackend=webgpu', { waitUntil: 'domcontentloaded' });
    await loadTestDataset(page, createPsnrFixtureFiles());
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(
      /WebGPU splat renderer unavailable: WebGPU splat renderer failed to initialize: WebGPU splat renderer requires max(BufferSize|StorageBufferBindingSize) 900000000 bytes, but this adapter supports (268435456|134217728) bytes/
    ))
      .toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('webgpu-splat-canvas')).toHaveCount(0);
    await expect(page.getByText('Loading splat: tiny-gaussian.ply')).toHaveCount(0);

    const fakeGpuState = await getLowLimitWebGpuMockState(page);
    expect(fakeGpuState?.requestAdapterCalls).toBeGreaterThan(0);
    expect(fakeGpuState?.requestDeviceRequiredLimitCalls).toBe(0);
  });

  test('keeps Spark selected in auto mode when background WebGPU large-cloud initialization fails', async ({ page }) => {
    await installLowLimitWebGpuMock(page);
    await routeLargeGaussianCloudLoader(page);

    await page.goto('/?e2eProbe=1&splatBackend=auto', { waitUntil: 'domcontentloaded' });
    await waitForSceneProbe(page);
    await loadTestDataset(page, createPsnrFixtureFiles());
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45_000 });

    await expect.poll(async () => {
      const state = await getSplatBackendState(page);
      return `${state.availability.webGpu}:${state.availability.spark}:${state.resolution.backend}`;
    }, { timeout: 45_000 }).toBe('failed:true:spark');

    const backendState = await getSplatBackendState(page);
    expect(backendState.requestedBackend).toBe('auto');
    expect(backendState.availability.webGpuFailureReason).toMatch(
      /WebGPU splat renderer requires max(BufferSize|StorageBufferBindingSize) 900000000 bytes/
    );
    expect(backendState.resolution).toMatchObject({
      status: 'resolved',
      backend: 'spark',
    });
    expect(backendState.resolution.reason).toMatch(
      /Spark fallback selected because WebGPU splat renderer failed to initialize: WebGPU splat renderer requires max(BufferSize|StorageBufferBindingSize) 900000000 bytes/
    );

    await expect(page.getByText(
      /Using Spark fallback: WebGPU splat renderer failed to initialize: WebGPU splat renderer requires max(BufferSize|StorageBufferBindingSize) 900000000 bytes/
    )).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('webgpu-splat-canvas')).toHaveCount(0);
    await expect(page.getByText(/WebGPU splat renderer unavailable:/)).toHaveCount(0);

    const fakeGpuState = await getLowLimitWebGpuMockState(page);
    expect(fakeGpuState?.requestAdapterCalls).toBeGreaterThan(0);
    expect(fakeGpuState?.requestDeviceRequiredLimitCalls).toBe(0);
  });
});
