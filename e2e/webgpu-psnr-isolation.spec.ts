import { test, expect } from './fixtures/test-fixtures';

interface BrowserGaussianCloud {
  count: number;
  positions: Float32Array;
  scales: Float32Array;
  rotations: Float32Array;
  opacities: Float32Array;
  sh0: Float32Array;
  shDegree: number;
}

interface BrowserPsnrMetric {
  psnr: number;
  mse: number;
  validPixelCount: number;
}

interface BrowserPsnrSession {
  computeImageMetric(options: {
    imageFile: File;
    image: {
      imageId: number;
      qvec: [number, number, number, number];
      tvec: [number, number, number];
      cameraId: number;
      name: string;
      points2D: unknown[];
    };
    camera: {
      cameraId: number;
      modelId: number;
      width: number;
      height: number;
      params: number[];
    };
    width: number;
    height: number;
  }): Promise<BrowserPsnrMetric>;
  dispose(): void;
}

interface BrowserPsnrSessionModule {
  createWebGpuSplatPsnrSession(options: {
    device: BrowserGpuDevice;
    splatFile: File;
    deps: {
      loadGaussianCloudFromFile: (file: File) => Promise<{
        file: File;
        format: 'spz';
        byteLength: number;
        cloud: BrowserGaussianCloud;
      }>;
      createBitmap: () => Promise<ImageBitmap>;
      createGroundTruthTexture: (options: {
        device: BrowserGpuDevice;
        targetWidth: number;
        targetHeight: number;
      }) => BrowserGroundTruthTexture;
    };
  }): Promise<BrowserPsnrSession>;
}

interface BrowserGroundTruthTexture {
  texture: BrowserGpuTexture;
  width: number;
  height: number;
  dispose(): void;
}

interface BrowserGpuTexture {
  destroy(): void;
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
}

interface BrowserGpuDevice {
  createBuffer(descriptor: BrowserGpuBufferDescriptor): unknown;
  createTexture(descriptor: {
    label?: string;
    size: { width: number; height: number };
    format: string;
    usage: number;
  }): BrowserGpuTexture;
  queue: BrowserGpuQueue;
  destroy(): void;
}

interface BrowserGpuAdapter {
  requestDevice(): Promise<BrowserGpuDevice>;
}

interface BrowserNavigatorWithWebGpu extends Omit<Navigator, 'gpu'> {
  gpu?: {
    requestAdapter(options?: { powerPreference?: 'high-performance' | 'low-power' }): Promise<BrowserGpuAdapter | null>;
  };
}

interface BrowserIsolationResult {
  status: 'ok' | 'unavailable' | 'error';
  reason?: string;
  metric?: BrowserPsnrMetric;
  visiblePixelsChanged?: boolean;
  domCanvasCountBefore?: number;
  domCanvasCountAfter?: number;
  createdDomCanvasCount?: number;
  mapReadBufferSizes?: number[];
  viewerCameraState?: number;
}

