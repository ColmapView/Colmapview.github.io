import type { GaussianCloud } from '../gaussianCloud';
import {
  createPackedWebGpuGaussianCloud,
  type PackedWebGpuGaussianCloud,
  type WebGpuGaussianCloudBounds,
} from './gaussianCloudPacking';
import {
  noopWebGpuSplatDebugCounterRelease,
  trackWebGpuSplatDebugCounter,
} from './webGpuSplatDebugCounters';
import {
  getWebGpuSplatTelemetryElapsedMs,
  nowWebGpuSplatTelemetryMs,
  recordWebGpuSplatTelemetryEvent,
} from './webGpuSplatTelemetry';
import {
  assertWebGpuDeviceMeetsSplatRequiredLimits,
  getWebGpuSplatRequiredLimitsForCloud,
} from './webGpuSplatLimits';

export const WEBGPU_BUFFER_USAGE_COPY_DST = 0x0008;
export const WEBGPU_BUFFER_USAGE_STORAGE = 0x0080;
export const WEBGPU_MIN_STORAGE_BUFFER_BYTES = 16;

export interface WebGpuUploadedBuffer {
  destroy: () => void;
}

export interface WebGpuGaussianBufferUploader {
  limits?: GPUSupportedLimits;
  createBuffer: (descriptor: {
    label: string;
    size: number;
    usage: number;
  }) => WebGpuUploadedBuffer;
  writeBuffer: (buffer: WebGpuUploadedBuffer, data: Float32Array, offsetBytes?: number) => void;
}

export interface WebGpuGaussianSceneResources {
  count: number;
  shDegree: number;
  bounds: WebGpuGaussianCloudBounds;
  gaussianBuffer: WebGpuUploadedBuffer;
  shBuffer: WebGpuUploadedBuffer;
  gaussianByteLength: number;
  shByteLength: number;
  dispose: () => void;
}

export function createGpuDeviceBufferUploader(device: GPUDevice): WebGpuGaussianBufferUploader {
  return {
    limits: device.limits,
    createBuffer(descriptor) {
      return device.createBuffer({
        label: descriptor.label,
        size: descriptor.size,
        usage: descriptor.usage,
      });
    },
    writeBuffer(buffer, data, offsetBytes = 0) {
      device.queue.writeBuffer(buffer as GPUBuffer, offsetBytes, data as BufferSource);
    },
  };
}

export interface WebGpuGaussianSceneUploadAsyncOptions {
  labelPrefix?: string;
  maxChunkBytes?: number;
  yieldToMainThread?: () => Promise<void>;
  onProgress?: (progress: WebGpuGaussianSceneUploadProgress) => void;
}

export type WebGpuGaussianSceneUploadProgress =
  | { phase: 'packing' }
  | {
      phase: 'uploading';
      uploadedBytes: number;
      totalBytes: number;
    };

export function uploadWebGpuGaussianSceneResources(
  uploader: WebGpuGaussianBufferUploader,
  cloud: GaussianCloud,
  options: { labelPrefix?: string } = {}
): WebGpuGaussianSceneResources {
  assertUploaderMeetsCloudLimits(uploader, cloud);
  const packed = createPackedWebGpuGaussianCloud(cloud);
  return uploadPackedWebGpuGaussianSceneResources(uploader, packed, options);
}

export async function uploadWebGpuGaussianSceneResourcesAsync(
  uploader: WebGpuGaussianBufferUploader,
  cloud: GaussianCloud,
  options: WebGpuGaussianSceneUploadAsyncOptions = {}
): Promise<WebGpuGaussianSceneResources> {
  assertUploaderMeetsCloudLimits(uploader, cloud);
  options.onProgress?.({ phase: 'packing' });
  const packed = createPackedWebGpuGaussianCloud(cloud);
  return uploadPackedWebGpuGaussianSceneResourcesAsync(uploader, packed, options);
}

