import type { GaussianCloud } from '../gaussianCloud';
import { WEBGPU_GAUSSIAN_STRIDE_BYTES } from './gaussianCloudPacking';

const FLOAT32_BYTES = Float32Array.BYTES_PER_ELEMENT;
const U32_BYTES = Uint32Array.BYTES_PER_ELEMENT;
const WEBGPU_MIN_STORAGE_BUFFER_BYTES = 16;
const WEBGPU_RENDERER_SPLAT_DATA_BYTES = 48;
const WEBGPU_PORTABLE_DEFAULT_LIMITS: WebGpuSplatRequiredLimits = {
  maxBufferSize: 256 * 1024 * 1024,
  maxStorageBufferBindingSize: 128 * 1024 * 1024,
};

export interface WebGpuSplatRequiredLimits {
  maxBufferSize: number;
  maxStorageBufferBindingSize: number;
}

export interface WebGpuSplatCloudShape {
  count: number;
  shDegree: number;
}

export interface WebGpuSplatBufferRequirements extends WebGpuSplatRequiredLimits {
  gaussianBufferBytes: number;
  shBufferBytes: number;
  rendererSplatDataBytes: number;
  rendererDepthBytes: number;
  rendererIndexBytes: number;
}

export function getWebGpuSplatRequiredLimitsForCloud(
  cloud: Pick<GaussianCloud, 'count' | 'shDegree'>
): WebGpuSplatRequiredLimits {
  const requirements = getWebGpuSplatBufferRequirementsForCloudShape(cloud);
  return {
    maxBufferSize: requirements.maxBufferSize,
    maxStorageBufferBindingSize: requirements.maxStorageBufferBindingSize,
  };
}

export function getWebGpuSplatRendererRequiredLimitsForCount(
  count: number
): WebGpuSplatRequiredLimits {
  const safeCount = requireNonNegativeInteger(count, 'Gaussian count');
  const rendererSplatDataBytes = storageBufferSize(safeCount * WEBGPU_RENDERER_SPLAT_DATA_BYTES);
  const rendererDepthBytes = storageBufferSize(safeCount * U32_BYTES);
  const rendererIndexBytes = storageBufferSize(safeCount * U32_BYTES);
  const maxStorageBufferBindingSize = Math.max(
    rendererSplatDataBytes,
    rendererDepthBytes,
    rendererIndexBytes
  );

  return {
    maxBufferSize: maxStorageBufferBindingSize,
    maxStorageBufferBindingSize,
  };
}

export function getWebGpuSplatBufferRequirementsForCloudShape({
  count,
  shDegree,
}: WebGpuSplatCloudShape): WebGpuSplatBufferRequirements {
  const safeCount = requireNonNegativeInteger(count, 'Gaussian count');
  const safeShDegree = requireShDegree(shDegree);
  const gaussianBufferBytes = storageBufferSize(safeCount * WEBGPU_GAUSSIAN_STRIDE_BYTES);
  const shBufferBytes = storageBufferSize(safeCount * getShCoefficientFloatCount(safeShDegree) * FLOAT32_BYTES);
  const rendererLimits = getWebGpuSplatRendererRequiredLimitsForCount(safeCount);
  const rendererSplatDataBytes = storageBufferSize(safeCount * WEBGPU_RENDERER_SPLAT_DATA_BYTES);
  const rendererDepthBytes = storageBufferSize(safeCount * U32_BYTES);
  const rendererIndexBytes = storageBufferSize(safeCount * U32_BYTES);
  const maxStorageBufferBindingSize = Math.max(
    gaussianBufferBytes,
    shBufferBytes,
    rendererLimits.maxStorageBufferBindingSize
  );

  return {
    gaussianBufferBytes,
    shBufferBytes,
    rendererSplatDataBytes,
    rendererDepthBytes,
    rendererIndexBytes,
    maxBufferSize: maxStorageBufferBindingSize,
    maxStorageBufferBindingSize,
  };
}

