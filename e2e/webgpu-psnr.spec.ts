import { test, expect } from './fixtures/test-fixtures';

interface WebGpuPsnrBrowserResult {
  status: 'ok' | 'unavailable';
  reason?: string;
  cases?: {
    basic: BrowserPsnrMetric;
    identical: BrowserPsnrMetric;
    alphaZero: BrowserPsnrMetric;
    alphaMask: BrowserPsnrMetric;
    multiWorkgroup: BrowserPsnrMetric;
    carry64: BrowserPsnrMetric;
    tiledFull: BrowserPsnrMetric;
    tiledAccumulated: BrowserPsnrMetric;
  };
  validationError?: string | null;
  mapReadBufferSizes?: number[];
}

interface BrowserPsnrMetric {
  sumSquaredError: number;
  psnr: number;
  mse: number;
  validPixelCount: number;
}

interface BrowserPsnrReduction {
  sumSquaredError: number;
  validPixelCount: number;
}

interface BrowserPsnrModule {
  computePsnrFromRgbaTexturesWebGpu(options: {
    device: BrowserGpuDevice;
    renderedTexture: BrowserGpuTexture;
    groundTruthTexture: BrowserGpuTexture;
    maskTexture?: BrowserGpuTexture;
    width: number;
    height: number;
    maskOrigin?: { x: number; y: number };
  }): Promise<BrowserPsnrMetric>;
  computePsnrTextureReductionFromRgbaTexturesWebGpu(options: {
    device: BrowserGpuDevice;
    renderedTexture: BrowserGpuTexture;
    groundTruthTexture: BrowserGpuTexture;
    maskTexture?: BrowserGpuTexture;
    width: number;
    height: number;
    renderedOrigin?: { x: number; y: number };
    groundTruthOrigin?: { x: number; y: number };
    maskOrigin?: { x: number; y: number };
  }): Promise<BrowserPsnrReduction>;
  accumulatePsnrTextureReductions(reductions: BrowserPsnrReduction[]): BrowserPsnrReduction;
  computePsnrFromTextureReduction(reduction: BrowserPsnrReduction): BrowserPsnrMetric;
}

interface BrowserGpuBufferDescriptor {
  usage: number;
  size: number | bigint;
}

interface BrowserGpuQueue {
  writeTexture(
    destination: { texture: BrowserGpuTexture },
    data: Uint8Array,
    dataLayout: { bytesPerRow: number; rowsPerImage: number },
    size: { width: number; height: number }
  ): void;
  onSubmittedWorkDone(): Promise<void>;
}

interface BrowserGpuTexture {
  destroy(): void;
}

interface BrowserGpuDevice {
  createBuffer(descriptor: BrowserGpuBufferDescriptor): unknown;
  createTexture(descriptor: {
    size: { width: number; height: number };
    format: string;
    usage: number;
  }): BrowserGpuTexture;
  queue: BrowserGpuQueue;
  pushErrorScope(filter: 'validation'): void;
  popErrorScope(): Promise<{ message: string } | null>;
  destroy(): void;
}

interface BrowserGpuAdapter {
  requestDevice(): Promise<BrowserGpuDevice>;
}

interface BrowserNavigatorWithWebGpu extends Omit<Navigator, 'gpu'> {
  gpu?: {
    requestAdapter(): Promise<BrowserGpuAdapter | null>;
  };
}

const EXPECTED_MSE = 100 / 6;
const EXPECTED_PSNR = 10 * Math.log10((255 * 255) / EXPECTED_MSE);
const WHITE_SQUARED_ERROR = 255 * 255 * 3;