test.describe('WebGPU PSNR isolation', () => {
  test('keeps metric rendering off the visible surface while viewer camera state changes', async ({ page }) => {
    await page.goto('/e2e-webgpu-harness.html', { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate<BrowserIsolationResult>(async () => {
      const webGpuNavigator = navigator as BrowserNavigatorWithWebGpu;
      const bufferUsageMapRead = 0x0001;
      const textureUsageCopyDst = 0x02;
      const textureUsageTextureBinding = 0x04;
      if (!webGpuNavigator.gpu) {
        return { status: 'unavailable', reason: 'navigator.gpu is unavailable' };
      }

      let adapter: BrowserGpuAdapter | null = null;
      let device: BrowserGpuDevice | null = null;
      try {
        adapter = await webGpuNavigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) {
          return { status: 'unavailable', reason: 'WebGPU adapter is unavailable' };
        }
        device = await adapter.requestDevice();
      } catch (error) {
        return {
          status: 'unavailable',
          reason: error instanceof Error ? error.message : String(error),
        };
      }

      const visibleCanvas = document.createElement('canvas');
      visibleCanvas.width = 64;
      visibleCanvas.height = 64;
      visibleCanvas.style.cssText = 'position:fixed;left:0;top:0;width:64px;height:64px;';
      document.body.appendChild(visibleCanvas);
      const visibleContext = visibleCanvas.getContext('2d');
      if (!visibleContext) {
        device.destroy();
        return { status: 'error', reason: '2D visible canvas context is unavailable' };
      }
      for (let y = 0; y < visibleCanvas.height; y++) {
        for (let x = 0; x < visibleCanvas.width; x++) {
          visibleContext.fillStyle = `rgb(${(x * 3) % 255}, ${(y * 5) % 255}, ${((x + y) * 7) % 255})`;
          visibleContext.fillRect(x, y, 1, 1);
        }
      }

      const beforePixels = new Uint8Array(
        visibleContext.getImageData(0, 0, visibleCanvas.width, visibleCanvas.height).data
      );
      const domCanvasCountBefore = document.querySelectorAll('canvas').length;
      const originalCreateElement = document.createElement.bind(document);
      let createdDomCanvasCount = 0;
      document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
        if (tagName.toLowerCase() === 'canvas') {
          createdDomCanvasCount += 1;
        }
        return originalCreateElement(tagName, options);
      }) as typeof document.createElement;

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
      }) as BrowserGpuDevice;

      let session: BrowserPsnrSession | null = null;
      try {
        const shC0 = 0.28209479177387814;
        const cloud: BrowserGaussianCloud = {
          count: 1,
          positions: new Float32Array([0, 0, 2]),
          scales: new Float32Array([0.12, 0.12, 0.12]),
          rotations: new Float32Array([1, 0, 0, 0]),
          opacities: new Float32Array([0.95]),
          sh0: new Float32Array([
            (1.0 - 0.5) / shC0,
            (0.1 - 0.5) / shC0,
            (0.1 - 0.5) / shC0,
          ]),
          shDegree: 0,
        };
        const bitmapSource = new OffscreenCanvas(64, 64);
        const bitmapContext = bitmapSource.getContext('2d');
        if (!bitmapContext) {
          throw new Error('OffscreenCanvas 2D context is unavailable');
        }
        bitmapContext.fillStyle = 'rgb(0, 0, 0)';
        bitmapContext.fillRect(0, 0, 64, 64);
        const imageFile = new File(['image'], 'synthetic.png', { type: 'image/png' });
        const splatFile = new File(['splat'], 'synthetic.spz');
        const psnrSessionModulePath = '/src/splat/webgpu/psnrSplatSession.ts';
        const { createWebGpuSplatPsnrSession } = await import(psnrSessionModulePath) as BrowserPsnrSessionModule;
        session = await createWebGpuSplatPsnrSession({
          device: trackedDevice,
          splatFile,
          deps: {
            loadGaussianCloudFromFile: async (file) => ({
              file,
              format: 'spz',
              byteLength: file.size,
              cloud,
            }),
            createBitmap: async () => createImageBitmap(bitmapSource),
            createGroundTruthTexture: ({ device, targetWidth, targetHeight }) => {
              const texture = device.createTexture({
                label: 'psnr isolation opaque ground truth',
                size: { width: targetWidth, height: targetHeight },
                format: 'rgba8unorm',
                usage: textureUsageCopyDst | textureUsageTextureBinding,
              });
              const bytesPerRow = Math.ceil((targetWidth * 4) / 256) * 256;
              const upload = new Uint8Array(bytesPerRow * targetHeight);
              for (let y = 0; y < targetHeight; y++) {
                for (let x = 0; x < targetWidth; x++) {
                  const offset = y * bytesPerRow + x * 4;
                  upload[offset + 3] = 255;
                }
              }
              device.queue.writeTexture(
                { texture },
                upload,
                { bytesPerRow, rowsPerImage: targetHeight },
                { width: targetWidth, height: targetHeight }
              );
              return {
                texture,
                width: targetWidth,
                height: targetHeight,
                dispose: () => texture.destroy(),
              };
            },
          },
        });

        const metricPromise = session.computeImageMetric({
          imageFile,
          image: {
            imageId: 1,
            qvec: [1, 0, 0, 0],
            tvec: [0, 0, 0],
            cameraId: 1,
            name: 'synthetic.png',
            points2D: [],
          },
          camera: {
            cameraId: 1,
            modelId: 1,
            width: 64,
            height: 64,
            params: [80, 80, 32, 32],
          },
          width: 64,
          height: 64,
        });

        let viewerCameraState = 0;
        for (let frame = 0; frame < 3; frame++) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          viewerCameraState += 1;
        }
        const metric = await metricPromise;
        const afterPixels = visibleContext.getImageData(0, 0, visibleCanvas.width, visibleCanvas.height).data;
        let visiblePixelsChanged = false;
        for (let index = 0; index < beforePixels.length; index++) {
          if (beforePixels[index] !== afterPixels[index]) {
            visiblePixelsChanged = true;
            break;
          }
        }

        return {
          status: 'ok',
          metric,
          visiblePixelsChanged,
          domCanvasCountBefore,
          domCanvasCountAfter: document.querySelectorAll('canvas').length,
          createdDomCanvasCount,
          mapReadBufferSizes,
          viewerCameraState,
        };
      } catch (error) {
        return {
          status: 'error',
          reason: error instanceof Error ? error.message : String(error),
        };
      } finally {
        document.createElement = originalCreateElement;
        session?.dispose();
        visibleCanvas.remove();
        device.destroy();
      }
    });

    test.skip(result.status === 'unavailable', result.reason ?? 'WebGPU is unavailable');

    expect(result.status, result.reason).toBe('ok');
    expect(result.visiblePixelsChanged).toBe(false);
    expect(result.domCanvasCountAfter).toBe(result.domCanvasCountBefore);
    expect(result.createdDomCanvasCount).toBe(0);
    expect(result.viewerCameraState).toBe(3);
    expect(result.metric?.validPixelCount).toBe(64 * 64);
    expect(result.metric?.mse).toBeGreaterThan(0);
    expect(result.mapReadBufferSizes).toEqual([16]);
  });
});
