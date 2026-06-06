import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSplatDepthRange,
  createSplatOutputUniforms,
  createSplatProjectionUniforms,
  createSplatRasterUniforms,
  createSplatRenderSession,
  createSplatRendererPipelineBuffers,
  type SplatCameraFrame,
  type SplatRenderSessionDeps,
} from './gaussianRenderer';
import type { GpuGaussianSceneRef } from './gaussianSceneResourceManager';
import {
  getWebGpuSplatDebugCounters,
  resetWebGpuSplatDebugCountersForTests,
} from './webGpuSplatDebugCounters';
import {
  getWebGpuSplatTelemetryEvents,
  resetWebGpuSplatTelemetryEventsForTests,
} from './webGpuSplatTelemetry';

type ProjectionModuleFactory = NonNullable<SplatRenderSessionDeps['createProjectionModule']>;
type SortModuleFactory = NonNullable<SplatRenderSessionDeps['createSortModule']>;
type RasterModuleFactory = NonNullable<SplatRenderSessionDeps['createRasterModule']>;
type OutputModuleFactory = NonNullable<SplatRenderSessionDeps['createOutputModule']>;

type FakeBuffer = GPUBuffer & {
  label: string;
  size: number;
  usage: number;
  destroy: ReturnType<typeof vi.fn>;
};

