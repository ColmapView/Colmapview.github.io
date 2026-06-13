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
  adapterRequestTimeoutMs?: number;
  deviceRequestTimeoutMs?: number;
  alphaMode?: GPUCanvasAlphaMode;
  requiredLimits?: Partial<WebGpuSplatRequiredLimits> | null;
  onDeviceLost?: (info: GPUDeviceLostInfo) => void;
}

export const WEBGPU_SPLAT_PREFERRED_ADAPTER_OPTIONS: GPURequestAdapterOptions = {
  powerPreference: 'high-performance',
};
export const WEBGPU_SPLAT_ADAPTER_UNAVAILABLE_REASON = 'WebGPU adapter is unavailable';
export const WEBGPU_SPLAT_ADAPTER_REQUEST_TIMEOUT_MS = 10000;
export const WEBGPU_SPLAT_DEVICE_REQUEST_TIMEOUT_REASON = 'WebGPU device request timed out';
export const WEBGPU_SPLAT_DEVICE_REQUEST_TIMEOUT_MS = 10000;

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
  adapterOptions: GPURequestAdapterOptions = WEBGPU_SPLAT_PREFERRED_ADAPTER_OPTIONS,
  requestTimeoutMs = WEBGPU_SPLAT_ADAPTER_REQUEST_TIMEOUT_MS
): Promise<Pick<GPUAdapter, 'limits' | 'requestDevice'> | null> {
  const timeoutBudget = createWebGpuRequestTimeoutBudget(
    requestTimeoutMs,
    shouldUseDefaultAdapterRequestOnly(gpu, adapterOptions) || !adapterOptions ? 1 : 3
  );

  if (shouldUseDefaultAdapterRequestOnly(gpu, adapterOptions)) {
    return requestWebGpuSplatAdapter(gpu, undefined, getNextWebGpuRequestTimeoutMs(timeoutBudget));
  }

  const preferredAdapter = await requestWebGpuSplatAdapter(
    gpu,
    adapterOptions,
    getNextWebGpuRequestTimeoutMs(timeoutBudget)
  );
  if (preferredAdapter || !adapterOptions) {
    return preferredAdapter;
  }

  return await requestWebGpuSplatAdapter(gpu, undefined, getNextWebGpuRequestTimeoutMs(timeoutBudget))
    ?? requestWebGpuSplatAdapter(
      gpu,
      { powerPreference: 'low-power' },
      getNextWebGpuRequestTimeoutMs(timeoutBudget)
    );
}

export async function requestWebGpuSplatDevice(
  adapter: Pick<GPUAdapter, 'requestDevice'>,
  descriptor?: GPUDeviceDescriptor,
  requestTimeoutMs = WEBGPU_SPLAT_DEVICE_REQUEST_TIMEOUT_MS
): Promise<GPUDevice> {
  const device = await withWebGpuDeviceRequestTimeout(
    adapter.requestDevice(descriptor),
    requestTimeoutMs
  );
  if (!device) {
    throw new Error(WEBGPU_SPLAT_DEVICE_REQUEST_TIMEOUT_REASON);
  }
  return device;
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
    return `${WEBGPU_SPLAT_ADAPTER_UNAVAILABLE_REASON}: navigator.gpu exists, but Windows returned no adapter from the default requestAdapter call or the request timed out`;
  }

  return `${WEBGPU_SPLAT_ADAPTER_UNAVAILABLE_REASON}: navigator.gpu exists, but high-performance, default, and low-power requestAdapter attempts returned no adapter or timed out`;
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
    ?? await requestPreferredWebGpuSplatAdapter(
      gpu,
      options.adapterOptions,
      options.adapterRequestTimeoutMs
    );
  if (!adapter) {
    throw new Error(WEBGPU_SPLAT_ADAPTER_UNAVAILABLE_REASON);
  }

  const deviceDescriptor = createWebGpuRequiredLimitsDescriptor(adapter, options.requiredLimits);
  const device = await requestWebGpuSplatDevice(
    adapter,
    deviceDescriptor,
    options.deviceRequestTimeoutMs
  );
  try {
    assertWebGpuDeviceMeetsSplatRequiredLimits(device, options.requiredLimits);
  } catch (error) {
    destroyGpuDevice(device);
    throw error;
  }
  const format = gpu.getPreferredCanvasFormat?.() ?? 'bgra8unorm';
  const alphaMode = options.alphaMode ?? 'premultiplied';
  let disposed = false;

  try {
    context.configure({
      device,
      format,
      alphaMode,
    });
  } catch (error) {
    destroyGpuDevice(device);
    throw error;
  }
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
      try {
        context.unconfigure();
      } finally {
        try {
          destroyGpuDevice(device);
        } finally {
          releaseCanvasCounter();
          releaseDeviceCounter();
        }
      }
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
  return typeof platform === 'string' && (/^win/i.test(platform) || /\bwindows\b/i.test(platform));
}

async function requestWebGpuSplatAdapter(
  gpu: WebGpuSplatGpuProvider,
  adapterOptions?: GPURequestAdapterOptions,
  timeoutMs = WEBGPU_SPLAT_ADAPTER_REQUEST_TIMEOUT_MS
): Promise<Pick<GPUAdapter, 'limits' | 'requestDevice'> | null> {
  try {
    const adapterPromise = adapterOptions
      ? gpu.requestAdapter(adapterOptions)
      : gpu.requestAdapter();
    return await withWebGpuAdapterRequestTimeout(adapterPromise, timeoutMs);
  } catch {
    return null;
  }
}

function withWebGpuAdapterRequestTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T | null> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T | null>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      resolve(null);
    }, timeoutMs);

    promise.then(
      (value) => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        resolve(value);
      },
      (error: unknown) => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        reject(error);
      }
    );
  });
}

interface WebGpuRequestTimeoutBudget {
  deadlineMs?: number;
  remainingAttempts: number;
  timeoutMs: number;
}

function createWebGpuRequestTimeoutBudget(
  timeoutMs: number,
  attemptCount: number
): WebGpuRequestTimeoutBudget {
  const remainingAttempts = Math.max(1, attemptCount);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { remainingAttempts, timeoutMs };
  }

  return {
    deadlineMs: Date.now() + timeoutMs,
    remainingAttempts,
    timeoutMs,
  };
}

function getNextWebGpuRequestTimeoutMs(budget: WebGpuRequestTimeoutBudget): number {
  if (budget.deadlineMs === undefined) {
    return budget.timeoutMs;
  }

  const remainingMs = budget.deadlineMs - Date.now();
  const remainingAttempts = Math.max(1, budget.remainingAttempts);
  budget.remainingAttempts = Math.max(0, budget.remainingAttempts - 1);
  if (remainingMs <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(remainingMs / remainingAttempts));
}

function withWebGpuDeviceRequestTimeout(
  promise: Promise<GPUDevice>,
  timeoutMs: number
): Promise<GPUDevice | null> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  return new Promise<GPUDevice | null>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      timedOut = true;
      resolve(null);
    }, timeoutMs);

    promise.then(
      (device) => {
        if (timedOut) {
          destroyGpuDevice(device);
          return;
        }
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        resolve(device);
      },
      (error: unknown) => {
        if (timedOut) {
          return;
        }
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        reject(error);
      }
    );
  });
}
