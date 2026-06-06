import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCamera, buildFile, buildImage } from '../../test/builders';
import { CameraModelId } from '../../types/colmap';
import type { GaussianCloud, LoadedGaussianCloud } from '../gaussianCloud';
import {
  createWebGpuSplatPsnrSession,
  type WebGpuSplatPsnrSessionDeps,
} from './psnrSplatSession';
import type { GpuGaussianSceneRef } from './gaussianSceneResourceManager';
import type { SplatCameraFrame, SplatRenderSession } from './gaussianRenderer';
import {
  getWebGpuSplatDebugCounters,
  resetWebGpuSplatDebugCountersForTests,
} from './webGpuSplatDebugCounters';
import {
  getWebGpuSplatTelemetryEvents,
  resetWebGpuSplatTelemetryEventsForTests,
} from './webGpuSplatTelemetry';

const GPU_TEXTURE_USAGE_COPY_SRC = 0x01;
const GPU_TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
const GPU_TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const unsupportedMetricCameraModels = Object.entries(CameraModelId)
  .filter(([, modelId]) => modelId !== CameraModelId.SIMPLE_PINHOLE && modelId !== CameraModelId.PINHOLE) as Array<[string, CameraModelId]>;

function makeCloud(): GaussianCloud {
  return {
    count: 1,
    positions: new Float32Array([0, 0, 0]),
    scales: new Float32Array([1, 1, 1]),
    rotations: new Float32Array([1, 0, 0, 0]),
    opacities: new Float32Array([0.5]),
    sh0: new Float32Array([0.1, 0.2, 0.3]),
    shDegree: 0,
  };
}

function makeLoadedCloud(file: File): LoadedGaussianCloud {
  return {
    file,
    format: 'spz',
    byteLength: 123,
    cloud: makeCloud(),
  };
}

function makeTexture(label: string) {
  return {
    label,
    createView: vi.fn(() => ({ label: `${label}:view` } as unknown as GPUTextureView)),
    destroy: vi.fn(),
  } as unknown as GPUTexture & { destroy: ReturnType<typeof vi.fn> };
}

function makeDevice(options: {
  maxTextureDimension2D?: number;
} = {}) {
  const textures: GPUTextureDescriptor[] = [];
  return {
    textures,
    device: {
      limits: {
        maxTextureDimension2D: options.maxTextureDimension2D ?? 8192,
      },
      createTexture: vi.fn((descriptor: GPUTextureDescriptor) => {
        textures.push(descriptor);
        return makeTexture(String(descriptor.label ?? 'texture'));
      }),
    } as unknown as GPUDevice,
  };
}

function makeSceneRef(release = vi.fn()): GpuGaussianSceneRef {
  return {
    sceneId: 'scene',
    device: {} as GPUDevice,
    count: 1,
    shDegree: 0,
    bounds: {
      min: [0, 0, 0],
      max: [0, 0, 0],
      center: [0, 0, 0],
      size: 1,
    },
    gaussianBuffer: { destroy: vi.fn() },
    shBuffer: { destroy: vi.fn() },
    gaussianByteLength: 64,
    shByteLength: 0,
    release,
  };
}

function makeRenderSession(): SplatRenderSession {
  return {
    setCamera: vi.fn(),
    setBackgroundColor: vi.fn(),
    resize: vi.fn(),
    renderToCanvas: vi.fn(),
    renderToTexture: vi.fn(async () => undefined),
    getReadyState: vi.fn(() => 'initializing'),
    onFirstFrame: vi.fn(() => vi.fn()),
    dispose: vi.fn(),
  };
}

function makeFrame(): SplatCameraFrame {
  const viewMatrix = new Float32Array(16);
  const projectionMatrix = new Float32Array(16);
  const worldMatrix = new Float32Array(16);
  viewMatrix[0] = 1;
  viewMatrix[5] = 1;
  viewMatrix[10] = 1;
  viewMatrix[15] = 1;
  projectionMatrix[0] = 2;
  projectionMatrix[5] = 2;
  projectionMatrix[10] = -1;
  projectionMatrix[15] = 1;
  worldMatrix[0] = 1;
  worldMatrix[5] = 1;
  worldMatrix[10] = 1;
  worldMatrix[15] = 1;

  return {
    viewport: {
      cssWidth: 4,
      cssHeight: 3,
      pixelWidth: 4,
      pixelHeight: 3,
      dpr: 1,
    },
    camera: {
      kind: 'perspective',
      viewMatrix,
      projectionMatrix,
      worldMatrix,
      position: [0, 0, 0],
      near: 0.1,
      far: 100,
    },
  };
}