test.describe('WebGPU PSNR validation', () => {
  test('executes texture-to-texture PSNR reducer edge cases on a real WebGPU device', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate<WebGpuPsnrBrowserResult>(async () => {
      const webGpuNavigator = navigator as BrowserNavigatorWithWebGpu;
      const bufferUsageMapRead = 0x0001;
      const textureUsageCopyDst = 0x02;
      const textureUsageTextureBinding = 0x04;
      if (!webGpuNavigator.gpu) {
        return { status: 'unavailable', reason: 'navigator.gpu is unavailable' };
      }

      const adapter = await webGpuNavigator.gpu.requestAdapter();
      if (!adapter) {
        return { status: 'unavailable', reason: 'WebGPU adapter is unavailable' };
      }

      const device = await adapter.requestDevice();
      const mapReadBufferSizes: number[] = [];
      const trackedDevice = new Proxy(device, {
        get(target, prop, _receiver) {
          if (prop === 'createBuffer') {
            return (descriptor: BrowserGpuBufferDescriptor) => {
              if ((descriptor.usage & bufferUsageMapRead) !== 0) {
                mapReadBufferSizes.push(Number(descriptor.size));
              }
              return target.createBuffer(descriptor);
            };
          }

          const value = Reflect.get(target, prop, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });

      const psnrModulePath = '/src/splat/webgpu/psnrTextureCompute.ts';
      const {
        accumulatePsnrTextureReductions,
        computePsnrFromRgbaTexturesWebGpu,
        computePsnrFromTextureReduction,
        computePsnrTextureReductionFromRgbaTexturesWebGpu,
      } = await import(psnrModulePath) as BrowserPsnrModule;

      const uploadTexture = (
        texture: BrowserGpuTexture,
        width: number,
        height: number,
        pixels: Uint8Array
      ) => {
        const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
        const upload = new Uint8Array(bytesPerRow * height);
        for (let y = 0; y < height; y++) {
          upload.set(
            pixels.subarray(y * width * 4, (y + 1) * width * 4),
            y * bytesPerRow
          );
        }
        device.queue.writeTexture(
          { texture },
          upload,
          { bytesPerRow, rowsPerImage: height },
          { width, height }
        );
      };

      const runCase = async (
        width: number,
        height: number,
        renderedPixels: Uint8Array,
        groundTruthPixels: Uint8Array,
        maskPixels?: Uint8Array
      ): Promise<BrowserPsnrMetric> => {
        const renderedTexture = device.createTexture({
          size: { width, height },
          format: 'rgba8unorm',
          usage: textureUsageCopyDst | textureUsageTextureBinding,
        });
        const groundTruthTexture = device.createTexture({
          size: { width, height },
          format: 'rgba8unorm',
          usage: textureUsageCopyDst | textureUsageTextureBinding,
        });
        const maskTexture = maskPixels
          ? device.createTexture({
            size: { width, height },
            format: 'rgba8unorm',
            usage: textureUsageCopyDst | textureUsageTextureBinding,
          })
          : undefined;
        try {
          uploadTexture(renderedTexture, width, height, renderedPixels);
          uploadTexture(groundTruthTexture, width, height, groundTruthPixels);
          if (maskTexture && maskPixels) {
            uploadTexture(maskTexture, width, height, maskPixels);
          }
          return await computePsnrFromRgbaTexturesWebGpu({
            device: trackedDevice,
            renderedTexture,
            groundTruthTexture,
            ...(maskTexture ? { maskTexture } : {}),
            width,
            height,
          });
        } finally {
          maskTexture?.destroy();
          renderedTexture.destroy();
          groundTruthTexture.destroy();
        }
      };

      const runTiledParityCase = async (): Promise<{
        full: BrowserPsnrMetric;
        tiled: BrowserPsnrMetric;
      }> => {
        const width = 4;
        const height = 2;
        const renderedPixels = new Uint8Array(width * height * 4);
        const groundTruthPixels = new Uint8Array(width * height * 4);
        for (let pixel = 0; pixel < width * height; pixel++) {
          renderedPixels[pixel * 4 + 3] = 255;
          groundTruthPixels[pixel * 4 + 3] = 255;
        }
        groundTruthPixels[1 * 4] = 10;
        groundTruthPixels[7 * 4 + 1] = 20;

        const renderedTexture = device.createTexture({
          size: { width, height },
          format: 'rgba8unorm',
          usage: textureUsageCopyDst | textureUsageTextureBinding,
        });
        const groundTruthTexture = device.createTexture({
          size: { width, height },
          format: 'rgba8unorm',
          usage: textureUsageCopyDst | textureUsageTextureBinding,
        });
        try {
          uploadTexture(renderedTexture, width, height, renderedPixels);
          uploadTexture(groundTruthTexture, width, height, groundTruthPixels);
          const full = await computePsnrFromRgbaTexturesWebGpu({
            device: trackedDevice,
            renderedTexture,
            groundTruthTexture,
            width,
            height,
          });
          const left = await computePsnrTextureReductionFromRgbaTexturesWebGpu({
            device: trackedDevice,
            renderedTexture,
            groundTruthTexture,
            width: 2,
            height,
          });
          const right = await computePsnrTextureReductionFromRgbaTexturesWebGpu({
            device: trackedDevice,
            renderedTexture,
            groundTruthTexture,
            width: 2,
            height,
            renderedOrigin: { x: 2, y: 0 },
            groundTruthOrigin: { x: 2, y: 0 },
          });
          const tiled = computePsnrFromTextureReduction(
            accumulatePsnrTextureReductions([left, right])
          );
          return { full, tiled };
        } finally {
          renderedTexture.destroy();
          groundTruthTexture.destroy();
        }
      };

      const basicRendered = new Uint8Array([
        10, 20, 30, 255,
        100, 100, 100, 255,
      ]);
      const basicGroundTruth = new Uint8Array([
        10, 20, 30, 255,
        110, 100, 100, 255,
      ]);
      const identicalPixels = new Uint8Array([
        5, 6, 7, 255,
        8, 9, 10, 255,
      ]);
      const alphaZeroRendered = new Uint8Array([
        255, 255, 255, 255,
        1, 2, 3, 255,
      ]);
      const alphaZeroGroundTruth = new Uint8Array([
        0, 0, 0, 0,
        4, 5, 6, 0,
      ]);
      const alphaMaskRendered = new Uint8Array([
        10, 20, 30, 255,
        255, 255, 255, 255,
        8, 9, 10, 255,
      ]);
      const alphaMaskGroundTruth = new Uint8Array([
        10, 20, 30, 255,
        0, 0, 0, 255,
        8, 9, 10, 255,
      ]);
      const alphaMask = new Uint8Array([
        255, 255, 255, 255,
        0, 0, 0, 0,
        255, 255, 255, 0,
      ]);
      const multiWorkgroupRendered = new Uint8Array(129 * 4);
      const multiWorkgroupGroundTruth = new Uint8Array(129 * 4);
      for (let pixel = 0; pixel < 129; pixel++) {
        multiWorkgroupRendered[pixel * 4 + 3] = 255;
        multiWorkgroupGroundTruth[pixel * 4 + 3] = 255;
      }
      multiWorkgroupGroundTruth[0] = 255;
      multiWorkgroupGroundTruth[1] = 255;
      multiWorkgroupGroundTruth[2] = 255;

      const carryWidth = 256;
      const carryHeight = 100;
      const carryRendered = new Uint8Array(carryWidth * carryHeight * 4);
      const carryGroundTruth = new Uint8Array(carryWidth * carryHeight * 4);
      for (let pixel = 0; pixel < carryWidth * carryHeight; pixel++) {
        carryRendered[pixel * 4 + 3] = 255;
        carryGroundTruth[pixel * 4] = 255;
        carryGroundTruth[pixel * 4 + 1] = 255;
        carryGroundTruth[pixel * 4 + 2] = 255;
        carryGroundTruth[pixel * 4 + 3] = 255;
      }

      device.pushErrorScope('validation');
      try {
        const tiledParity = await runTiledParityCase();
        const cases = {
          basic: await runCase(2, 1, basicRendered, basicGroundTruth),
          identical: await runCase(2, 1, identicalPixels, identicalPixels),
          alphaZero: await runCase(2, 1, alphaZeroRendered, alphaZeroGroundTruth),
          alphaMask: await runCase(3, 1, alphaMaskRendered, alphaMaskGroundTruth, alphaMask),
          multiWorkgroup: await runCase(129, 1, multiWorkgroupRendered, multiWorkgroupGroundTruth),
          carry64: await runCase(carryWidth, carryHeight, carryRendered, carryGroundTruth),
          tiledFull: tiledParity.full,
          tiledAccumulated: tiledParity.tiled,
        };
        await device.queue.onSubmittedWorkDone();
        const validationError = await device.popErrorScope();
        return {
          status: 'ok',
          cases,
          validationError: validationError?.message ?? null,
          mapReadBufferSizes,
        };
      } finally {
        device.destroy();
      }
    });

    test.skip(result.status === 'unavailable', result.reason ?? 'WebGPU is unavailable');

    expect(result.validationError).toBeNull();
    expect(result.cases?.basic.validPixelCount).toBe(2);
    expect(result.cases?.basic.mse).toBeCloseTo(EXPECTED_MSE, 5);
    expect(result.cases?.basic.psnr).toBeCloseTo(EXPECTED_PSNR, 5);
    expect(result.cases?.identical).toMatchObject({
      psnr: Infinity,
      mse: 0,
      validPixelCount: 2,
    });
    expect(Number.isNaN(result.cases?.alphaZero.psnr)).toBe(true);
    expect(Number.isNaN(result.cases?.alphaZero.mse)).toBe(true);
    expect(result.cases?.alphaZero.validPixelCount).toBe(0);
    expect(result.cases?.alphaMask).toMatchObject({
      psnr: Infinity,
      mse: 0,
      validPixelCount: 1,
    });
    expect(result.cases?.multiWorkgroup.validPixelCount).toBe(129);
    expect(result.cases?.multiWorkgroup.mse).toBeCloseTo(WHITE_SQUARED_ERROR / (129 * 3), 5);
    expect(result.cases?.carry64.validPixelCount).toBe(256 * 100);
    expect(result.cases?.carry64.mse).toBeCloseTo(255 * 255, 5);
    expect(result.cases?.carry64.psnr).toBeCloseTo(0, 5);
    expect(result.cases?.tiledFull.sumSquaredError).toBe(500);
    expect(result.cases?.tiledAccumulated.sumSquaredError).toBe(result.cases?.tiledFull.sumSquaredError);
    expect(result.cases?.tiledAccumulated.validPixelCount).toBe(result.cases?.tiledFull.validPixelCount);
    expect(result.cases?.tiledAccumulated.mse).toBeCloseTo(result.cases?.tiledFull.mse ?? Number.NaN, 5);
    expect(result.cases?.tiledAccumulated.psnr).toBeCloseTo(result.cases?.tiledFull.psnr ?? Number.NaN, 5);
    expect(result.mapReadBufferSizes).toEqual([32, 32, 32, 32, 32, 32, 32, 32, 32]);
  });
});