export function uploadPackedWebGpuGaussianSceneResources(
  uploader: WebGpuGaussianBufferUploader,
  packed: PackedWebGpuGaussianCloud,
  options: { labelPrefix?: string } = {}
): WebGpuGaussianSceneResources {
  assertUploaderMeetsPackedCloudLimits(uploader, packed);
  const labelPrefix = options.labelPrefix ?? 'webgpu splat';
  const telemetryStart = nowWebGpuSplatTelemetryMs();
  let gaussianBuffer: WebGpuUploadedBuffer | null = null;
  let shBuffer: WebGpuUploadedBuffer | null = null;
  let releaseGaussianBufferCounter = noopWebGpuSplatDebugCounterRelease;
  let releaseShBufferCounter = noopWebGpuSplatDebugCounterRelease;

  try {
    gaussianBuffer = uploader.createBuffer({
      label: `${labelPrefix}: gaussians`,
      size: storageBufferSize(packed.gaussianData.byteLength),
      usage: WEBGPU_BUFFER_USAGE_STORAGE | WEBGPU_BUFFER_USAGE_COPY_DST,
    });
    releaseGaussianBufferCounter = trackWebGpuSplatDebugCounter('buffers');
    writeBufferIfNotEmpty(uploader, gaussianBuffer, packed.gaussianData);

    shBuffer = uploader.createBuffer({
      label: `${labelPrefix}: sh`,
      size: storageBufferSize(packed.shData?.byteLength ?? 0),
      usage: packed.shData
        ? WEBGPU_BUFFER_USAGE_STORAGE | WEBGPU_BUFFER_USAGE_COPY_DST
        : WEBGPU_BUFFER_USAGE_STORAGE,
    });
    releaseShBufferCounter = trackWebGpuSplatDebugCounter('buffers');
    if (packed.shData) {
      writeBufferIfNotEmpty(uploader, shBuffer, packed.shData);
    }
  } catch (error) {
    gaussianBuffer?.destroy();
    shBuffer?.destroy();
    releaseGaussianBufferCounter();
    releaseShBufferCounter();
    throw error;
  }

  recordSceneUploadTelemetry(
    packed,
    labelPrefix,
    getWebGpuSplatTelemetryElapsedMs(telemetryStart)
  );

  let disposed = false;
  return {
    count: packed.count,
    shDegree: packed.shDegree,
    bounds: packed.bounds,
    gaussianBuffer,
    shBuffer,
    gaussianByteLength: packed.gaussianData.byteLength,
    shByteLength: packed.shData?.byteLength ?? 0,
    dispose() {
      if (disposed) return;
      disposed = true;
      gaussianBuffer.destroy();
      shBuffer.destroy();
      releaseGaussianBufferCounter();
      releaseShBufferCounter();
    },
  };
}

export async function uploadPackedWebGpuGaussianSceneResourcesAsync(
  uploader: WebGpuGaussianBufferUploader,
  packed: PackedWebGpuGaussianCloud,
  options: WebGpuGaussianSceneUploadAsyncOptions = {}
): Promise<WebGpuGaussianSceneResources> {
  assertUploaderMeetsPackedCloudLimits(uploader, packed);
  const labelPrefix = options.labelPrefix ?? 'webgpu splat';
  const telemetryStart = nowWebGpuSplatTelemetryMs();
  let gaussianBuffer: WebGpuUploadedBuffer | null = null;
  let shBuffer: WebGpuUploadedBuffer | null = null;
  let releaseGaussianBufferCounter = noopWebGpuSplatDebugCounterRelease;
  let releaseShBufferCounter = noopWebGpuSplatDebugCounterRelease;
  const totalUploadBytes = packed.gaussianData.byteLength + (packed.shData?.byteLength ?? 0);
  let uploadedBytes = 0;
  const reportUploadedBytes = (byteLength: number) => {
    uploadedBytes = Math.min(totalUploadBytes, uploadedBytes + byteLength);
    options.onProgress?.({
      phase: 'uploading',
      uploadedBytes,
      totalBytes: totalUploadBytes,
    });
  };

  try {
    options.onProgress?.({
      phase: 'uploading',
      uploadedBytes: 0,
      totalBytes: totalUploadBytes,
    });
    gaussianBuffer = uploader.createBuffer({
      label: `${labelPrefix}: gaussians`,
      size: storageBufferSize(packed.gaussianData.byteLength),
      usage: WEBGPU_BUFFER_USAGE_STORAGE | WEBGPU_BUFFER_USAGE_COPY_DST,
    });
    releaseGaussianBufferCounter = trackWebGpuSplatDebugCounter('buffers');
    await writeBufferInChunksIfNotEmpty(
      uploader,
      gaussianBuffer,
      packed.gaussianData,
      options,
      reportUploadedBytes
    );

    shBuffer = uploader.createBuffer({
      label: `${labelPrefix}: sh`,
      size: storageBufferSize(packed.shData?.byteLength ?? 0),
      usage: packed.shData
        ? WEBGPU_BUFFER_USAGE_STORAGE | WEBGPU_BUFFER_USAGE_COPY_DST
        : WEBGPU_BUFFER_USAGE_STORAGE,
    });
    releaseShBufferCounter = trackWebGpuSplatDebugCounter('buffers');
    if (packed.shData) {
      await writeBufferInChunksIfNotEmpty(
        uploader,
        shBuffer,
        packed.shData,
        options,
        reportUploadedBytes
      );
    }
  } catch (error) {
    gaussianBuffer?.destroy();
    shBuffer?.destroy();
    releaseGaussianBufferCounter();
    releaseShBufferCounter();
    throw error;
  }

  recordSceneUploadTelemetry(
    packed,
    labelPrefix,
    getWebGpuSplatTelemetryElapsedMs(telemetryStart)
  );

  let disposed = false;
  return {
    count: packed.count,
    shDegree: packed.shDegree,
    bounds: packed.bounds,
    gaussianBuffer,
    shBuffer,
    gaussianByteLength: packed.gaussianData.byteLength,
    shByteLength: packed.shData?.byteLength ?? 0,
    dispose() {
      if (disposed) return;
      disposed = true;
      gaussianBuffer.destroy();
      shBuffer.destroy();
      releaseGaussianBufferCounter();
      releaseShBufferCounter();
    },
  };
}