export function createWebGpuRequiredLimitsDescriptor(
  adapter: Pick<GPUAdapter, 'limits'>,
  requiredLimits?: Partial<WebGpuSplatRequiredLimits> | null
): GPUDeviceDescriptor | undefined {
  if (!requiredLimits) {
    return undefined;
  }

  const requested: Record<string, number> = {};
  addRequiredLimit(adapter, requested, 'maxBufferSize', requiredLimits.maxBufferSize);
  addRequiredLimit(
    adapter,
    requested,
    'maxStorageBufferBindingSize',
    requiredLimits.maxStorageBufferBindingSize
  );

  return Object.keys(requested).length > 0
    ? { requiredLimits: requested }
    : undefined;
}

export function webGpuDeviceMeetsSplatRequiredLimits(
  device: Pick<GPUDevice, 'limits'> | null | undefined,
  requiredLimits?: Partial<WebGpuSplatRequiredLimits> | null
): boolean {
  return getWebGpuSplatDeviceLimitFailureReason(device, requiredLimits) === null;
}

export function assertWebGpuDeviceMeetsSplatRequiredLimits(
  device: Pick<GPUDevice, 'limits'> | null | undefined,
  requiredLimits?: Partial<WebGpuSplatRequiredLimits> | null
): void {
  const reason = getWebGpuSplatDeviceLimitFailureReason(device, requiredLimits);
  if (reason) {
    throw new Error(reason);
  }
}

export function getWebGpuSplatDeviceLimitFailureReason(
  device: Pick<GPUDevice, 'limits'> | null | undefined,
  requiredLimits?: Partial<WebGpuSplatRequiredLimits> | null
): string | null {
  if (!requiredLimits) {
    return null;
  }

  return getDeviceLimitFailureReason(device, 'maxBufferSize', requiredLimits.maxBufferSize)
    ?? getDeviceLimitFailureReason(device, 'maxStorageBufferBindingSize', requiredLimits.maxStorageBufferBindingSize);
}

function addRequiredLimit(
  adapter: Pick<GPUAdapter, 'limits'>,
  requested: Record<string, number>,
  name: keyof WebGpuSplatRequiredLimits,
  value: number | undefined
): void {
  if (value === undefined) {
    return;
  }

  const required = requirePositiveInteger(value, name);
  if (!requiresElevatedLimit(name, required)) {
    return;
  }

  const supported = getLimit(adapter.limits, name);
  if (supported === null) {
    throw new Error(`WebGPU adapter does not expose ${name}`);
  }
  if (required > supported) {
    throw new Error(
      `WebGPU splat renderer requires ${name} ${required} bytes, but this adapter supports ${supported} bytes`
    );
  }

  requested[name] = required;
}

function getDeviceLimitFailureReason(
  device: Pick<GPUDevice, 'limits'> | null | undefined,
  name: keyof WebGpuSplatRequiredLimits,
  value: number | undefined
): string | null {
  if (value === undefined) {
    return null;
  }

  const required = requirePositiveInteger(value, name);
  if (!requiresElevatedLimit(name, required)) {
    return null;
  }

  const supported = getLimit(device?.limits, name);
  if (supported === null) {
    return `WebGPU device does not expose ${name}`;
  }
  if (supported < required) {
    return `WebGPU device ${name} ${supported} is below required ${required} bytes`;
  }
  return null;
}

function requiresElevatedLimit(name: keyof WebGpuSplatRequiredLimits, value: number): boolean {
  return value > WEBGPU_PORTABLE_DEFAULT_LIMITS[name];
}

function getLimit(
  limits: GPUSupportedLimits | undefined,
  name: keyof WebGpuSplatRequiredLimits
): number | null {
  const value = limits?.[name];
  if (typeof value !== 'number') {
    return null;
  }
  return Number.isInteger(value) && value > 0 ? value : null;
}

function getShCoefficientFloatCount(shDegree: number): number {
  if (shDegree <= 0) {
    return 0;
  }
  return ((shDegree + 1) ** 2 - 1) * 3;
}

function storageBufferSize(byteLength: number): number {
  return Math.max(WEBGPU_MIN_STORAGE_BUFFER_BYTES, requireNonNegativeInteger(byteLength, 'buffer byte length'));
}

function requireShDegree(value: number): number {
  const degree = requireNonNegativeInteger(value, 'SH degree');
  if (degree > 3) {
    throw new Error(`Invalid SH degree: expected 0-3, got ${degree}`);
  }
  return degree;
}

function requireNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${name}: expected a non-negative integer`);
  }
  return value;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name}: expected a positive integer`);
  }
  return value;
}