type FakeTexture = GPUTexture & {
  label: string;
  createView: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

type FakeModule = {
  name: string;
  configure: ReturnType<typeof vi.fn>;
  setUniforms: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

function makeBuffer(label: string, size = 16, usage = 0): FakeBuffer {
  return {
    label,
    size,
    usage,
    destroy: vi.fn(),
  } as unknown as FakeBuffer;
}

function makeTexture(label: string): FakeTexture {
  return {
    label,
    createView: vi.fn(() => ({ label: `${label}: view` }) as unknown as GPUTextureView),
    destroy: vi.fn(),
  } as unknown as FakeTexture;
}

function makeModule(name: string, order: string[]): FakeModule {
  return {
    name,
    configure: vi.fn(),
    setUniforms: vi.fn(),
    execute: vi.fn(() => order.push(name)),
    destroy: vi.fn(),
  };
}

function makeDevice(options: {
  validationError?: GPUError | null;
  limits?: GPUSupportedLimits;
} = {}) {
  const submittedCommand = { label: 'command' } as unknown as GPUCommandBuffer;
  const encoder = {
    finish: vi.fn(() => submittedCommand),
  } as unknown as GPUCommandEncoder;
  const device = {
    limits: options.limits,
    createBuffer: vi.fn((descriptor: GPUBufferDescriptor) =>
      makeBuffer(String(descriptor.label ?? ''), Number(descriptor.size), Number(descriptor.usage))
    ),
    createCommandEncoder: vi.fn(() => encoder),
    queue: {
      submit: vi.fn(),
      onSubmittedWorkDone: vi.fn(async () => undefined),
    },
    pushErrorScope: vi.fn(),
    popErrorScope: vi.fn(async () => options.validationError ?? null),
  } as unknown as GPUDevice;
  return { device, encoder, submittedCommand };
}

function makeRenderTargets(width: number, height: number, format: GPUTextureFormat) {
  const colorTexture = makeTexture(`rt-${width}x${height}`);
  return {
    colorTexture,
    colorView: { label: `${colorTexture.label}: color-view` } as unknown as GPUTextureView,
    depthTexture: null,
    depthView: null,
    width,
    height,
    format,
    output: {
      colorTexture,
    },
  };
}

function makeScene(overrides: Partial<GpuGaussianSceneRef> = {}): GpuGaussianSceneRef {
  return {
    sceneId: 'scene',
    device: {} as GPUDevice,
    count: 3,
    shDegree: 0,
    bounds: {
      min: [0, 0, 0],
      max: [1, 1, 1],
      center: [0.5, 0.5, 0.5],
      size: 1,
    },
    gaussianBuffer: makeBuffer('gaussians'),
    shBuffer: makeBuffer('sh'),
    gaussianByteLength: 3 * 64,
    shByteLength: 0,
    release: vi.fn(),
    ...overrides,
  };
}

function makeFrame(overrides: Partial<SplatCameraFrame> = {}): SplatCameraFrame {
  const viewMatrix = new Float32Array(16);
  const projectionMatrix = new Float32Array(16);
  viewMatrix[0] = 1;
  viewMatrix[5] = 1;
  viewMatrix[10] = 1;
  viewMatrix[15] = 1;
  projectionMatrix[0] = 2;
  projectionMatrix[5] = 3;
  projectionMatrix[10] = -1;
  projectionMatrix[15] = 1;

  return {
    viewport: {
      cssWidth: 400,
      cssHeight: 300,
      pixelWidth: 800,
      pixelHeight: 600,
      dpr: 2,
    },
    camera: {
      kind: 'perspective',
      viewMatrix,
      projectionMatrix,
      worldMatrix: viewMatrix,
      position: [1, 2, 3],
      near: 0.2,
      far: 200,
    },
    ...overrides,
  };
}

function createHarness(options: {
  scene?: GpuGaussianSceneRef;
  validationError?: GPUError | null;
  canvasContext?: GPUCanvasContext | null;
  debugValidation?: boolean;
} = {}) {
  const order: string[] = [];
  const projection = makeModule('projection', order);
  const sort = makeModule('sort', order);
  const raster = makeModule('raster', order);
  const output = makeModule('output', order);
  const renderTargets: Array<ReturnType<typeof makeRenderTargets>> = [];
  const destroyedRenderTargets: Array<ReturnType<typeof makeRenderTargets>> = [];
  const { device, submittedCommand } = makeDevice({ validationError: options.validationError });
  const scene = options.scene ?? makeScene({ device });
  const session = createSplatRenderSession({
    device,
    scene,
    format: 'rgba8unorm',
    canvasContext: options.canvasContext,
    debugValidation: options.debugValidation,
    deps: {
      createProjectionModule: vi.fn(() => projection as unknown as ReturnType<ProjectionModuleFactory>),
      createSortModule: vi.fn(() => sort as unknown as ReturnType<SortModuleFactory>),
      createRasterModule: vi.fn(() => raster as unknown as ReturnType<RasterModuleFactory>),
      createOutputModule: vi.fn(() => output as unknown as ReturnType<OutputModuleFactory>),
      createRenderTargets: vi.fn((_, width, height, format) => {
        const targets = makeRenderTargets(width, height, format);
        renderTargets.push(targets);
        return targets;
      }),
      destroyRenderTargets: vi.fn((targets) => {
        destroyedRenderTargets.push(targets as ReturnType<typeof makeRenderTargets>);
        targets.colorTexture.destroy();
      }),
    },
  });

  return {
    session,
    device,
    scene,
    submittedCommand,
    modules: {
      projection,
      sort,
      raster,
      output,
    },
    order,
    renderTargets,
    destroyedRenderTargets,
  };
}

describe('gaussian renderer session', () => {
  beforeEach(() => {
    resetWebGpuSplatDebugCountersForTests();
    resetWebGpuSplatTelemetryEventsForTests();
  });

  it('allocates mutable pipeline buffers with stable minimum sizes', () => {
    const { device } = makeDevice();

    const emptyBuffers = createSplatRendererPipelineBuffers(device, 0);
    expect(device.createBuffer).toHaveBeenCalledWith(expect.objectContaining({
      label: 'webgpu splat renderer: splat data',
      size: 16,
    }));
    expect(device.createBuffer).toHaveBeenCalledWith(expect.objectContaining({
      label: 'webgpu splat renderer: depths',
      size: 16,
    }));
    expect(device.createBuffer).toHaveBeenCalledWith(expect.objectContaining({
      label: 'webgpu splat renderer: indices',
      size: 16,
    }));
    emptyBuffers.splatData.destroy();
    emptyBuffers.depths.destroy();
    emptyBuffers.indices.destroy();
  });

  it('rejects renderer scratch buffers before allocation when device limits are too low', () => {
    const { device } = makeDevice({
      limits: {
        maxBufferSize: 268_435_456,
        maxStorageBufferBindingSize: 134_217_728,
      } as GPUSupportedLimits,
    });

    expect(() => createSplatRendererPipelineBuffers(device, 5_000_000))
      .toThrow('WebGPU device maxStorageBufferBindingSize 134217728 is below required 240000000 bytes');
    expect(device.createBuffer).not.toHaveBeenCalled();
  });

  it('configures gs-toolbox modules using shared scene buffers and mutable scratch buffers', () => {
    const scene = makeScene({ count: 5, shDegree: 1, shByteLength: 32 });
    const { modules } = createHarness({ scene });

    expect(modules.projection.configure).toHaveBeenCalledWith({
      count: 5,
      buffers: expect.objectContaining({
        gaussians: scene.gaussianBuffer,
        shCoeffs: scene.shBuffer,
      }),
    });
    expect(modules.sort.configure).toHaveBeenCalledWith({
      count: 5,
      buffers: expect.objectContaining({
        depth: expect.objectContaining({ label: 'webgpu splat renderer: depths' }),
        index: expect.objectContaining({ label: 'webgpu splat renderer: indices' }),
      }),
    });
    expect(modules.raster.configure).toHaveBeenCalledWith(expect.objectContaining({
      count: 5,
      format: 'rgba8unorm',
    }));
    expect(modules.output.configure).toHaveBeenCalledWith(expect.objectContaining({
      format: 'rgba8unorm',
    }));
  });

  it('maps app camera frames to gs-toolbox projection, raster, and output uniforms', () => {
    const frame = makeFrame();
    const scene = makeScene({ count: 7, shDegree: 2 });

    expect(createSplatProjectionUniforms(frame, scene)).toMatchObject({
      viewportWidth: 800,
      viewportHeight: 600,
      focalX: 800,
      focalY: 900,
      camPos: [1, 2, 3],
      shDegree: 2,
      nearPlane: Math.sqrt(8.75) - 1,
      farPlane: Math.sqrt(8.75) + 1,
      cameraModel: 'pinhole',
      numGaussians: 7,
      linearOutput: false,
      writeIndices: true,
    });
    expect(createSplatProjectionUniforms(frame, scene, { writeIndices: false })).toMatchObject({
      writeIndices: false,
    });
    expect(createSplatRasterUniforms(frame, scene)).toMatchObject({
      viewportWidth: 800,
      viewportHeight: 600,
      nearPlane: Math.sqrt(8.75) - 1,
      farPlane: Math.sqrt(8.75) + 1,
      numGaussians: 7,
      renderMode: 'rgb',
      antialiasing: true,
    });
    expect(createSplatOutputUniforms(frame, [0, 0, 0, 1])).toMatchObject({
      viewportWidth: 800,
      viewportHeight: 600,
      backgroundColor: [0, 0, 0, 1],
      depthAware: false,
    });
  });

  it('uses scene bounds for sort depth instead of the viewer clip range', () => {
    const frame = makeFrame({
      camera: {
        ...makeFrame().camera,
        position: [10, 0, 0],
        near: 0.001,
        far: 10000,
      },
    });
    const bounds = {
      min: [-1, -1, -1] as [number, number, number],
      max: [1, 1, 1] as [number, number, number],
      center: [0, 0, 0] as [number, number, number],
      size: 2,
    };

    expect(createSplatDepthRange(frame, bounds)).toEqual({
      nearPlane: 8,
      farPlane: 12,
    });
    expect(createSplatProjectionUniforms(frame, makeScene({ bounds }))).toMatchObject({
      nearPlane: 8,
      farPlane: 12,
    });
  });

  it('falls back to camera clip planes when scene bounds are invalid', () => {
    const frame = makeFrame();

    expect(createSplatDepthRange(frame, {
      min: [0, 0, 0],
      max: [0, 0, 0],
      center: [Number.NaN, 0, 0],
      size: 1,
    })).toEqual({
      nearPlane: 0.2,
      farPlane: 200,
    });
  });

  it('renders preprocess-sort-raster-composite and reports first frame after queue completion', async () => {
    const target = makeTexture('target');
    const { session, device, modules, order, submittedCommand } = createHarness();
    const firstFrame = vi.fn();

    session.onFirstFrame(firstFrame);
    expect(session.getReadyState()).toBe('initializing');
    session.setCamera(makeFrame());
    expect(session.getReadyState()).toBe('initializing');
    await session.renderToTexture(target);

    expect(modules.projection.setUniforms).toHaveBeenCalledTimes(1);
    expect(modules.projection.setUniforms).toHaveBeenCalledWith(expect.objectContaining({
      writeIndices: true,
    }));
    expect(modules.raster.setUniforms).toHaveBeenCalledTimes(1);
    expect(modules.output.setUniforms).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['projection', 'sort', 'raster', 'output']);
    expect(device.queue.submit).toHaveBeenCalledWith([submittedCommand]);
    expect(device.queue.onSubmittedWorkDone).toHaveBeenCalledTimes(1);
    expect(device.pushErrorScope).not.toHaveBeenCalled();
    expect(device.popErrorScope).not.toHaveBeenCalled();
    expect(firstFrame).toHaveBeenCalledTimes(1);
    expect(session.getReadyState()).toBe('ready');
    expect(getWebGpuSplatTelemetryEvents()).toEqual([
      expect.objectContaining({
        name: 'render',
        details: expect.objectContaining({
          target: 'texture',
          width: 800,
          height: 600,
          count: 3,
          sorted: true,
        }),
      }),
      expect.objectContaining({
        name: 'first-frame',
        details: expect.objectContaining({
          count: 3,
          width: 800,
          height: 600,
        }),
      }),
    ]);

    await session.renderToTexture(target);
    expect(firstFrame).toHaveBeenCalledTimes(1);
    expect(getWebGpuSplatTelemetryEvents().filter((event) => event.name === 'render')).toHaveLength(2);
    expect(getWebGpuSplatTelemetryEvents().filter((event) => event.name === 'first-frame')).toHaveLength(1);
  });

  it('reuses sorted indices for translation-only camera updates', async () => {
    const target = makeTexture('target');
    const { session, modules, order } = createHarness();
    const firstFrame = makeFrame();
    const translatedFrame = makeFrame({
      camera: {
        ...firstFrame.camera,
        position: [4, 5, 6],
      },
    });

    session.setCamera(firstFrame);
    await session.renderToTexture(target, { completion: 'submitted' });
    order.length = 0;

    session.setCamera(translatedFrame);
    await session.renderToTexture(target, { completion: 'submitted' });

    expect(order).toEqual(['projection', 'raster', 'output']);
    expect(modules.sort.execute).toHaveBeenCalledTimes(1);
    expect(modules.projection.setUniforms).toHaveBeenLastCalledWith(expect.objectContaining({
      camPos: [4, 5, 6],
      writeIndices: false,
    }));
    expect(getWebGpuSplatTelemetryEvents().filter((event) => event.name === 'render').at(-1))
      .toEqual(expect.objectContaining({
        details: expect.objectContaining({
          sorted: false,
        }),
      }));
  });

  it('sorts again when the camera depth axis changes', async () => {
    const target = makeTexture('target');
    const { session, modules, order } = createHarness();
    const rotatedViewMatrix = new Float32Array(makeFrame().camera.viewMatrix);
    rotatedViewMatrix[2] = 0.2;
    rotatedViewMatrix[10] = 0.98;

    session.setCamera(makeFrame());
    await session.renderToTexture(target, { completion: 'submitted' });
    order.length = 0;

    session.setCamera(makeFrame({
      camera: {
        ...makeFrame().camera,
        viewMatrix: rotatedViewMatrix,
      },
    }));
    await session.renderToTexture(target, { completion: 'submitted' });

    expect(order).toEqual(['projection', 'sort', 'raster', 'output']);
    expect(modules.sort.execute).toHaveBeenCalledTimes(2);
    expect(modules.projection.setUniforms).toHaveBeenLastCalledWith(expect.objectContaining({
      writeIndices: true,
    }));
  });

  it('can resolve offscreen renders after queue submission without idling the CPU', async () => {
    const target = makeTexture('target');
    const { session, device, modules, order, submittedCommand } = createHarness();
    const firstFrame = vi.fn();

    session.onFirstFrame(firstFrame);
    session.setCamera(makeFrame());
    await session.renderToTexture(target, { completion: 'submitted' });

    expect(modules.projection.setUniforms).toHaveBeenCalledTimes(1);
    expect(modules.raster.setUniforms).toHaveBeenCalledTimes(1);
    expect(modules.output.setUniforms).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['projection', 'sort', 'raster', 'output']);
    expect(device.queue.submit).toHaveBeenCalledWith([submittedCommand]);
    expect(device.queue.onSubmittedWorkDone).not.toHaveBeenCalled();
    expect(firstFrame).toHaveBeenCalledTimes(1);
    expect(session.getReadyState()).toBe('ready');
    expect(getWebGpuSplatTelemetryEvents()).toEqual([
      expect.objectContaining({
        name: 'render',
        details: expect.objectContaining({
          target: 'texture',
          completion: 'submitted',
          width: 800,
          height: 600,
          count: 3,
        }),
      }),
      expect.objectContaining({
        name: 'first-frame',
      }),
    ]);
  });

  it('copies background colors before using them for output uniforms', async () => {
    const target = makeTexture('target');
    const { session, modules } = createHarness();
    const background: [number, number, number, number] = [1, 1, 1, 1];

    session.setCamera(makeFrame());
    session.setBackgroundColor(background);
    background[0] = 0.25;
    await session.renderToTexture(target, { completion: 'submitted' });

    expect(modules.output.setUniforms).toHaveBeenCalledWith(expect.objectContaining({
      backgroundColor: [1, 1, 1, 1],
    }));
  });

  it('does not fail the render session when a first-frame callback throws', async () => {
    const target = makeTexture('target');
    const { session } = createHarness();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      session.onFirstFrame(() => {
        throw new Error('bad callback');
      });
      session.setCamera(makeFrame());
      await session.renderToTexture(target);

      expect(session.getReadyState()).toBe('ready');
      expect(consoleError).toHaveBeenCalledWith(
        'Splat render session first-frame callback failed',
        expect.any(Error)
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('renders to the current canvas texture when a canvas context is provided', async () => {
    const canvasTexture = makeTexture('canvas-current');
    const canvasContext = {
      getCurrentTexture: vi.fn(() => canvasTexture),
    } as unknown as GPUCanvasContext;
    const { session } = createHarness({ canvasContext });

    session.setCamera(makeFrame());
    await session.renderToCanvas();

    expect(canvasContext.getCurrentTexture).toHaveBeenCalledTimes(1);
    expect(canvasTexture.createView).toHaveBeenCalledTimes(1);
    expect(getWebGpuSplatTelemetryEvents()).toContainEqual(expect.objectContaining({
      name: 'render',
      details: expect.objectContaining({
        target: 'canvas',
      }),
    }));
  });

  it('can render the visible canvas without waiting for submitted work', async () => {
    const canvasTexture = makeTexture('canvas-current');
    const canvasContext = {
      getCurrentTexture: vi.fn(() => canvasTexture),
    } as unknown as GPUCanvasContext;
    const { session, device } = createHarness({ canvasContext });

    session.setCamera(makeFrame());
    await session.renderToCanvas({ completion: 'submitted' });

    expect(device.queue.submit).toHaveBeenCalledTimes(1);
    expect(device.queue.onSubmittedWorkDone).not.toHaveBeenCalled();
    expect(getWebGpuSplatTelemetryEvents()).toContainEqual(expect.objectContaining({
      name: 'render',
      details: expect.objectContaining({
        target: 'canvas',
        completion: 'submitted',
      }),
    }));
  });

  it('recreates render targets on resize and disposes all owned resources', () => {
    const { session, modules, renderTargets, destroyedRenderTargets, scene } = createHarness();
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      buffers: 3,
      textures: 1,
      renderSessions: 1,
    });

    session.setCamera(makeFrame());
    expect(renderTargets.map((target) => `${target.width}x${target.height}`))
      .toEqual(['1x1', '800x600']);
    expect(destroyedRenderTargets.map((target) => `${target.width}x${target.height}`))
      .toEqual(['1x1']);
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      buffers: 3,
      textures: 1,
      renderSessions: 1,
    });

    session.dispose();
    session.dispose();

    expect(modules.projection.destroy).toHaveBeenCalledTimes(1);
    expect(modules.sort.destroy).toHaveBeenCalledTimes(1);
    expect(modules.raster.destroy).toHaveBeenCalledTimes(1);
    expect(modules.output.destroy).toHaveBeenCalledTimes(1);
    expect(scene.release).toHaveBeenCalledTimes(1);
    expect(destroyedRenderTargets.map((target) => `${target.width}x${target.height}`))
      .toEqual(['1x1', '800x600']);
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      buffers: 0,
      textures: 0,
      renderSessions: 0,
    });
  });

  it('fails clearly for invalid cameras and validation errors', async () => {
    const { session } = createHarness();
    expect(() => session.setCamera(makeFrame({
      camera: {
        ...makeFrame().camera,
        kind: 'unknown',
      },
    }))).toThrow('Splat render session requires a perspective or orthographic camera');

    const failedSession = createHarness({
      validationError: { message: 'bad bind group' } as GPUError,
      debugValidation: true,
    }).session;
    failedSession.setCamera(makeFrame());

    await expect(failedSession.renderToTexture(makeTexture('target')))
      .rejects.toThrow('Splat render session WebGPU validation failed: bad bind group');
    expect(failedSession.getReadyState()).toBe('failed');
  });

  it('uses per-render WebGPU validation scopes only when debug validation is enabled', async () => {
    const target = makeTexture('target');
    const { session, device } = createHarness({ debugValidation: true });

    session.setCamera(makeFrame());
    await session.renderToTexture(target);

    expect(device.pushErrorScope).toHaveBeenCalledWith('validation');
    expect(device.popErrorScope).toHaveBeenCalledTimes(1);
  });

  it('still waits for submitted work when debug validation is requested with submitted completion', async () => {
    const target = makeTexture('target');
    const { session, device } = createHarness({ debugValidation: true });

    session.setCamera(makeFrame());
    await session.renderToTexture(target, { completion: 'submitted' });

    expect(device.queue.onSubmittedWorkDone).toHaveBeenCalledTimes(1);
    expect(device.popErrorScope).toHaveBeenCalledTimes(1);
  });
});
