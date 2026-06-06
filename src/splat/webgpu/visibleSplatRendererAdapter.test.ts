import { describe, expect, it, vi } from 'vitest';
import type { GaussianCloud } from '../gaussianCloud';
import {
  createLoadedVisibleWebGpuSplatRendererAdapter,
  createVisibleWebGpuSplatRendererAdapter,
  type VisibleWebGpuSplatRendererAdapterDeps,
} from './visibleSplatRendererAdapter';
import type { GpuGaussianSceneRef } from './gaussianSceneResourceManager';
import type { SplatCameraFrame, SplatRenderSession } from './gaussianRenderer';
import type { WebGpuSplatDeviceHandle } from './webGpuSplatDevice';

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

function makeLargeShCloud(): GaussianCloud {
  return {
    ...makeCloud(),
    count: 5_000_000,
    shDegree: 3,
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
      cssWidth: 100,
      cssHeight: 50,
      pixelWidth: 200,
      pixelHeight: 100,
      dpr: 2,
    },
    camera: {
      kind: 'perspective',
      viewMatrix,
      projectionMatrix,
      worldMatrix,
      position: [1, 2, 3],
      near: 0.1,
      far: 100,
    },
  };
}

function makeFrameAt(position: [number, number, number]): SplatCameraFrame {
  const frame = makeFrame();
  return {
    ...frame,
    camera: {
      ...frame.camera,
      position,
    },
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

function makeDeviceHandle(options: {
  onSubmittedWorkDone?: () => Promise<void>;
} = {}): WebGpuSplatDeviceHandle {
  return {
    adapter: {
      limits: {
        maxBufferSize: 2_147_483_648,
        maxStorageBufferBindingSize: 2_147_483_644,
      } as GPUSupportedLimits,
      requestDevice: vi.fn(),
    } as unknown as WebGpuSplatDeviceHandle['adapter'],
    device: {
      label: 'device',
      queue: {
        onSubmittedWorkDone: vi.fn(options.onSubmittedWorkDone ?? (async () => undefined)),
      },
    } as unknown as GPUDevice,
    context: { label: 'context' } as unknown as GPUCanvasContext,
    format: 'rgba8unorm',
    dispose: vi.fn(),
  };
}

function makeSession(options: {
  renderToCanvas?: () => Promise<void>;
} = {}) {
  let firstFrameCallback: (() => void) | null = null;
  const session = {
    setCamera: vi.fn(),
    setBackgroundColor: vi.fn(),
    resize: vi.fn(),
    renderToCanvas: vi.fn(options.renderToCanvas ?? (async () => {
      firstFrameCallback?.();
    })),
    renderToTexture: vi.fn(),
    getReadyState: vi.fn(() => 'initializing'),
    onFirstFrame: vi.fn((callback: () => void) => {
      firstFrameCallback = callback;
      return vi.fn(() => {
        if (firstFrameCallback === callback) {
          firstFrameCallback = null;
        }
      });
    }),
    dispose: vi.fn(),
  } satisfies SplatRenderSession;

  return {
    session,
    fireFirstFrame() {
      firstFrameCallback?.();
    },
  };
}

function createHarness(options: {
  session?: SplatRenderSession;
  deviceHandle?: WebGpuSplatDeviceHandle;
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 8;
  const deviceHandle = options.deviceHandle ?? makeDeviceHandle();
  let onDeviceLost: ((info: GPUDeviceLostInfo) => void) | undefined;
  const initializeDevice = vi.fn(async (_canvas, deviceOptions) => {
    onDeviceLost = deviceOptions?.onDeviceLost;
    return deviceHandle;
  }) satisfies NonNullable<VisibleWebGpuSplatRendererAdapterDeps['initializeDevice']>;
  const sceneRef = makeSceneRef();
  const resourceManager = {
    acquire: vi.fn(() => sceneRef),
    dispose: vi.fn(),
  };
  const sessionHarness = options.session ? null : makeSession();
  const session = options.session ?? sessionHarness?.session;
  const createRenderSession = vi.fn(() => session as SplatRenderSession);
  const onFirstFrame = vi.fn();
  const onError = vi.fn();

  return {
    canvas,
    deviceHandle,
    initializeDevice,
    onDeviceLost: () => onDeviceLost,
    sceneRef,
    resourceManager,
    session,
    sessionHarness,
    createRenderSession,
    onFirstFrame,
    onError,
  };
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

describe('visible WebGPU splat renderer adapter', () => {
  it('creates a loaded renderer with cloud-specific elevated limits before upload', async () => {
    const harness = createHarness();
    const largeCloud = makeLargeShCloud();

    const adapter = await createLoadedVisibleWebGpuSplatRendererAdapter(
      harness.canvas,
      largeCloud,
      { sceneId: 'large-scene', labelPrefix: 'large splat' },
      {
        initializeDevice: harness.initializeDevice,
        createSceneResourceManager: () => harness.resourceManager as unknown as ReturnType<NonNullable<VisibleWebGpuSplatRendererAdapterDeps['createSceneResourceManager']>>,
        createRenderSession: harness.createRenderSession,
        onFirstFrame: harness.onFirstFrame,
        onError: harness.onError,
      }
    );

    expect(harness.initializeDevice).toHaveBeenCalledWith(harness.canvas, expect.objectContaining({
      requiredLimits: {
        maxBufferSize: 900_000_000,
        maxStorageBufferBindingSize: 900_000_000,
      },
    }));
    expect(harness.resourceManager.acquire).toHaveBeenCalledWith(harness.deviceHandle.device, {
      sceneId: 'large-scene',
      cloud: largeCloud,
      labelPrefix: 'large splat',
    });

    adapter.dispose();
  });

  it('disposes the initialized device if loaded renderer upload fails', async () => {
    const harness = createHarness();
    harness.resourceManager.acquire.mockImplementation(() => {
      throw new Error('large upload failed');
    });

    await expect(createLoadedVisibleWebGpuSplatRendererAdapter(
      harness.canvas,
      makeCloud(),
      { sceneId: 'bad-scene' },
      {
        initializeDevice: harness.initializeDevice,
        createSceneResourceManager: () => harness.resourceManager as unknown as ReturnType<NonNullable<VisibleWebGpuSplatRendererAdapterDeps['createSceneResourceManager']>>,
        createRenderSession: harness.createRenderSession,
      }
    )).rejects.toThrow('large upload failed');

    expect(harness.deviceHandle.dispose).toHaveBeenCalledTimes(1);
  });

  it('creates a render session from uploaded scene resources and reports first frame after render', async () => {
    const harness = createHarness();
    const adapter = await createVisibleWebGpuSplatRendererAdapter(harness.canvas, {
      initializeDevice: harness.initializeDevice,
      createSceneResourceManager: () => harness.resourceManager as unknown as ReturnType<NonNullable<VisibleWebGpuSplatRendererAdapterDeps['createSceneResourceManager']>>,
      createRenderSession: harness.createRenderSession,
      requiredLimits: {
        maxBufferSize: 128,
        maxStorageBufferBindingSize: 128,
      },
      onFirstFrame: harness.onFirstFrame,
      onError: harness.onError,
    });

    adapter.setFrameSnapshot(makeFrame());
    await adapter.loadCloud(makeCloud(), { sceneId: 'scene', labelPrefix: 'test scene' });
    await flushPromises();

    expect(harness.initializeDevice).toHaveBeenCalledWith(harness.canvas, expect.objectContaining({
      alphaMode: 'premultiplied',
      requiredLimits: {
        maxBufferSize: 128,
        maxStorageBufferBindingSize: 128,
      },
    }));
    expect(harness.resourceManager.acquire).toHaveBeenCalledWith(harness.deviceHandle.device, {
      sceneId: 'scene',
      cloud: expect.objectContaining({ count: 1 }),
      labelPrefix: 'test scene',
    });
    expect(harness.createRenderSession).toHaveBeenCalledWith(expect.objectContaining({
      device: harness.deviceHandle.device,
      scene: harness.sceneRef,
      format: 'rgba8unorm',
      canvasContext: harness.deviceHandle.context,
      width: 200,
      height: 100,
      backgroundColor: [0, 0, 0, 1],
      outputAlgorithm: 'xr-passthrough',
      sortAlgorithm: 'radix-16bit',
    }));
    expect(harness.session.setCamera).toHaveBeenCalledTimes(1);
    expect(harness.session.renderToCanvas).toHaveBeenCalledWith({ completion: 'submitted' });
    expect(harness.onFirstFrame).toHaveBeenCalledTimes(1);
    expect(harness.onError).not.toHaveBeenCalled();
  });

  it('coalesces render requests while a frame is in flight', async () => {
    let resolveRender: (() => void) | null = null;
    const sessionHarness = makeSession({
      renderToCanvas: () => new Promise<void>((resolve) => {
        resolveRender = resolve;
      }),
    });
    const harness = createHarness({ session: sessionHarness.session });
    const adapter = await createVisibleWebGpuSplatRendererAdapter(harness.canvas, {
      initializeDevice: harness.initializeDevice,
      createSceneResourceManager: () => harness.resourceManager as unknown as ReturnType<NonNullable<VisibleWebGpuSplatRendererAdapterDeps['createSceneResourceManager']>>,
      createRenderSession: harness.createRenderSession,
      onError: harness.onError,
    });

    await adapter.loadCloud(makeCloud(), { sceneId: 'scene' });
    adapter.setFrameSnapshot(makeFrameAt([1, 2, 3]));
    adapter.setFrameSnapshot(makeFrameAt([4, 5, 6]));
    expect(harness.session.renderToCanvas).toHaveBeenCalledTimes(1);
    expect(harness.session.setCamera).toHaveBeenCalledTimes(1);

    resolveRender?.();
    await flushPromises();

    expect(harness.session.renderToCanvas).toHaveBeenCalledTimes(2);
    expect(harness.session.setCamera).toHaveBeenCalledTimes(2);
    expect(harness.onError).not.toHaveBeenCalled();
  });

  it('skips duplicate frame snapshots from the scene render loop', async () => {
    const harness = createHarness();
    const adapter = await createVisibleWebGpuSplatRendererAdapter(harness.canvas, {
      initializeDevice: harness.initializeDevice,
      createSceneResourceManager: () => harness.resourceManager as unknown as ReturnType<NonNullable<VisibleWebGpuSplatRendererAdapterDeps['createSceneResourceManager']>>,
      createRenderSession: harness.createRenderSession,
      onError: harness.onError,
    });

    await adapter.loadCloud(makeCloud(), { sceneId: 'scene' });
    adapter.setFrameSnapshot(makeFrame());
    await flushPromises();
    adapter.setFrameSnapshot(makeFrame());
    await flushPromises();

    expect(harness.session.renderToCanvas).toHaveBeenCalledTimes(1);
    expect(harness.session.setCamera).toHaveBeenCalledTimes(1);
    expect(harness.onError).not.toHaveBeenCalled();
  });

  it('does not mutate session camera state while a visible frame is in flight', async () => {
    let resolveRender: (() => void) | null = null;
    const sessionHarness = makeSession({
      renderToCanvas: () => new Promise<void>((resolve) => {
        resolveRender = resolve;
      }),
    });
    const harness = createHarness({ session: sessionHarness.session });
    const adapter = await createVisibleWebGpuSplatRendererAdapter(harness.canvas, {
      initializeDevice: harness.initializeDevice,
      createSceneResourceManager: () => harness.resourceManager as unknown as ReturnType<NonNullable<VisibleWebGpuSplatRendererAdapterDeps['createSceneResourceManager']>>,
      createRenderSession: harness.createRenderSession,
      onError: harness.onError,
    });
    const firstFrame = makeFrame();
    const latestFrame = {
      ...makeFrame(),
      camera: {
        ...makeFrame().camera,
        position: [9, 8, 7] as [number, number, number],
      },
    };

    await adapter.loadCloud(makeCloud(), { sceneId: 'scene' });
    adapter.setFrameSnapshot(firstFrame);
    expect(harness.session.setCamera).toHaveBeenCalledWith(firstFrame);

    adapter.setFrameSnapshot(latestFrame);
    expect(harness.session.setCamera).toHaveBeenCalledTimes(1);

    resolveRender?.();
    await flushPromises();

    expect(harness.session.setCamera).toHaveBeenCalledTimes(2);
    expect(harness.session.setCamera).toHaveBeenLastCalledWith(latestFrame);
    expect(harness.session.renderToCanvas).toHaveBeenCalledTimes(2);
  });

  it('keeps a shallow submitted queue and coalesces overflow to the latest camera', async () => {
    const gpuWorkResolves: Array<() => void> = [];
    const deviceHandle = makeDeviceHandle({
      onSubmittedWorkDone: () => new Promise<void>((resolve) => {
        gpuWorkResolves.push(resolve);
      }),
    });
    const harness = createHarness({ deviceHandle });
    const adapter = await createVisibleWebGpuSplatRendererAdapter(harness.canvas, {
      initializeDevice: harness.initializeDevice,
      createSceneResourceManager: () => harness.resourceManager as unknown as ReturnType<NonNullable<VisibleWebGpuSplatRendererAdapterDeps['createSceneResourceManager']>>,
      createRenderSession: harness.createRenderSession,
      onError: harness.onError,
    });
    const firstFrame = makeFrameAt([1, 0, 0]);
    const secondFrame = makeFrameAt([2, 0, 0]);
    const latestFrame = makeFrameAt([3, 0, 0]);

    await adapter.loadCloud(makeCloud(), { sceneId: 'scene' });
    adapter.setFrameSnapshot(firstFrame);
    await flushPromises();
    adapter.setFrameSnapshot(secondFrame);
    await flushPromises();
    adapter.setFrameSnapshot(latestFrame);
    await flushPromises();

    expect(harness.session.renderToCanvas).toHaveBeenCalledTimes(2);
    expect(harness.session.setCamera).toHaveBeenNthCalledWith(1, firstFrame);
    expect(harness.session.setCamera).toHaveBeenNthCalledWith(2, secondFrame);
    expect(gpuWorkResolves).toHaveLength(2);

    gpuWorkResolves[0]?.();
    await flushPromises();

    expect(harness.session.renderToCanvas).toHaveBeenCalledTimes(3);
    expect(harness.session.setCamera).toHaveBeenLastCalledWith(latestFrame);
    expect(harness.onError).not.toHaveBeenCalled();
  });

  it('reports render errors and releases owned resources', async () => {
    const sessionHarness = makeSession({
      renderToCanvas: async () => {
        throw new Error('validation failed');
      },
    });
    const harness = createHarness({ session: sessionHarness.session });
    const adapter = await createVisibleWebGpuSplatRendererAdapter(harness.canvas, {
      initializeDevice: harness.initializeDevice,
      createSceneResourceManager: () => harness.resourceManager as unknown as ReturnType<NonNullable<VisibleWebGpuSplatRendererAdapterDeps['createSceneResourceManager']>>,
      createRenderSession: harness.createRenderSession,
      onError: harness.onError,
    });

    await adapter.loadCloud(makeCloud(), { sceneId: 'scene' });
    adapter.setFrameSnapshot(makeFrame());
    await flushPromises();

    expect(harness.onError).toHaveBeenCalledWith('validation failed');
    expect(harness.session.dispose).toHaveBeenCalledTimes(1);
    expect(harness.resourceManager.dispose).toHaveBeenCalledTimes(1);
    expect(harness.deviceHandle.dispose).toHaveBeenCalledTimes(1);

    adapter.setFrameSnapshot(makeFrame());
    expect(harness.session.renderToCanvas).toHaveBeenCalledTimes(1);
  });

  it('releases a scene ref when render session creation fails', async () => {
    const harness = createHarness();
    harness.createRenderSession.mockImplementation(() => {
      throw new Error('bad pipeline');
    });
    const adapter = await createVisibleWebGpuSplatRendererAdapter(harness.canvas, {
      initializeDevice: harness.initializeDevice,
      createSceneResourceManager: () => harness.resourceManager as unknown as ReturnType<NonNullable<VisibleWebGpuSplatRendererAdapterDeps['createSceneResourceManager']>>,
      createRenderSession: harness.createRenderSession,
    });

    await expect(adapter.loadCloud(makeCloud(), { sceneId: 'scene' }))
      .rejects.toThrow('bad pipeline');
    expect(harness.sceneRef.release).toHaveBeenCalledTimes(1);
  });

  it('reports device loss and disposes idempotently', async () => {
    const harness = createHarness();
    const adapter = await createVisibleWebGpuSplatRendererAdapter(harness.canvas, {
      initializeDevice: harness.initializeDevice,
      createSceneResourceManager: () => harness.resourceManager as unknown as ReturnType<NonNullable<VisibleWebGpuSplatRendererAdapterDeps['createSceneResourceManager']>>,
      createRenderSession: harness.createRenderSession,
      onError: harness.onError,
    });

    await adapter.loadCloud(makeCloud(), { sceneId: 'scene' });
    harness.onDeviceLost()?.({ message: 'lost', reason: 'destroyed' } as GPUDeviceLostInfo);
    adapter.dispose();
    adapter.dispose();

    expect(harness.onError).toHaveBeenCalledWith('WebGPU device lost: lost');
    expect(harness.session.dispose).toHaveBeenCalledTimes(1);
    expect(harness.resourceManager.dispose).toHaveBeenCalledTimes(1);
    expect(harness.deviceHandle.dispose).toHaveBeenCalledTimes(1);
  });

  it('reports device loss clearly when the browser provides no detail', async () => {
    const harness = createHarness();
    const adapter = await createVisibleWebGpuSplatRendererAdapter(harness.canvas, {
      initializeDevice: harness.initializeDevice,
      createSceneResourceManager: () => harness.resourceManager as unknown as ReturnType<NonNullable<VisibleWebGpuSplatRendererAdapterDeps['createSceneResourceManager']>>,
      createRenderSession: harness.createRenderSession,
      onError: harness.onError,
    });

    await adapter.loadCloud(makeCloud(), { sceneId: 'scene' });
    harness.onDeviceLost()?.({ message: '', reason: '' } as GPUDeviceLostInfo);

    expect(harness.onError).toHaveBeenCalledWith('WebGPU device lost');
    expect(harness.session.dispose).toHaveBeenCalledTimes(1);
    expect(harness.resourceManager.dispose).toHaveBeenCalledTimes(1);
    expect(harness.deviceHandle.dispose).toHaveBeenCalledTimes(1);
  });
});
