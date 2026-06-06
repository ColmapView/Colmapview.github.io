import {
  assertWebGpuDeviceMeetsSplatRequiredLimits,
  createWebGpuRequiredLimitsDescriptor,
  type WebGpuSplatRequiredLimits,
} from './webGpuSplatLimits';
import { trackWebGpuSplatDebugCounter } from './webGpuSplatDebugCounters';

export interface WebGpuSplatGpuProvider {
  requestAdapter: (
    options?: GPURequestAdapterOptions
  ) => Promise<Pick<GPUAdapter, 'limits' | 'requestDevice'> | null>;
  getPreferredCanvasFormat?: () => GPUTextureFormat;
}

export interface WebGpuSplatDeviceHandle {
  adapter: Pick<GPUAdapter, 'limits' | 'requestDevice'>;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  dispose: () => void;
}

export interface WebGpuSplatDeviceOptions {
  gpu?: WebGpuSplatGpuProvider | null;
  adapterOptions?: GPURequestAdapterOptions;
  alphaMode?: GPUCanvasAlphaMode;
  requiredLimits?: Partial<WebGpuSplatRequiredLimits> | null;
  onDeviceLost?: (info: GPUDeviceLostInfo) => void;
}

export const WEBGPU_SPLAT_PREFERRED_ADAPTER_OPTIONS: GPURequestAdapterOptions = {
  powerPreference: 'high-performance',
};

export function getBrowserWebGpuProvider(): WebGpuSplatGpuProvider | null {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return null;
  }

  const gpu = navigator.gpu;
  return {
    requestAdapter: (adapterOptions) => adapterOptions
      ? gpu.requestAdapter(adapterOptions)
      : gpu.requestAdapter(),
    getPreferredCanvasFormat: () => gpu.getPreferredCanvasFormat(),
  };
}

export async function requestPreferredWebGpuSplatAdapter(
  gpu: WebGpuSplatGpuProvider,
  adapterOptions: GPURequestAdapterOptions = WEBGPU_SPLAT_PREFERRED_ADAPTER_OPTIONS
): Promise<Pick<GPUAdapter, 'limits' | 'requestDevice'> | null> {
  const preferredAdapter = await gpu.requestAdapter(adapterOptions);
  if (preferredAdapter || !adapterOptions) {
    return preferredAdapter;
  }

  return gpu.requestAdapter();
}

export async function initializeWebGpuSplatDevice(
  canvas: HTMLCanvasElement,
  options: WebGpuSplatDeviceOptions = {}
): Promise<WebGpuSplatDeviceHandle> {
  const gpu = options.gpu ?? getBrowserWebGpuProvider();
  if (!gpu) {
    throw new Error('WebGPU is not supported by this browser');
  }

  const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
  if (!context) {
    throw new Error('WebGPU canvas context is unavailable');
  }

  const adapter = await requestPreferredWebGpuSplatAdapter(gpu, options.adapterOptions);
  if (!adapter) {
    throw new Error('WebGPU adapter is unavailable');
  }

  const deviceDescriptor = createWebGpuRequiredLimitsDescriptor(adapter, options.requiredLimits);
  const device = await adapter.requestDevice(deviceDescriptor);
  try {
    assertWebGpuDeviceMeetsSplatRequiredLimits(device, options.requiredLimits);
  } catch (error) {
    destroyGpuDevice(device);
    throw error;
  }
  const format = gpu.getPreferredCanvasFormat?.() ?? 'bgra8unorm';
  const alphaMode = options.alphaMode ?? 'premultiplied';
  let disposed = false;

  context.configure({
    device,
    format,
    alphaMode,
  });
  const releaseDeviceCounter = trackWebGpuSplatDebugCounter('devices');
  const releaseCanvasCounter = trackWebGpuSplatDebugCounter('canvases');

  if (options.onDeviceLost) {
    void device.lost.then((info) => {
      if (!disposed) {
        options.onDeviceLost?.(info);
      }
    });
  }

  return {
    adapter,
    device,
    context,
    format,
    dispose() {
      if (disposed) return;
      disposed = true;
      context.unconfigure();
      releaseCanvasCounter();
      releaseDeviceCounter();
    },
  };
}

function destroyGpuDevice(device: GPUDevice): void {
  (device as GPUDevice & { destroy?: () => void }).destroy?.();
}