function makeBitmap(width = 4, height = 3) {
  return {
    width,
    height,
    close: vi.fn(),
  } as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createHarness(options: {
  device?: GPUDevice;
  renderSession?: SplatRenderSession;
  createRenderSession?: WebGpuSplatPsnrSessionDeps['createRenderSession'];
  computePsnrFromTextures?: WebGpuSplatPsnrSessionDeps['computePsnrFromTextures'];
  computePsnrTextureReductionFromTextures?: WebGpuSplatPsnrSessionDeps['computePsnrTextureReductionFromTextures'];
  computePsnrTextureColorDiagnosticsFromTextures?: WebGpuSplatPsnrSessionDeps['computePsnrTextureColorDiagnosticsFromTextures'];
  computePsnrTextureOffsetDiagnosticsFromTextures?: WebGpuSplatPsnrSessionDeps['computePsnrTextureOffsetDiagnosticsFromTextures'];
  createMetricFrame?: WebGpuSplatPsnrSessionDeps['createMetricFrame'];
} = {}) {
  const splatFile = buildFile('scene.spz', 'spz');
  const loadedCloud = makeLoadedCloud(splatFile);
  const sceneRelease = vi.fn();
  const sceneRef = makeSceneRef(sceneRelease);
  const resourceManager = {
    acquire: vi.fn(() => sceneRef),
    dispose: vi.fn(),
  };
  const renderSession = options.renderSession ?? makeRenderSession();
  const bitmap = makeBitmap();
  const groundTruthTexture = {
    texture: makeTexture('ground-truth'),
    width: 4,
    height: 3,
    dispose: vi.fn(),
  };
  const metric = {
    sumSquaredError: 492,
    psnr: 32,
    mse: 41,
    validPixelCount: 12,
  };
  const deps = {
    loadGaussianCloudFromFile: vi.fn(async () => loadedCloud),
    createSceneResourceManager: vi.fn(() => resourceManager),
    createRenderSession: options.createRenderSession ?? vi.fn(() => renderSession),
    createBitmap: vi.fn(async () => bitmap),
    createGroundTruthTexture: vi.fn(() => groundTruthTexture),
    computePsnrFromTextures: options.computePsnrFromTextures ?? vi.fn(async () => metric),
    computePsnrTextureReductionFromTextures: options.computePsnrTextureReductionFromTextures
      ?? vi.fn(async () => ({ sumSquaredError: 0, validPixelCount: 1 })),
    computePsnrTextureColorDiagnosticsFromTextures: options.computePsnrTextureColorDiagnosticsFromTextures
      ?? vi.fn(async () => ({
        validPixelCount: 12,
        validPixelRatio: 1,
        renderedMeanRgb: [10, 20, 30],
        groundTruthMeanRgb: [11, 19, 31],
        meanRgbDelta: [-1, 1, -1],
      })),
    computePsnrTextureOffsetDiagnosticsFromTextures: options.computePsnrTextureOffsetDiagnosticsFromTextures
      ?? vi.fn(async () => ({
        maxOffsetPixels: 2,
        evaluatedOffsetCount: 25,
        baseline: {
          dx: 0,
          dy: 0,
          sumSquaredError: 100,
          psnr: 15,
          mse: 8.33,
          validPixelCount: 12,
        },
        best: {
          dx: -1,
          dy: 0,
          sumSquaredError: 10,
          psnr: 25,
          mse: 0.83,
          validPixelCount: 12,
        },
        improvementDb: 10,
      })),
    createMetricFrame: options.createMetricFrame ?? vi.fn(() => makeFrame()),
  } satisfies WebGpuSplatPsnrSessionDeps;

  return {
    bitmap,
    deps,
    groundTruthTexture,
    loadedCloud,
    metric,
    renderSession,
    resourceManager,
    sceneRef,
    sceneRelease,
    splatFile,
    device: options.device ?? makeDevice().device,
  };
}

describe('WebGPU splat PSNR session', () => {
  beforeEach(() => {
    resetWebGpuSplatDebugCountersForTests();
    resetWebGpuSplatTelemetryEventsForTests();
  });

  it('renders pinhole image metrics through offscreen textures and tiny texture reduction', async () => {
    const fakeDevice = makeDevice();
    const harness = createHarness({ device: fakeDevice.device });
    const image = buildImage();
    const camera = buildCamera({ width: 4, height: 3 });
    const imageFile = buildFile('image.jpg');
    const transform = {
      scale: 1.5,
      rotationX: 0.1,
      rotationY: -0.2,
      rotationZ: 0.3,
      translationX: 1,
      translationY: 2,
      translationZ: -3,
    };

    const session = await createWebGpuSplatPsnrSession({
      device: fakeDevice.device,
      splatFile: harness.splatFile,
      deps: harness.deps,
    });
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      psnrSessions: 1,
      activePsnrImageJobs: 0,
      textures: 0,
    });
    const metric = await session.computeImageMetric({
      imageFile,
      image,
      camera,
      width: 4,
      height: 3,
      transform,
    });

    expect(metric).toEqual(harness.metric);
    expect(harness.deps.loadGaussianCloudFromFile).toHaveBeenCalledWith(harness.splatFile);
    expect(harness.resourceManager.acquire).toHaveBeenCalledWith(fakeDevice.device, expect.objectContaining({
      cloud: harness.loadedCloud.cloud,
      labelPrefix: 'psnr scene.spz',
      sceneId: expect.stringContaining('psnr:spz:scene.spz'),
    }));
    expect(harness.deps.createRenderSession).toHaveBeenCalledWith(expect.objectContaining({
      device: fakeDevice.device,
      scene: harness.sceneRef,
      format: 'rgba8unorm',
      width: 1,
      height: 1,
      backgroundColor: [0, 0, 0, 1],
    }));
    const renderSessionOptions = vi.mocked(harness.deps.createRenderSession).mock.calls[0][0];
    expect(renderSessionOptions).not.toHaveProperty('canvasContext');
    expect(harness.deps.createBitmap).toHaveBeenCalledWith(imageFile, {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    expect(harness.deps.createMetricFrame).toHaveBeenCalledWith({
      image,
      camera,
      width: 4,
      height: 3,
      transform,
    });
    expect(harness.renderSession.setCamera).toHaveBeenCalledTimes(1);
    expect(harness.renderSession.renderToTexture).toHaveBeenCalledTimes(1);
    expect(harness.renderSession.renderToCanvas).not.toHaveBeenCalled();
    expect(fakeDevice.textures).toEqual([
      expect.objectContaining({
        format: 'rgba8unorm',
        size: { width: 4, height: 3 },
        usage: GPU_TEXTURE_USAGE_COPY_SRC
          | GPU_TEXTURE_USAGE_TEXTURE_BINDING
          | GPU_TEXTURE_USAGE_RENDER_ATTACHMENT,
      }),
    ]);
    const renderedTexture = vi.mocked(harness.renderSession.renderToTexture).mock.calls[0][0];
    expect(harness.renderSession.renderToTexture).toHaveBeenCalledWith(
      renderedTexture,
      { completion: 'submitted' }
    );
    expect(harness.deps.computePsnrFromTextures).toHaveBeenCalledWith({
      device: fakeDevice.device,
      renderedTexture,
      groundTruthTexture: harness.groundTruthTexture.texture,
      width: 4,
      height: 3,
    });
    expect(harness.deps.computePsnrTextureColorDiagnosticsFromTextures).not.toHaveBeenCalled();
    expect(harness.deps.computePsnrTextureOffsetDiagnosticsFromTextures).not.toHaveBeenCalled();
    expect(harness.groundTruthTexture.dispose).toHaveBeenCalledTimes(1);
    expect(harness.bitmap.close).toHaveBeenCalledTimes(1);
    expect(renderedTexture.destroy).toHaveBeenCalledTimes(1);
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      psnrSessions: 1,
      activePsnrImageJobs: 0,
      textures: 0,
    });
    expect(getWebGpuSplatTelemetryEvents()).toContainEqual(expect.objectContaining({
      name: 'psnr-image',
      imagesPerSecond: expect.any(Number),
      details: expect.objectContaining({
        imageName: image.name,
        width: 4,
        height: 3,
        tiled: false,
        validPixelCount: 12,
      }),
    }));

    session.dispose();
    session.dispose();
    expect(harness.renderSession.dispose).toHaveBeenCalledTimes(1);
    expect(harness.resourceManager.dispose).toHaveBeenCalledTimes(1);
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      psnrSessions: 0,
      activePsnrImageJobs: 0,
      textures: 0,
    });
  });

  it('attaches GPU diagnostics for suspiciously low finite PSNR metrics when enabled', async () => {
    const fakeDevice = makeDevice();
    const lowMetric = {
      sumSquaredError: 1_000_000,
      psnr: 15,
      mse: 27_777.78,
      validPixelCount: 12,
    };
    const whiteMetric = {
      sumSquaredError: 400_000,
      psnr: 19,
      mse: 11_111.11,
      validPixelCount: 12,
    };
    const colorDiagnostics = {
      validPixelCount: 12,
      validPixelRatio: 1,
      renderedMeanRgb: [8, 9, 10] as [number, number, number],
      groundTruthMeanRgb: [60, 61, 62] as [number, number, number],
      meanRgbDelta: [-52, -52, -52] as [number, number, number],
    };
    const offsetDiagnostics = {
      maxOffsetPixels: 2,
      evaluatedOffsetCount: 25,
      baseline: {
        dx: 0,
        dy: 0,
        sumSquaredError: 1_000_000,
        psnr: 15,
        mse: 27_777.78,
        validPixelCount: 12,
      },
      best: {
        dx: -1,
        dy: 0,
        sumSquaredError: 100_000,
        psnr: 25,
        mse: 2_777.78,
        validPixelCount: 12,
      },
      improvementDb: 10,
    };
    const computePsnrFromTextures = vi.fn()
      .mockResolvedValueOnce(lowMetric)
      .mockResolvedValueOnce(whiteMetric);
    const computePsnrTextureColorDiagnosticsFromTextures = vi.fn(async () => colorDiagnostics);
    const computePsnrTextureOffsetDiagnosticsFromTextures = vi.fn(async () => offsetDiagnostics);
    const harness = createHarness({
      device: fakeDevice.device,
      computePsnrFromTextures,
      computePsnrTextureColorDiagnosticsFromTextures,
      computePsnrTextureOffsetDiagnosticsFromTextures,
    });
    const session = await createWebGpuSplatPsnrSession({
      device: fakeDevice.device,
      splatFile: harness.splatFile,
      deps: harness.deps,
    });

    const metric = await session.computeImageMetric({
      imageFile: buildFile('low.jpg'),
      image: buildImage(),
      camera: buildCamera({ width: 4, height: 3 }),
      width: 4,
      height: 3,
      includeDiagnostics: true,
    });

    expect(metric).toEqual({
      ...lowMetric,
      colorDiagnostics,
      offsetDiagnostics,
      backgroundDiagnostics: {
        baseline: {
          label: 'opaque-black',
          rgba: [0, 0, 0, 1],
          ...lowMetric,
          improvementDb: 0,
        },
        alternatives: [{
          label: 'opaque-white',
          rgba: [1, 1, 1, 1],
          ...whiteMetric,
          improvementDb: 4,
        }],
        best: {
          label: 'opaque-white',
          rgba: [1, 1, 1, 1],
          ...whiteMetric,
          improvementDb: 4,
        },
      },
    });
    const renderedTexture = vi.mocked(harness.renderSession.renderToTexture).mock.calls[0][0];
    const alternateRenderedTexture = vi.mocked(harness.renderSession.renderToTexture).mock.calls[1][0];
    expect(harness.renderSession.renderToTexture).toHaveBeenCalledTimes(2);
    expect(harness.renderSession.setBackgroundColor).toHaveBeenNthCalledWith(1, [0, 0, 0, 1]);
    expect(harness.renderSession.setBackgroundColor).toHaveBeenNthCalledWith(2, [1, 1, 1, 1]);
    expect(harness.renderSession.setBackgroundColor).toHaveBeenNthCalledWith(3, [0, 0, 0, 1]);
    expect(computePsnrFromTextures).toHaveBeenNthCalledWith(1, {
      device: fakeDevice.device,
      renderedTexture,
      groundTruthTexture: harness.groundTruthTexture.texture,
      width: 4,
      height: 3,
    });
    expect(computePsnrFromTextures).toHaveBeenNthCalledWith(2, {
      device: fakeDevice.device,
      renderedTexture: alternateRenderedTexture,
      groundTruthTexture: harness.groundTruthTexture.texture,
      width: 4,
      height: 3,
    });
    expect(computePsnrTextureColorDiagnosticsFromTextures).toHaveBeenCalledWith({
      device: fakeDevice.device,
      renderedTexture,
      groundTruthTexture: harness.groundTruthTexture.texture,
      width: 4,
      height: 3,
    });
    expect(computePsnrTextureOffsetDiagnosticsFromTextures).toHaveBeenCalledWith({
      device: fakeDevice.device,
      renderedTexture,
      groundTruthTexture: harness.groundTruthTexture.texture,
      width: 4,
      height: 3,
    });
    expect(renderedTexture.destroy).toHaveBeenCalledTimes(1);
    expect(alternateRenderedTexture.destroy).toHaveBeenCalledTimes(1);
    expect(harness.groundTruthTexture.dispose).toHaveBeenCalledTimes(1);

    session.dispose();
  });

  it('skips low-PSNR diagnostics by default', async () => {
    const fakeDevice = makeDevice();
    const lowMetric = {
      sumSquaredError: 1_000_000,
      psnr: 15,
      mse: 27_777.78,
      validPixelCount: 12,
    };
    const computePsnrFromTextures = vi.fn().mockResolvedValueOnce(lowMetric);
    const harness = createHarness({
      device: fakeDevice.device,
      computePsnrFromTextures,
    });
    const session = await createWebGpuSplatPsnrSession({
      device: fakeDevice.device,
      splatFile: harness.splatFile,
      deps: harness.deps,
    });

    const metric = await session.computeImageMetric({
      imageFile: buildFile('low.jpg'),
      image: buildImage(),
      camera: buildCamera({ width: 4, height: 3 }),
      width: 4,
      height: 3,
    });

    expect(metric).toEqual(lowMetric);
    expect(harness.renderSession.renderToTexture).toHaveBeenCalledTimes(1);
    expect(computePsnrFromTextures).toHaveBeenCalledTimes(1);
    expect(harness.deps.computePsnrTextureColorDiagnosticsFromTextures).not.toHaveBeenCalled();
    expect(harness.deps.computePsnrTextureOffsetDiagnosticsFromTextures).not.toHaveBeenCalled();

    session.dispose();
  });

  it('renders low-PSNR background diagnostics with the original frame when another image is queued', async () => {
    const fakeDevice = makeDevice();
    const firstFrame = makeFrame();
    const secondFrame = makeFrame({
      camera: {
        ...makeFrame().camera,
        position: [9, 8, 7],
      },
    });
    const firstBaseline = createDeferred<{
      sumSquaredError: number;
      psnr: number;
      mse: number;
      validPixelCount: number;
    }>();
    const secondBaseline = createDeferred<{
      sumSquaredError: number;
      psnr: number;
      mse: number;
      validPixelCount: number;
    }>();
    const lowMetric = {
      sumSquaredError: 1_000_000,
      psnr: 15,
      mse: 27_777.78,
      validPixelCount: 12,
    };
    const secondMetric = {
      sumSquaredError: 120,
      psnr: 34,
      mse: 3.33,
      validPixelCount: 12,
    };
    const alternateMetric = {
      sumSquaredError: 400_000,
      psnr: 19,
      mse: 11_111.11,
      validPixelCount: 12,
    };
    const computePsnrFromTextures = vi.fn()
      .mockReturnValueOnce(firstBaseline.promise)
      .mockReturnValueOnce(secondBaseline.promise)
      .mockResolvedValueOnce(alternateMetric);
    const createMetricFrame = vi.fn()
      .mockReturnValueOnce(firstFrame)
      .mockReturnValueOnce(secondFrame);
    const harness = createHarness({
      device: fakeDevice.device,
      computePsnrFromTextures,
      createMetricFrame,
    });
    const session = await createWebGpuSplatPsnrSession({
      device: fakeDevice.device,
      splatFile: harness.splatFile,
      deps: harness.deps,
    });

    const firstSubmitted = await session.submitImageMetric({
      imageFile: buildFile('first.jpg'),
      image: buildImage({ imageId: 1, name: 'first.jpg' }),
      camera: buildCamera({ width: 4, height: 3 }),
      width: 4,
      height: 3,
      includeDiagnostics: true,
    });
    await flushPromises();
    expect(computePsnrFromTextures).toHaveBeenCalledTimes(1);

    const secondSubmitted = await session.submitImageMetric({
      imageFile: buildFile('second.jpg'),
      image: buildImage({ imageId: 2, name: 'second.jpg' }),
      camera: buildCamera({ width: 4, height: 3 }),
      width: 4,
      height: 3,
    });
    await flushPromises();
    expect(computePsnrFromTextures).toHaveBeenCalledTimes(2);

    firstBaseline.resolve(lowMetric);
    await expect(firstSubmitted.result).resolves.toMatchObject({
      psnr: 15,
      backgroundDiagnostics: {
        baseline: expect.objectContaining({
          label: 'opaque-black',
        }),
        best: expect.objectContaining({
          label: 'opaque-white',
        }),
      },
    });

    expect(harness.renderSession.setCamera).toHaveBeenNthCalledWith(1, firstFrame);
    expect(harness.renderSession.setCamera).toHaveBeenNthCalledWith(2, secondFrame);
    expect(harness.renderSession.setCamera).toHaveBeenNthCalledWith(3, firstFrame);
    expect(harness.renderSession.setBackgroundColor).toHaveBeenNthCalledWith(1, [0, 0, 0, 1]);
    expect(harness.renderSession.setBackgroundColor).toHaveBeenNthCalledWith(2, [0, 0, 0, 1]);
    expect(harness.renderSession.setBackgroundColor).toHaveBeenNthCalledWith(3, [1, 1, 1, 1]);
    expect(harness.renderSession.setBackgroundColor).toHaveBeenNthCalledWith(4, [0, 0, 0, 1]);

    secondBaseline.resolve(secondMetric);
    await expect(secondSubmitted.result).resolves.toEqual(secondMetric);

    firstSubmitted.dispose();
    secondSubmitted.dispose();
    session.dispose();
  });

  it('submits single-image metrics without waiting for scalar readback before returning a handle', async () => {
    const fakeDevice = makeDevice();
    const pendingMetric = createDeferred<{
      sumSquaredError: number;
      psnr: number;
      mse: number;
      validPixelCount: number;
    }>();
    const computePsnrFromTextures = vi.fn(() => pendingMetric.promise);
    const harness = createHarness({
      device: fakeDevice.device,
      computePsnrFromTextures,
    });
    const image = buildImage();
    const camera = buildCamera({ width: 4, height: 3 });
    const imageFile = buildFile('image.jpg');
    const session = await createWebGpuSplatPsnrSession({
      device: fakeDevice.device,
      splatFile: harness.splatFile,
      deps: harness.deps,
    });

    const submitted = await session.submitImageMetric({
      imageFile,
      image,
      camera,
      width: 4,
      height: 3,
    });
    await flushPromises();

    expect(harness.renderSession.renderToTexture).toHaveBeenCalledTimes(1);
    expect(computePsnrFromTextures).toHaveBeenCalledTimes(1);
    expect(harness.groundTruthTexture.dispose).not.toHaveBeenCalled();
    expect(harness.bitmap.close).not.toHaveBeenCalled();
    const renderedTexture = vi.mocked(harness.renderSession.renderToTexture).mock.calls[0][0];
    expect(renderedTexture.destroy).not.toHaveBeenCalled();

    pendingMetric.resolve(harness.metric);
    await expect(submitted.result).resolves.toEqual(harness.metric);

    expect(harness.groundTruthTexture.dispose).toHaveBeenCalledTimes(1);
    expect(harness.bitmap.close).toHaveBeenCalledTimes(1);
    expect(renderedTexture.destroy).toHaveBeenCalledTimes(1);
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      psnrSessions: 1,
      activePsnrImageJobs: 0,
      textures: 0,
    });

    submitted.dispose();
    session.dispose();
    expect(harness.groundTruthTexture.dispose).toHaveBeenCalledTimes(1);
    expect(harness.bitmap.close).toHaveBeenCalledTimes(1);
    expect(renderedTexture.destroy).toHaveBeenCalledTimes(1);
  });

  it('treats pinhole cameras with unequal fx and fy as undistorted metric inputs', async () => {
    const fakeDevice = makeDevice();
    const harness = createHarness({ device: fakeDevice.device });
    const image = buildImage();
    const camera = buildCamera({
      modelId: CameraModelId.PINHOLE,
      width: 4,
      height: 3,
      params: [700, 500, 2, 1.5],
    });
    const imageFile = buildFile('anisotropic-pinhole.jpg');
    const session = await createWebGpuSplatPsnrSession({
      device: fakeDevice.device,
      splatFile: harness.splatFile,
      deps: harness.deps,
    });

    const metric = await session.computeImageMetric({
      imageFile,
      image,
      camera,
      width: 4,
      height: 3,
    });

    expect(metric).toEqual(harness.metric);
    expect(harness.deps.createBitmap).toHaveBeenCalledTimes(1);
    expect(harness.deps.createGroundTruthTexture).toHaveBeenCalledTimes(1);
    expect(harness.deps.createMetricFrame).toHaveBeenCalledWith({
      image,
      camera,
      width: 4,
      height: 3,
      transform: undefined,
    });
    expect(harness.deps.computePsnrFromTextures).toHaveBeenCalledTimes(1);
  });

  it('invokes the default createImageBitmap with the global receiver', async () => {
    const mutableGlobal = globalThis as typeof globalThis & {
      createImageBitmap?: typeof createImageBitmap;
    };
    const originalCreateImageBitmap = mutableGlobal.createImageBitmap;
    const fakeDevice = makeDevice();
    const harness = createHarness({ device: fakeDevice.device });
    const deps: WebGpuSplatPsnrSessionDeps = { ...harness.deps };
    delete deps.createBitmap;
    const imageFile = buildFile('image.jpg');
    const createImageBitmapMock = vi.fn(function (
      this: typeof globalThis,
      _source: ImageBitmapSource,
      _options?: ImageBitmapOptions
    ) {
      expect(this).toBe(globalThis);
      return Promise.resolve(harness.bitmap);
    });
    mutableGlobal.createImageBitmap = createImageBitmapMock as unknown as typeof createImageBitmap;

    try {
      const session = await createWebGpuSplatPsnrSession({
        device: fakeDevice.device,
        splatFile: harness.splatFile,
        deps,
      });

      await session.computeImageMetric({
        imageFile,
        image: buildImage(),
        camera: buildCamera({ width: 4, height: 3 }),
        width: 4,
        height: 3,
      });

      expect(createImageBitmapMock).toHaveBeenCalledWith(imageFile, {
        colorSpaceConversion: 'none',
        premultiplyAlpha: 'none',
      });
    } finally {
      if (originalCreateImageBitmap) {
        mutableGlobal.createImageBitmap = originalCreateImageBitmap;
      } else {
        delete mutableGlobal.createImageBitmap;
      }
    }
  });

  it('rejects distorted cameras before decoding or allocating metric textures', async () => {
    const fakeDevice = makeDevice();
    const harness = createHarness({ device: fakeDevice.device });
    const session = await createWebGpuSplatPsnrSession({
      device: fakeDevice.device,
      splatFile: harness.splatFile,
      deps: harness.deps,
    });

    await expect(session.computeImageMetric({
      imageFile: buildFile('image.jpg'),
      image: buildImage(),
      camera: buildCamera({
        modelId: CameraModelId.OPENCV,
        params: [500, 500, 2, 1.5, 0.1, 0.01, 0, 0],
      }),
      width: 4,
      height: 3,
    })).rejects.toThrow('WebGPU PSNR currently requires an undistorted pinhole ground-truth image');

    expect(harness.deps.createBitmap).not.toHaveBeenCalled();
    expect(fakeDevice.textures).toEqual([]);
  });

  it('rejects every non-pinhole camera model before decoding or allocating metric textures', async () => {
    const fakeDevice = makeDevice();
    const harness = createHarness({ device: fakeDevice.device });
    const session = await createWebGpuSplatPsnrSession({
      device: fakeDevice.device,
      splatFile: harness.splatFile,
      deps: harness.deps,
    });

    for (const [modelName, modelId] of unsupportedMetricCameraModels) {
      await expect(session.computeImageMetric({
        imageFile: buildFile(`${modelName}.jpg`),
        image: buildImage(),
        camera: buildCamera({ modelId }),
        width: 4,
        height: 3,
      })).rejects.toThrow(`camera model ${modelName}`);
    }

    await expect(session.computeImageMetric({
      imageFile: buildFile('unknown.jpg'),
      image: buildImage(),
      camera: buildCamera({ modelId: 999 as CameraModelId }),
      width: 4,
      height: 3,
    })).rejects.toThrow('camera model 999');

    expect(harness.deps.createBitmap).not.toHaveBeenCalled();
    expect(fakeDevice.textures).toEqual([]);
  });

  it('releases per-image resources when offscreen rendering fails', async () => {
    const fakeDevice = makeDevice();
    const renderSession = makeRenderSession();
    renderSession.renderToTexture = vi.fn(async () => {
      throw new Error('render failed');
    });
    const harness = createHarness({ device: fakeDevice.device, renderSession });
    const session = await createWebGpuSplatPsnrSession({
      device: fakeDevice.device,
      splatFile: harness.splatFile,
      deps: harness.deps,
    });

    await expect(session.computeImageMetric({
      imageFile: buildFile('image.jpg'),
      image: buildImage(),
      camera: buildCamera({ width: 4, height: 3 }),
      width: 4,
      height: 3,
    })).rejects.toThrow('render failed');

    const renderedTexture = vi.mocked(renderSession.renderToTexture).mock.calls[0][0];
    expect(renderedTexture.destroy).toHaveBeenCalledTimes(1);
    expect(harness.groundTruthTexture.dispose).toHaveBeenCalledTimes(1);
    expect(harness.bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('releases per-image resources when texture reduction fails', async () => {
    const fakeDevice = makeDevice();
    const computePsnrFromTextures = vi.fn(async () => {
      throw new Error('reduction failed');
    });
    const harness = createHarness({
      device: fakeDevice.device,
      computePsnrFromTextures,
    });
    const session = await createWebGpuSplatPsnrSession({
      device: fakeDevice.device,
      splatFile: harness.splatFile,
      deps: harness.deps,
    });

    await expect(session.computeImageMetric({
      imageFile: buildFile('image.jpg'),
      image: buildImage(),
      camera: buildCamera({ width: 4, height: 3 }),
      width: 4,
      height: 3,
    })).rejects.toThrow('reduction failed');

    const renderedTexture = vi.mocked(harness.renderSession.renderToTexture).mock.calls[0][0];
    expect(renderedTexture.destroy).toHaveBeenCalledTimes(1);
    expect(harness.groundTruthTexture.dispose).toHaveBeenCalledTimes(1);
    expect(harness.bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('promptly releases active per-image resources when disposed during texture reduction', async () => {
    const fakeDevice = makeDevice();
    const reductionStarted = createDeferred<void>();
    const reductionResult = createDeferred<{
      sumSquaredError: number;
      psnr: number;
      mse: number;
      validPixelCount: number;
    }>();
    const computePsnrFromTextures = vi.fn(() => {
      reductionStarted.resolve();
      return reductionResult.promise;
    });
    const harness = createHarness({
      device: fakeDevice.device,
      computePsnrFromTextures,
    });
    const session = await createWebGpuSplatPsnrSession({
      device: fakeDevice.device,
      splatFile: harness.splatFile,
      deps: harness.deps,
    });

    const metricPromise = session.computeImageMetric({
      imageFile: buildFile('image.jpg'),
      image: buildImage(),
      camera: buildCamera({ width: 4, height: 3 }),
      width: 4,
      height: 3,
    });
    await reductionStarted.promise;
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      psnrSessions: 1,
      activePsnrImageJobs: 1,
      textures: 1,
    });

    const renderedTexture = vi.mocked(harness.renderSession.renderToTexture).mock.calls[0][0];
    expect(renderedTexture.destroy).not.toHaveBeenCalled();
    expect(harness.groundTruthTexture.dispose).not.toHaveBeenCalled();
    expect(harness.bitmap.close).not.toHaveBeenCalled();

    session.dispose();

    expect(renderedTexture.destroy).toHaveBeenCalledTimes(1);
    expect(harness.groundTruthTexture.dispose).toHaveBeenCalledTimes(1);
    expect(harness.bitmap.close).toHaveBeenCalledTimes(1);
    expect(harness.renderSession.dispose).toHaveBeenCalledTimes(1);
    expect(harness.resourceManager.dispose).toHaveBeenCalledTimes(1);
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      psnrSessions: 0,
      activePsnrImageJobs: 1,
      textures: 0,
    });

    reductionResult.resolve({
      sumSquaredError: 0,
      psnr: Infinity,
      mse: 0,
      validPixelCount: 12,
    });
    await expect(metricPromise).rejects.toThrow('WebGPU splat PSNR session has been disposed');
    expect(renderedTexture.destroy).toHaveBeenCalledTimes(1);
    expect(harness.groundTruthTexture.dispose).toHaveBeenCalledTimes(1);
    expect(harness.bitmap.close).toHaveBeenCalledTimes(1);
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      psnrSessions: 0,
      activePsnrImageJobs: 0,
      textures: 0,
    });
  });

  it('closes a decoded bitmap if disposed while image decode is pending', async () => {
    const fakeDevice = makeDevice();
    const bitmapDecode = createDeferred<ImageBitmap>();
    const harness = createHarness({ device: fakeDevice.device });
    harness.deps.createBitmap.mockReturnValueOnce(bitmapDecode.promise);
    const session = await createWebGpuSplatPsnrSession({
      device: fakeDevice.device,
      splatFile: harness.splatFile,
      deps: harness.deps,
    });

    const metricPromise = session.computeImageMetric({
      imageFile: buildFile('image.jpg'),
      image: buildImage(),
      camera: buildCamera({ width: 4, height: 3 }),
      width: 4,
      height: 3,
    });
    await Promise.resolve();

    session.dispose();
    bitmapDecode.resolve(harness.bitmap);

    await expect(metricPromise).rejects.toThrow('WebGPU splat PSNR session has been disposed');
    expect(harness.bitmap.close).toHaveBeenCalledTimes(1);
    expect(harness.deps.createGroundTruthTexture).not.toHaveBeenCalled();
    expect(fakeDevice.textures).toEqual([]);
  });

  it('tiles full-resolution metrics when source and target exceed the WebGPU texture limit together', async () => {
    const fakeDevice = makeDevice({ maxTextureDimension2D: 4 });
    const computeTileReduction = vi.fn()
      .mockResolvedValueOnce({ sumSquaredError: 0, validPixelCount: 12 })
      .mockResolvedValueOnce({ sumSquaredError: 12, validPixelCount: 6 });
    const harness = createHarness({
      device: fakeDevice.device,
      computePsnrTextureReductionFromTextures: computeTileReduction,
    });
    const bitmap = makeBitmap(6, 3);
    harness.deps.createBitmap.mockResolvedValueOnce(bitmap);
    const session = await createWebGpuSplatPsnrSession({
      device: fakeDevice.device,
      splatFile: harness.splatFile,
      deps: harness.deps,
    });

    const metric = await session.computeImageMetric({
      imageFile: buildFile('image.jpg'),
      image: buildImage(),
      camera: buildCamera({ width: 6, height: 3 }),
      width: 6,
      height: 3,
    });

    expect(metric.sumSquaredError).toBe(12);
    expect(metric.validPixelCount).toBe(18);
    expect(metric.mse).toBeCloseTo(12 / (18 * 3));
    expect(harness.deps.computePsnrFromTextures).not.toHaveBeenCalled();
    expect(harness.deps.createGroundTruthTexture).toHaveBeenNthCalledWith(1, expect.objectContaining({
      source: bitmap,
      sourceOrigin: { x: 0, y: 0 },
      sourceWidth: 4,
      sourceHeight: 3,
      targetWidth: 4,
      targetHeight: 3,
    }));
    expect(harness.deps.createGroundTruthTexture).toHaveBeenNthCalledWith(2, expect.objectContaining({
      source: bitmap,
      sourceOrigin: { x: 4, y: 0 },
      sourceWidth: 2,
      sourceHeight: 3,
      targetWidth: 2,
      targetHeight: 3,
    }));
    expect(harness.deps.createMetricFrame).toHaveBeenNthCalledWith(1, expect.objectContaining({
      width: 4,
      height: 3,
      tile: {
        fullWidth: 6,
        fullHeight: 3,
        originX: 0,
        originY: 0,
      },
    }));
    expect(harness.deps.createMetricFrame).toHaveBeenNthCalledWith(2, expect.objectContaining({
      width: 2,
      height: 3,
      tile: {
        fullWidth: 6,
        fullHeight: 3,
        originX: 4,
        originY: 0,
      },
    }));
    expect(fakeDevice.textures).toEqual([
      expect.objectContaining({ size: { width: 4, height: 3 } }),
      expect.objectContaining({ size: { width: 2, height: 3 } }),
    ]);
    expect(harness.renderSession.renderToTexture).toHaveBeenCalledTimes(2);
    expect(harness.renderSession.renderToTexture).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      { completion: 'submitted' }
    );
    expect(harness.renderSession.renderToTexture).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      { completion: 'submitted' }
    );
    expect(computeTileReduction).toHaveBeenCalledTimes(2);
    expect(harness.groundTruthTexture.dispose).toHaveBeenCalledTimes(2);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(getWebGpuSplatTelemetryEvents()).toContainEqual(expect.objectContaining({
      name: 'psnr-image',
      details: expect.objectContaining({
        width: 6,
        height: 3,
        tiled: true,
        validPixelCount: 18,
      }),
    }));
  });

  it('fails clearly when texture-limit overflow would also require resizing', async () => {
    const fakeDevice = makeDevice({ maxTextureDimension2D: 8 });
    const harness = createHarness({ device: fakeDevice.device });
    const session = await createWebGpuSplatPsnrSession({
      device: fakeDevice.device,
      splatFile: harness.splatFile,
      deps: harness.deps,
    });

    await expect(session.computeImageMetric({
      imageFile: buildFile('image.jpg'),
      image: buildImage(),
      camera: buildCamera({ width: 16, height: 3 }),
      width: 16,
      height: 3,
    })).rejects.toThrow('texture-limit tiling currently requires decoded source size 4x3 to match target size 16x3');

    expect(harness.deps.createBitmap).toHaveBeenCalledTimes(1);
    expect(harness.bitmap.close).toHaveBeenCalledTimes(1);
    expect(fakeDevice.textures).toEqual([]);
  });

  it('fails clearly when decoded source overflow would require resizing before GPU upload', async () => {
    const fakeDevice = makeDevice({ maxTextureDimension2D: 8 });
    const harness = createHarness({ device: fakeDevice.device });
    const oversizedBitmap = makeBitmap(16, 3);
    harness.deps.createBitmap.mockResolvedValueOnce(oversizedBitmap);
    const session = await createWebGpuSplatPsnrSession({
      device: fakeDevice.device,
      splatFile: harness.splatFile,
      deps: harness.deps,
    });

    await expect(session.computeImageMetric({
      imageFile: buildFile('image.jpg'),
      image: buildImage(),
      camera: buildCamera({ width: 4, height: 3 }),
      width: 4,
      height: 3,
    })).rejects.toThrow('texture-limit tiling currently requires decoded source size 16x3 to match target size 4x3');

    expect(harness.deps.createBitmap).toHaveBeenCalledTimes(1);
    expect(harness.deps.createGroundTruthTexture).not.toHaveBeenCalled();
    expect(oversizedBitmap.close).toHaveBeenCalledTimes(1);
    expect(fakeDevice.textures).toEqual([]);
  });

  it('releases acquired scene resources when render session creation fails', async () => {
    const fakeDevice = makeDevice();
    const harness = createHarness({
      device: fakeDevice.device,
      createRenderSession: vi.fn(() => {
        throw new Error('bad pipeline');
      }),
    });

    await expect(createWebGpuSplatPsnrSession({
      device: fakeDevice.device,
      splatFile: harness.splatFile,
      deps: harness.deps,
    })).rejects.toThrow('bad pipeline');

    expect(harness.sceneRelease).toHaveBeenCalledTimes(1);
    expect(harness.resourceManager.dispose).toHaveBeenCalledTimes(1);
  });
});
