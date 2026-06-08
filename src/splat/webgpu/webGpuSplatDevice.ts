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
  getPlatform?: () => string | undefined;
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
  adapter?: Pick<GPUAdapter, 'limits' | 'requestDevice'>;
  adapterOptions?: GPURequestAdapterOptions;
  alphaMode?: GPUCanvasAlphaMode;
  requiredLimits?: Partial<WebGpuSplatRequiredLimits> | null;
  onDeviceLost?: (info: GPUDeviceLostInfo) => void;
}

export const WEBGPU_SPLAT_PREFERRED_ADAPTER_OPTIONS: GPURequestAdapterOptions = {
  powerPreference: 'high-performance',
};
export const WEBGPU_SPLAT_ADAPTER_UNAVAILABLE_REASON = 'WebGPU adapter is unavailable';

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
    getPlatform: getBrowserPlatform,
  };
}

export async function requestPreferredWebGpuSplatAdapter(
  gpu: WebGpuSplatGpuProvider,
  adapterOptions: GPURequestAdapterOptions = WEBGPU_SPLAT_PREFERRED_ADAPTER_OPTIONS
): Promise<Pick<GPUAdapter, 'limits' | 'requestDevice'> | null> {
  if (shouldUseDefaultAdapterRequestOnly(gpu, adapterOptions)) {
    return requestWebGpuSplatAdapter(gpu);
  }

  const preferredAdapter = await requestWebGpuSplatAdapter(gpu, adapterOptions);
  if (preferredAdapter || !adapterOptions) {
    return preferredAdapter;
  }

  return await requestWebGpuSplatAdapter(gpu)
    ?? requestWebGpuSplatAdapter(gpu, { powerPreference: 'low-power' });
}

export function isWebGpuAdapterUnavailableReason(reason: string): boolean {
  return /WebGPU adapter is unavailable|adapter is unavailable|No available adapters/i.test(reason);
}

export function isWebGpuAdapterUnavailableError(error: unknown): boolean {
  const reason = error instanceof Error ? error.message : String(error);
  return isWebGpuAdapterUnavailableReason(reason);
}

export function getWebGpuAdapterUnavailableDetailReason(gpu?: WebGpuSplatGpuProvider | null): string {
  if (gpu && shouldUseDefaultAdapterRequestOnly(gpu, WEBGPU_SPLAT_PREFERRED_ADAPTER_OPTIONS)) {
    return `${WEBGPU_SPLAT_ADAPTER_UNAVAILABLE_REASON}: navigator.gpu exists, but Windows returned no adapter from the default requestAdapter call`;
  }

  return `${WEBGPU_SPLAT_ADAPTER_UNAVAILABLE_REASON}: navigator.gpu exists, but high-performance, default, and low-power requestAdapter attempts returned no adapter`;
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

  const adapter = options.adapter
    ?? await requestPreferredWebGpuSplatAdapter(gpu, options.adapterOptions);
  if (!adapter) {
    throw new Error(WEBGPU_SPLAT_ADAPTER_UNAVAILABLE_REASON);
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

function getBrowserPlatform(): string | undefined {
  const navigatorWithUserAgentData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  return navigatorWithUserAgentData.userAgentData?.platform
    ?? navigator.platform
    ?? navigator.userAgent;
}

function shouldUseDefaultAdapterRequestOnly(
  gpu: WebGpuSplatGpuProvider,
  adapterOptions?: GPURequestAdapterOptions
): boolean {
  return Boolean(adapterOptions?.powerPreference && isWindowsPlatform(gpu.getPlatform?.()));
}

function isWindowsPlatform(platform: string | undefined): boolean {
  return typeof platform === 'string' && /win/i.test(platform);
}

async function requestWebGpuSplatAdapter(
  gpu: WebGpuSplatGpuProvider,
  adapterOptions?: GPURequestAdapterOptions
): Promise<Pick<GPUAdapter, 'limits' | 'requestDevice'> | null> {
  try {
    return adapterOptions
      ? await gpu.requestAdapter(adapterOptions)
      : await gpu.requestAdapter();
  } catch {
    return null;
  }
}
