import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WEBGPU_SPLAT_DEVICE_REQUEST_TIMEOUT_REASON,
  initializeWebGpuSplatDevice,
  requestPreferredWebGpuSplatAdapter,
  type WebGpuSplatGpuProvider,
} from './webGpuSplatDevice';
import {
  getWebGpuSplatDebugCounters,
  resetWebGpuSplatDebugCountersForTests,
} from './webGpuSplatDebugCounters';

interface FakeCanvasContext {
  configure: ReturnType<typeof vi.fn>;
  unconfigure: ReturnType<typeof vi.fn>;
}

function createDeferredLost(): {
  lost: Promise<GPUDeviceLostInfo>;
  resolve: (info: GPUDeviceLostInfo) => void;
} {
  let resolveLost!: (info: GPUDeviceLostInfo) => void;
  return {
    lost: new Promise<GPUDeviceLostInfo>((resolve) => {
      resolveLost = resolve;
    }),
    resolve: resolveLost,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createDeviceHarness(options: {
  context?: FakeCanvasContext | null;
  adapter?: Pick<GPUAdapter, 'limits' | 'requestDevice'> | null;
  deviceLimits?: GPUSupportedLimits;
  format?: GPUTextureFormat;
} = {}): {
  canvas: HTMLCanvasElement;
  context: FakeCanvasContext | null;
  device: GPUDevice & { destroy: ReturnType<typeof vi.fn> };
  lost: ReturnType<typeof createDeferredLost>;
  adapter: Pick<GPUAdapter, 'limits' | 'requestDevice'> | null;
  gpu: WebGpuSplatGpuProvider;
} {
  const context = options.context === undefined
    ? { configure: vi.fn(), unconfigure: vi.fn() }
    : options.context;
  const lost = createDeferredLost();
  const defaultLimits = {
    maxBufferSize: 2_147_483_648,
    maxStorageBufferBindingSize: 2_147_483_644,
  } as GPUSupportedLimits;
  const device = {
    lost: lost.lost,
    limits: options.deviceLimits ?? defaultLimits,
    destroy: vi.fn(),
  } as unknown as GPUDevice & { destroy: ReturnType<typeof vi.fn> };
  const adapter = options.adapter === undefined
    ? {
        limits: defaultLimits,
        requestDevice: vi.fn().mockResolvedValue(device),
      }
    : options.adapter;
  const gpu: WebGpuSplatGpuProvider = {
    requestAdapter: vi.fn().mockResolvedValue(adapter),
    getPreferredCanvasFormat: vi.fn(() => options.format ?? 'rgba8unorm'),
  };
  const canvas = {
    getContext: vi.fn((name: string) => name === 'webgpu' ? context : null),
  } as unknown as HTMLCanvasElement;

  return { canvas, context, device, lost, adapter, gpu };
}

describe('WebGPU splat device initialization', () => {
  beforeEach(() => {
    resetWebGpuSplatDebugCountersForTests();
  });

  it('requests an adapter/device and configures the canvas context', async () => {
    const { adapter, canvas, context, device, gpu } = createDeviceHarness();

    const handle = await initializeWebGpuSplatDevice(canvas, { gpu });

    expect(gpu.requestAdapter).toHaveBeenCalledTimes(1);
    expect(gpu.requestAdapter).toHaveBeenCalledWith({ powerPreference: 'high-performance' });
    expect(adapter?.requestDevice).toHaveBeenCalledWith(undefined);
    expect(handle.device).toBe(device);
    expect(handle.format).toBe('rgba8unorm');
    expect(context?.configure).toHaveBeenCalledWith({
      device,
      format: 'rgba8unorm',
      alphaMode: 'premultiplied',
    });
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      devices: 1,
      canvases: 1,
    });

    handle.dispose();
    handle.dispose();
    expect(context?.unconfigure).toHaveBeenCalledTimes(1);
    expect(device.destroy).toHaveBeenCalledTimes(1);
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      devices: 0,
      canvases: 0,
    });
  });

  it('uses a provided adapter without requesting another one', async () => {
    const { adapter, canvas, context, device, gpu } = createDeviceHarness();

    const handle = await initializeWebGpuSplatDevice(canvas, {
      gpu,
      adapter: adapter ?? undefined,
    });

    expect(gpu.requestAdapter).not.toHaveBeenCalled();
    expect(adapter?.requestDevice).toHaveBeenCalledWith(undefined);
    expect(handle.adapter).toBe(adapter);
    expect(handle.device).toBe(device);
    expect(context?.configure).toHaveBeenCalledWith(expect.objectContaining({
      device,
    }));

    handle.dispose();
  });

  it('falls back to the default adapter request when a high-performance adapter is unavailable', async () => {
    const { adapter: fallbackAdapter, canvas, context } = createDeviceHarness();
    const gpu: WebGpuSplatGpuProvider = {
      requestAdapter: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(fallbackAdapter),
      getPreferredCanvasFormat: vi.fn(() => 'rgba8unorm'),
    };

    const handle = await initializeWebGpuSplatDevice(canvas, { gpu });

    expect(gpu.requestAdapter).toHaveBeenNthCalledWith(1, { powerPreference: 'high-performance' });
    expect(gpu.requestAdapter).toHaveBeenNthCalledWith(2);
    expect(fallbackAdapter?.requestDevice).toHaveBeenCalledWith(undefined);
    expect(context?.configure).toHaveBeenCalledWith(expect.objectContaining({
      device: handle.device,
    }));

    handle.dispose();
  });

  it('continues adapter fallback when high-performance adapter requests reject', async () => {
    const { adapter: fallbackAdapter, canvas, context } = createDeviceHarness();
    const gpu: WebGpuSplatGpuProvider = {
      requestAdapter: vi.fn()
        .mockRejectedValueOnce(new Error('No available adapters'))
        .mockResolvedValueOnce(fallbackAdapter),
      getPreferredCanvasFormat: vi.fn(() => 'rgba8unorm'),
    };

    const handle = await initializeWebGpuSplatDevice(canvas, { gpu });

    expect(gpu.requestAdapter).toHaveBeenNthCalledWith(1, { powerPreference: 'high-performance' });
    expect(gpu.requestAdapter).toHaveBeenNthCalledWith(2);
    expect(fallbackAdapter?.requestDevice).toHaveBeenCalledWith(undefined);
    expect(context?.configure).toHaveBeenCalledWith(expect.objectContaining({
      device: handle.device,
    }));

    handle.dispose();
  });

  it('continues adapter fallback when high-performance adapter requests time out', async () => {
    vi.useFakeTimers();
    try {
      const { adapter: fallbackAdapter } = createDeviceHarness();
      const pendingAdapterRequest = new Promise<Pick<GPUAdapter, 'limits' | 'requestDevice'> | null>(() => {
        // Simulate a browser adapter probe that never settles.
      });
      const gpu: WebGpuSplatGpuProvider = {
        requestAdapter: vi.fn()
          .mockReturnValueOnce(pendingAdapterRequest)
          .mockResolvedValueOnce(fallbackAdapter),
        getPreferredCanvasFormat: vi.fn(() => 'rgba8unorm'),
      };

      const adapterPromise = requestPreferredWebGpuSplatAdapter(gpu, undefined, 10);
      await vi.advanceTimersByTimeAsync(10);

      await expect(adapterPromise).resolves.toBe(fallbackAdapter);
      expect(gpu.requestAdapter).toHaveBeenNthCalledWith(1, { powerPreference: 'high-performance' });
      expect(gpu.requestAdapter).toHaveBeenNthCalledWith(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('redistributes unused adapter timeout budget to later fallback attempts', async () => {
    vi.useFakeTimers();
    try {
      const { adapter: lowPowerAdapter } = createDeviceHarness();
      const gpu: WebGpuSplatGpuProvider = {
        requestAdapter: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockImplementationOnce(() => new Promise((resolve) => {
            setTimeout(() => resolve(lowPowerAdapter), 20);
          })),
        getPreferredCanvasFormat: vi.fn(() => 'rgba8unorm'),
      };

      const adapterPromise = requestPreferredWebGpuSplatAdapter(gpu, undefined, 30);
      await vi.advanceTimersByTimeAsync(20);

      await expect(adapterPromise).resolves.toBe(lowPowerAdapter);
      expect(gpu.requestAdapter).toHaveBeenNthCalledWith(1, { powerPreference: 'high-performance' });
      expect(gpu.requestAdapter).toHaveBeenNthCalledWith(2);
      expect(gpu.requestAdapter).toHaveBeenNthCalledWith(3, { powerPreference: 'low-power' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses a single default adapter request on Windows because powerPreference is ignored', async () => {
    const { adapter } = createDeviceHarness();
    const gpu: WebGpuSplatGpuProvider = {
      requestAdapter: vi.fn().mockResolvedValue(adapter),
      getPlatform: vi.fn(() => 'Windows'),
    };

    const requestedAdapter = await requestPreferredWebGpuSplatAdapter(gpu);

    expect(requestedAdapter).toBe(adapter);
    expect(gpu.requestAdapter).toHaveBeenCalledTimes(1);
    expect(gpu.requestAdapter).toHaveBeenCalledWith();
  });

  it('does not treat Darwin as Windows when choosing adapter fallback requests', async () => {
    const { adapter } = createDeviceHarness();
    const gpu: WebGpuSplatGpuProvider = {
      requestAdapter: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(adapter),
      getPlatform: vi.fn(() => 'Darwin'),
    };

    const requestedAdapter = await requestPreferredWebGpuSplatAdapter(gpu);

    expect(requestedAdapter).toBe(adapter);
    expect(gpu.requestAdapter).toHaveBeenNthCalledWith(1, { powerPreference: 'high-performance' });
    expect(gpu.requestAdapter).toHaveBeenNthCalledWith(2);
  });

  it('fails when WebGPU support or canvas context is unavailable', async () => {
    await expect(initializeWebGpuSplatDevice({} as HTMLCanvasElement, { gpu: null }))
      .rejects.toThrow('WebGPU is not supported by this browser');

    const { canvas, gpu } = createDeviceHarness({ context: null });
    await expect(initializeWebGpuSplatDevice(canvas, { gpu }))
      .rejects.toThrow('WebGPU canvas context is unavailable');
  });

  it('fails when no adapter is available', async () => {
    const { canvas, gpu } = createDeviceHarness({ adapter: null });

    await expect(initializeWebGpuSplatDevice(canvas, { gpu }))
      .rejects.toThrow('WebGPU adapter is unavailable');
  });

  it('suppresses device-lost callbacks after disposal', async () => {
    const { canvas, gpu, lost } = createDeviceHarness();
    const onDeviceLost = vi.fn();

    const handle = await initializeWebGpuSplatDevice(canvas, {
      gpu,
      onDeviceLost,
    });
    handle.dispose();
    lost.resolve({ reason: 'destroyed', message: 'test lost' } as GPUDeviceLostInfo);
    await Promise.resolve();

    expect(onDeviceLost).not.toHaveBeenCalled();
  });

  it('requests elevated buffer limits when large splats require them', async () => {
    const { adapter, canvas, gpu } = createDeviceHarness();

    await initializeWebGpuSplatDevice(canvas, {
      gpu,
      requiredLimits: {
        maxBufferSize: 900_000_000,
        maxStorageBufferBindingSize: 900_000_000,
      },
    });

    expect(adapter?.requestDevice).toHaveBeenCalledWith({
      requiredLimits: {
        maxBufferSize: 900_000_000,
        maxStorageBufferBindingSize: 900_000_000,
      },
    });
  });

  it('uses the default device descriptor when splats fit portable WebGPU limits', async () => {
    const { adapter, canvas, gpu } = createDeviceHarness();

    await initializeWebGpuSplatDevice(canvas, {
      gpu,
      requiredLimits: {
        maxBufferSize: 64,
        maxStorageBufferBindingSize: 64,
      },
    });

    expect(adapter?.requestDevice).toHaveBeenCalledWith(undefined);
  });

  it('fails device initialization when requestDevice times out and destroys a late device', async () => {
    vi.useFakeTimers();
    try {
      const { adapter, canvas, context, device, gpu } = createDeviceHarness();
      const pendingDeviceRequest = createDeferred<GPUDevice>();
      vi.mocked(adapter?.requestDevice).mockReturnValue(pendingDeviceRequest.promise);

      const initializePromise = initializeWebGpuSplatDevice(canvas, {
        gpu,
        deviceRequestTimeoutMs: 10,
      });
      const initializeRejection = expect(initializePromise)
        .rejects.toThrow(WEBGPU_SPLAT_DEVICE_REQUEST_TIMEOUT_REASON);
      await vi.advanceTimersByTimeAsync(10);

      await initializeRejection;
      expect(context?.configure).not.toHaveBeenCalled();
      expect(getWebGpuSplatDebugCounters()).toMatchObject({
        devices: 0,
        canvases: 0,
      });

      pendingDeviceRequest.resolve(device);
      await Promise.resolve();
      await Promise.resolve();

      expect(device.destroy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails before device creation when required splat limits exceed the adapter', async () => {
    const device = {
      lost: createDeferredLost().lost,
      limits: {
        maxBufferSize: 268_435_456,
        maxStorageBufferBindingSize: 134_217_728,
      } as GPUSupportedLimits,
      destroy: vi.fn(),
    } as unknown as GPUDevice & { destroy: ReturnType<typeof vi.fn> };
    const adapter = {
      limits: {
        maxBufferSize: 268_435_456,
        maxStorageBufferBindingSize: 134_217_728,
      } as GPUSupportedLimits,
      requestDevice: vi.fn().mockResolvedValue(device),
    };
    const { canvas, gpu } = createDeviceHarness({ adapter });

    await expect(initializeWebGpuSplatDevice(canvas, {
      gpu,
      requiredLimits: {
        maxBufferSize: 320_000_000,
        maxStorageBufferBindingSize: 240_000_000,
      },
    })).rejects.toThrow(
      'WebGPU splat renderer requires maxBufferSize 320000000 bytes, but this adapter supports 268435456 bytes'
    );
    expect(adapter.requestDevice).not.toHaveBeenCalled();
    expect(device.destroy).not.toHaveBeenCalled();
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      devices: 0,
      canvases: 0,
    });
  });

  it('destroys the device and fails before canvas configuration when requestDevice under-delivers limits', async () => {
    const { adapter, canvas, context, device, gpu } = createDeviceHarness({
      deviceLimits: {
        maxBufferSize: 268_435_456,
        maxStorageBufferBindingSize: 134_217_728,
      } as GPUSupportedLimits,
    });

    await expect(initializeWebGpuSplatDevice(canvas, {
      gpu,
      requiredLimits: {
        maxBufferSize: 900_000_000,
        maxStorageBufferBindingSize: 900_000_000,
      },
    })).rejects.toThrow(
      'WebGPU device maxBufferSize 268435456 is below required 900000000 bytes'
    );

    expect(adapter?.requestDevice).toHaveBeenCalledWith({
      requiredLimits: {
        maxBufferSize: 900_000_000,
        maxStorageBufferBindingSize: 900_000_000,
      },
    });
    expect(context?.configure).not.toHaveBeenCalled();
    expect(device.destroy).toHaveBeenCalledTimes(1);
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      devices: 0,
      canvases: 0,
    });
  });

  it('destroys the device when canvas configuration fails', async () => {
    const configureError = new Error('configure failed');
    const context = {
      configure: vi.fn(() => {
        throw configureError;
      }),
      unconfigure: vi.fn(),
    };
    const { canvas, device, gpu } = createDeviceHarness({ context });

    await expect(initializeWebGpuSplatDevice(canvas, { gpu }))
      .rejects.toBe(configureError);

    expect(device.destroy).toHaveBeenCalledTimes(1);
    expect(context.unconfigure).not.toHaveBeenCalled();
    expect(getWebGpuSplatDebugCounters()).toMatchObject({
      devices: 0,
      canvases: 0,
    });
  });
});