function recordSceneUploadTelemetry(
  packed: PackedWebGpuGaussianCloud,
  labelPrefix: string,
  durationMs: number
): void {
  const shByteLength = packed.shData?.byteLength ?? 0;
  recordWebGpuSplatTelemetryEvent({
    name: 'scene-upload',
    durationMs,
    bytes: packed.gaussianData.byteLength + shByteLength,
    details: {
      labelPrefix,
      count: packed.count,
      shDegree: packed.shDegree,
      gaussianBytes: packed.gaussianData.byteLength,
      shBytes: shByteLength,
    },
  });
}

function storageBufferSize(byteLength: number): number {
  return Math.max(WEBGPU_MIN_STORAGE_BUFFER_BYTES, byteLength);
}

function assertUploaderMeetsCloudLimits(
  uploader: WebGpuGaussianBufferUploader,
  cloud: Pick<GaussianCloud, 'count' | 'shDegree'>
): void {
  if (!uploader.limits) {
    return;
  }

  assertWebGpuDeviceMeetsSplatRequiredLimits(
    { limits: uploader.limits },
    getWebGpuSplatRequiredLimitsForCloud(cloud)
  );
}

function assertUploaderMeetsPackedCloudLimits(
  uploader: WebGpuGaussianBufferUploader,
  packed: Pick<PackedWebGpuGaussianCloud, 'count' | 'shDegree'>
): void {
  assertUploaderMeetsCloudLimits(uploader, packed);
}

function writeBufferIfNotEmpty(
  uploader: WebGpuGaussianBufferUploader,
  buffer: WebGpuUploadedBuffer,
  data: Float32Array
): void {
  if (data.byteLength === 0) return;
  uploader.writeBuffer(buffer, data);
}

async function writeBufferInChunksIfNotEmpty(
  uploader: WebGpuGaussianBufferUploader,
  buffer: WebGpuUploadedBuffer,
  data: Float32Array,
  options: WebGpuGaussianSceneUploadAsyncOptions,
  onChunkUploaded?: (byteLength: number) => void
): Promise<void> {
  if (data.byteLength === 0) return;

  const chunkBytes = getUploadChunkBytes(options.maxChunkBytes);
  if (data.byteLength <= chunkBytes) {
    uploader.writeBuffer(buffer, data);
    onChunkUploaded?.(data.byteLength);
    return;
  }

  const chunkFloats = Math.max(1, Math.floor(chunkBytes / Float32Array.BYTES_PER_ELEMENT));
  const yieldToMainThread = options.yieldToMainThread ?? defaultYieldToMainThread;
  for (let start = 0; start < data.length; start += chunkFloats) {
    const end = Math.min(data.length, start + chunkFloats);
    uploader.writeBuffer(
      buffer,
      data.subarray(start, end),
      start * Float32Array.BYTES_PER_ELEMENT
    );
    onChunkUploaded?.((end - start) * Float32Array.BYTES_PER_ELEMENT);
    if (end < data.length) {
      await yieldToMainThread();
    }
  }
}

function getUploadChunkBytes(value: number | undefined): number {
  const fallback = 16 * 1024 * 1024;
  const bytes = Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback;
  return Math.max(Float32Array.BYTES_PER_ELEMENT, bytes);
}

function defaultYieldToMainThread(): Promise<void> {
  const schedulerWithYield = (globalThis as {
    scheduler?: { yield?: () => Promise<void> };
  }).scheduler;
  if (typeof schedulerWithYield?.yield === 'function') {
    return schedulerWithYield.yield();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
