import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createNeverLostDevice(limits: Partial<GPUSupportedLimits> = {}): GPUDevice {
  return {
    destroy: vi.fn(),
    limits: limits as GPUSupportedLimits,
    lost: new Promise<GPUDeviceLostInfo>(() => undefined),
  } as unknown as GPUDevice;
}

function createLostDevice(
  lost: Promise<GPUDeviceLostInfo>,
  limits: Partial<GPUSupportedLimits> = {}
): GPUDevice {
  return {
    destroy: vi.fn(),
    limits: limits as GPUSupportedLimits,
    lost,
  } as unknown as GPUDevice;
}

describe('splat PSNR WebGPU runtime', () => {
  const originalGpu = (navigator as Navigator & { gpu?: unknown }).gpu;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: originalGpu,
    });
  });

  it('requests elevated device limits for large splat metric jobs', async () => {
    const device = createNeverLostDevice({
      maxBufferSize: 2_147_483_648,
      maxStorageBufferBindingSize: 2_147_483_644,
    });
    const adapter = {
      limits: {
        maxBufferSize: 2_147_483_648,
        maxStorageBufferBindingSize: 2_147_483_644,
      } as GPUSupportedLimits,
      requestDevice: vi.fn().mockResolvedValue(device),
    };
    const requestAdapter = vi.fn().mockResolvedValue(adapter);
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: {
        requestAdapter,
      },
    });
    const {
      ensureSplatPsnrWebGpuDevice,
      resetSplatPsnrWebGpuDeviceProvider,
    } = await import('./splatPsnrRuntime');
    const {
      getWebGpuSplatDebugCounters,
      resetWebGpuSplatDebugCountersForTests,
    } = await import('../../splat/webgpu/webGpuSplatDebugCounters');
    resetWebGpuSplatDebugCountersForTests();

    try {
      await expect(ensureSplatPsnrWebGpuDevice({
        maxBufferSize: 900_000_000,
        maxStorageBufferBindingSize: 900_000_000,
      })).resolves.toBe(device);
      expect(getWebGpuSplatDebugCounters().devices).toBe(1);
    } finally {
      resetSplatPsnrWebGpuDeviceProvider();
      await Promise.resolve();
    }

    expect(adapter.requestDevice).toHaveBeenCalledWith({
      requiredLimits: {
        maxBufferSize: 900_000_000,
        maxStorageBufferBindingSize: 900_000_000,
      },
    });
    expect(requestAdapter).toHaveBeenCalledWith({ powerPreference: 'high-performance' });
    expect(getWebGpuSplatDebugCounters().devices).toBe(0);
  });

  it('falls back to the default metric adapter request when high-performance is unavailable', async () => {
    const device = createNeverLostDevice();
    const adapter = {
      limits: {} as GPUSupportedLimits,
      requestDevice: vi.fn().mockResolvedValue(device),
    };
    const requestAdapter = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(adapter);
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: {
        requestAdapter,
      },
    });
    const {
      ensureSplatPsnrWebGpuDevice,
      resetSplatPsnrWebGpuDeviceProvider,
    } = await import('./splatPsnrRuntime');

    try {
      await expect(ensureSplatPsnrWebGpuDevice()).resolves.toBe(device);
    } finally {
      resetSplatPsnrWebGpuDeviceProvider();
      await Promise.resolve();
    }

    expect(requestAdapter).toHaveBeenNthCalledWith(1, { powerPreference: 'high-performance' });
    expect(requestAdapter).toHaveBeenNthCalledWith(2);
    expect(adapter.requestDevice).toHaveBeenCalledWith(undefined);
  });

  it('destroys and rejects a metric device that under-delivers requested limits', async () => {
    const device = createNeverLostDevice({
      maxBufferSize: 268_435_456,
      maxStorageBufferBindingSize: 134_217_728,
    });
    const adapter = {
      limits: {
        maxBufferSize: 2_147_483_648,
        maxStorageBufferBindingSize: 2_147_483_644,
      } as GPUSupportedLimits,
      requestDevice: vi.fn().mockResolvedValue(device),
    };
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: {
        requestAdapter: vi.fn().mockResolvedValue(adapter),
      },
    });
    const { ensureSplatPsnrWebGpuDevice } = await import('./splatPsnrRuntime');

    await expect(ensureSplatPsnrWebGpuDevice({
      maxBufferSize: 900_000_000,
      maxStorageBufferBindingSize: 900_000_000,
    })).rejects.toThrow(
      'WebGPU device maxBufferSize 268435456 is below required 900000000 bytes'
    );

    expect(adapter.requestDevice).toHaveBeenCalledWith({
      requiredLimits: {
        maxBufferSize: 900_000_000,
        maxStorageBufferBindingSize: 900_000_000,
      },
    });
    expect(device.destroy).toHaveBeenCalledTimes(1);
  });

  it('uses an injected WebGPU provider instead of navigator.gpu', async () => {
    const device = createNeverLostDevice({
      maxBufferSize: 2_147_483_648,
      maxStorageBufferBindingSize: 2_147_483_644,
    });
    const adapter = {
      limits: {
        maxBufferSize: 2_147_483_648,
        maxStorageBufferBindingSize: 2_147_483_644,
      } as GPUSupportedLimits,
      requestDevice: vi.fn().mockResolvedValue(device),
    };
    const provider = {
      requestAdapter: vi.fn().mockResolvedValue(adapter),
    };
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: undefined,
    });
    const {
      ensureSplatPsnrWebGpuDevice,
      resetSplatPsnrWebGpuDeviceProvider,
      setSplatPsnrWebGpuDeviceProvider,
    } = await import('./splatPsnrRuntime');

    try {
      setSplatPsnrWebGpuDeviceProvider(provider);

      await expect(ensureSplatPsnrWebGpuDevice({
        maxBufferSize: 900_000_000,
        maxStorageBufferBindingSize: 900_000_000,
      })).resolves.toBe(device);

      expect(provider.requestAdapter).toHaveBeenCalledTimes(1);
      expect(provider.requestAdapter).toHaveBeenCalledWith({ powerPreference: 'high-performance' });
      expect(adapter.requestDevice).toHaveBeenCalledWith({
        requiredLimits: {
          maxBufferSize: 900_000_000,
          maxStorageBufferBindingSize: 900_000_000,
        },
      });
    } finally {
      resetSplatPsnrWebGpuDeviceProvider();
    }
  });

  it('releases the cached metric device when the injected provider changes', async () => {
    const firstDevice = createNeverLostDevice();
    const secondDevice = createNeverLostDevice();
    const firstProvider = {
      requestAdapter: vi.fn().mockResolvedValue({
        limits: {} as GPUSupportedLimits,
        requestDevice: vi.fn().mockResolvedValue(firstDevice),
      }),
    };
    const secondProvider = {
      requestAdapter: vi.fn().mockResolvedValue({
        limits: {} as GPUSupportedLimits,
        requestDevice: vi.fn().mockResolvedValue(secondDevice),
      }),
    };
    const {
      ensureSplatPsnrWebGpuDevice,
      resetSplatPsnrWebGpuDeviceProvider,
      setSplatPsnrWebGpuDeviceProvider,
    } = await import('./splatPsnrRuntime');
    const {
      getWebGpuSplatDebugCounters,
      resetWebGpuSplatDebugCountersForTests,
    } = await import('../../splat/webgpu/webGpuSplatDebugCounters');
    resetWebGpuSplatDebugCountersForTests();

    try {
      setSplatPsnrWebGpuDeviceProvider(firstProvider);
      await expect(ensureSplatPsnrWebGpuDevice()).resolves.toBe(firstDevice);
      expect(getWebGpuSplatDebugCounters().devices).toBe(1);

      setSplatPsnrWebGpuDeviceProvider(secondProvider);
      await Promise.resolve();
      expect(getWebGpuSplatDebugCounters().devices).toBe(0);

      await expect(ensureSplatPsnrWebGpuDevice()).resolves.toBe(secondDevice);
      expect(getWebGpuSplatDebugCounters().devices).toBe(1);
      expect(firstDevice.destroy).toHaveBeenCalledTimes(1);
      expect(secondDevice.destroy).not.toHaveBeenCalled();
      expect(firstProvider.requestAdapter).toHaveBeenCalledTimes(1);
      expect(secondProvider.requestAdapter).toHaveBeenCalledTimes(1);
    } finally {
      resetSplatPsnrWebGpuDeviceProvider();
      await Promise.resolve();
    }
    expect(getWebGpuSplatDebugCounters().devices).toBe(0);
  });

  it('reuses a cached metric device for later portable-sized cloud requests', async () => {
    const device = createNeverLostDevice();
    const adapter = {
      limits: {} as GPUSupportedLimits,
      requestDevice: vi.fn().mockResolvedValue(device),
    };
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: {
        requestAdapter: vi.fn().mockResolvedValue(adapter),
      },
    });
    const { ensureSplatPsnrWebGpuDevice } = await import('./splatPsnrRuntime');

    await expect(ensureSplatPsnrWebGpuDevice()).resolves.toBe(device);
    await expect(ensureSplatPsnrWebGpuDevice({
      maxBufferSize: 64,
      maxStorageBufferBindingSize: 64,
    })).resolves.toBe(device);

    expect(device.destroy).not.toHaveBeenCalled();
    expect(adapter.requestDevice).toHaveBeenCalledTimes(1);
    expect(adapter.requestDevice).toHaveBeenCalledWith(undefined);
  });

  it('replaces a cached low-limit metric device when a later cloud requires higher limits', async () => {
    const firstLost = createDeferredDeviceLoss();
    const deviceLossEvents: GPUDeviceLostInfo[] = [];
    const firstDevice = createLostDevice(firstLost.promise, {
      maxBufferSize: 268_435_456,
      maxStorageBufferBindingSize: 134_217_728,
    });
    const secondDevice = createNeverLostDevice({
      maxBufferSize: 2_147_483_648,
      maxStorageBufferBindingSize: 2_147_483_644,
    });
    const adapter = {
      limits: {
        maxBufferSize: 2_147_483_648,
        maxStorageBufferBindingSize: 2_147_483_644,
      } as GPUSupportedLimits,
      requestDevice: vi.fn()
        .mockResolvedValueOnce(firstDevice)
        .mockResolvedValueOnce(secondDevice),
    };
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: {
        requestAdapter: vi.fn().mockResolvedValue(adapter),
      },
    });
    const {
      ensureSplatPsnrWebGpuDevice,
      resetSplatPsnrWebGpuDeviceProvider,
      subscribeSplatPsnrWebGpuDeviceLoss,
    } = await import('./splatPsnrRuntime');
    const {
      getWebGpuSplatDebugCounters,
      resetWebGpuSplatDebugCountersForTests,
    } = await import('../../splat/webgpu/webGpuSplatDebugCounters');
    resetWebGpuSplatDebugCountersForTests();
    const unsubscribe = subscribeSplatPsnrWebGpuDeviceLoss((info) => {
      deviceLossEvents.push(info);
    });

    try {
      await expect(ensureSplatPsnrWebGpuDevice()).resolves.toBe(firstDevice);
      expect(getWebGpuSplatDebugCounters().devices).toBe(1);
      await expect(ensureSplatPsnrWebGpuDevice({
        maxBufferSize: 900_000_000,
        maxStorageBufferBindingSize: 900_000_000,
      })).resolves.toBe(secondDevice);
      expect(getWebGpuSplatDebugCounters().devices).toBe(1);
      firstLost.resolve({ message: 'Device was destroyed.', reason: 'destroyed' } as GPUDeviceLostInfo);
      await Promise.resolve();
      await Promise.resolve();
      expect(deviceLossEvents).toEqual([]);
    } finally {
      unsubscribe();
      resetSplatPsnrWebGpuDeviceProvider();
      await Promise.resolve();
    }

    expect(firstDevice.destroy).toHaveBeenCalledTimes(1);
    expect(adapter.requestDevice).toHaveBeenCalledTimes(2);
    expect(adapter.requestDevice).toHaveBeenNthCalledWith(2, {
      requiredLimits: {
        maxBufferSize: 900_000_000,
        maxStorageBufferBindingSize: 900_000_000,
      },
    });
    expect(getWebGpuSplatDebugCounters().devices).toBe(0);
  });
});

function createDeferredDeviceLoss() {
  let resolve!: (value: GPUDeviceLostInfo) => void;
  const promise = new Promise<GPUDeviceLostInfo>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
