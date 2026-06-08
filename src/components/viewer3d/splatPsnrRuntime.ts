import type { Camera } from '../../types/colmap';
import {
  assertWebGpuDeviceMeetsSplatRequiredLimits,
  createWebGpuRequiredLimitsDescriptor,
  webGpuDeviceMeetsSplatRequiredLimits,
  type WebGpuSplatRequiredLimits,
} from '../../splat/webgpu/webGpuSplatLimits';
import {
  requestPreferredWebGpuSplatAdapter,
  type WebGpuSplatGpuProvider,
} from '../../splat/webgpu/webGpuSplatDevice';
import { trackWebGpuSplatDebugCounter } from '../../splat/webgpu/webGpuSplatDebugCounters';

export const SPLAT_PSNR_DEFAULT_MAX_DIMENSION = Number.POSITIVE_INFINITY;

interface RenderSize {
  width: number;
  height: number;
  scale: number;
}

export interface PsnrResult {
  psnr: number;
  ssim?: number;
  mse: number;
  validPixelCount: number;
}

type SplatPsnrWebGpuDeviceLossListener = (info: GPUDeviceLostInfo, device: GPUDevice) => void;

export type SplatPsnrWebGpuDeviceProvider = Pick<WebGpuSplatGpuProvider, 'requestAdapter' | 'getPlatform'>;

let webGpuPsnrDevicePromise: Promise<GPUDevice> | null = null;
let webGpuPsnrDeviceProvider: SplatPsnrWebGpuDeviceProvider | null = null;
const webGpuPsnrDeviceLossListeners = new Set<SplatPsnrWebGpuDeviceLossListener>();
const webGpuPsnrDeviceCounterReleases = new WeakMap<GPUDevice, () => void>();
const intentionallyReleasedWebGpuPsnrDevices = new WeakSet<GPUDevice>();

export function getSplatPsnrRenderSize(
  camera: Camera,
  maxDimension = SPLAT_PSNR_DEFAULT_MAX_DIMENSION
): RenderSize {
  if (camera.width <= 0 || camera.height <= 0) {
    return { width: 0, height: 0, scale: 0 };
  }

  if (maxDimension <= 0) {
    return { width: 0, height: 0, scale: 0 };
  }

  const largestSide = Math.max(camera.width, camera.height);
  const scale = Number.isFinite(maxDimension)
    ? Math.min(1, maxDimension / largestSide)
    : 1;
  return {
    width: Math.max(1, Math.round(camera.width * scale)),
    height: Math.max(1, Math.round(camera.height * scale)),
    scale,
  };
}

async function getWebGpuPsnrDevice(
  requiredLimits?: Partial<WebGpuSplatRequiredLimits> | null
): Promise<GPUDevice> {
  const provider = getSplatPsnrWebGpuDeviceProvider();
  if (!provider) {
    throw new Error('WebGPU is required for PSNR computation');
  }

  if (webGpuPsnrDevicePromise) {
    const device = await webGpuPsnrDevicePromise;
    if (webGpuDeviceMeetsSplatRequiredLimits(device, requiredLimits)) {
      return device;
    }

    releaseGpuDeviceWithoutLossNotification(device);
    releaseTrackedWebGpuPsnrDevice(device);
    webGpuPsnrDevicePromise = null;
  }

  const devicePromise = requestPreferredWebGpuSplatAdapter(provider)
    .then((adapter) => {
      if (!adapter) {
        throw new Error('WebGPU adapter is unavailable for PSNR computation');
      }
      return adapter.requestDevice(createWebGpuRequiredLimitsDescriptor(adapter, requiredLimits));
    })
    .then((device) => {
      try {
        assertWebGpuDeviceMeetsSplatRequiredLimits(device, requiredLimits);
      } catch (error) {
        destroyGpuDevice(device);
        throw error;
      }
      trackWebGpuPsnrDevice(device);
      watchWebGpuPsnrDeviceLoss(device, devicePromise);
      return device;
    })
    .catch((error: unknown) => {
      if (webGpuPsnrDevicePromise === devicePromise) {
        webGpuPsnrDevicePromise = null;
      }
      throw error;
    });

  webGpuPsnrDevicePromise = devicePromise;
  return webGpuPsnrDevicePromise;
}

export function ensureSplatPsnrWebGpuDevice(
  requiredLimits?: Partial<WebGpuSplatRequiredLimits> | null
): Promise<GPUDevice> {
  return getWebGpuPsnrDevice(requiredLimits);
}

export function setSplatPsnrWebGpuDeviceProvider(
  provider: SplatPsnrWebGpuDeviceProvider | null
): void {
  if (webGpuPsnrDeviceProvider === provider) {
    return;
  }

  releaseCachedWebGpuPsnrDevice();
  webGpuPsnrDeviceProvider = provider;
}

export function resetSplatPsnrWebGpuDeviceProvider(): void {
  releaseCachedWebGpuPsnrDevice();
  webGpuPsnrDeviceProvider = null;
}

export function subscribeSplatPsnrWebGpuDeviceLoss(
  listener: SplatPsnrWebGpuDeviceLossListener
): () => void {
  webGpuPsnrDeviceLossListeners.add(listener);
  return () => {
    webGpuPsnrDeviceLossListeners.delete(listener);
  };
}

function watchWebGpuPsnrDeviceLoss(device: GPUDevice, devicePromise: Promise<GPUDevice>): void {
  const lost = (device as GPUDevice & { lost?: Promise<GPUDeviceLostInfo> }).lost;
  if (!lost) return;

  void lost.then((info) => {
    if (webGpuPsnrDevicePromise === devicePromise) {
      webGpuPsnrDevicePromise = null;
    }
    releaseTrackedWebGpuPsnrDevice(device);
    if (intentionallyReleasedWebGpuPsnrDevices.delete(device)) {
      return;
    }
    for (const listener of Array.from(webGpuPsnrDeviceLossListeners)) {
      listener(info, device);
    }
  });
}

function getSplatPsnrWebGpuDeviceProvider(): SplatPsnrWebGpuDeviceProvider | null {
  if (webGpuPsnrDeviceProvider) {
    return webGpuPsnrDeviceProvider;
  }
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return null;
  }

  const gpu = navigator.gpu;
  return {
    requestAdapter: (adapterOptions) => adapterOptions
      ? gpu.requestAdapter(adapterOptions)
      : gpu.requestAdapter(),
    getPlatform: () => {
      const navigatorWithUserAgentData = navigator as Navigator & {
        userAgentData?: { platform?: string };
      };
      return navigatorWithUserAgentData.userAgentData?.platform
        ?? navigator.platform
        ?? navigator.userAgent;
    },
  };
}

function releaseCachedWebGpuPsnrDevice(): void {
  const cachedDevicePromise = webGpuPsnrDevicePromise;
  webGpuPsnrDevicePromise = null;
  void cachedDevicePromise
    ?.then((device) => {
      releaseGpuDeviceWithoutLossNotification(device);
      releaseTrackedWebGpuPsnrDevice(device);
    })
    .catch(() => undefined);
}

function destroyGpuDevice(device: GPUDevice): void {
  (device as GPUDevice & { destroy?: () => void }).destroy?.();
}

function releaseGpuDeviceWithoutLossNotification(device: GPUDevice): void {
  intentionallyReleasedWebGpuPsnrDevices.add(device);
  destroyGpuDevice(device);
}

function trackWebGpuPsnrDevice(device: GPUDevice): void {
  if (webGpuPsnrDeviceCounterReleases.has(device)) {
    return;
  }

  webGpuPsnrDeviceCounterReleases.set(device, trackWebGpuSplatDebugCounter('devices'));
}

function releaseTrackedWebGpuPsnrDevice(device: GPUDevice): void {
  const release = webGpuPsnrDeviceCounterReleases.get(device);
  if (!release) {
    return;
  }

  webGpuPsnrDeviceCounterReleases.delete(device);
  release();
}
