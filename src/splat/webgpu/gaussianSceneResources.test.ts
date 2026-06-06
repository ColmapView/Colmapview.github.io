import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GaussianCloud } from '../gaussianCloud';
import {
  uploadPackedWebGpuGaussianSceneResourcesAsync,
  uploadWebGpuGaussianSceneResources,
  WEBGPU_BUFFER_USAGE_COPY_DST,
  WEBGPU_BUFFER_USAGE_STORAGE,
  WEBGPU_MIN_STORAGE_BUFFER_BYTES,
  type WebGpuGaussianBufferUploader,
  type WebGpuUploadedBuffer,
} from './gaussianSceneResources';
import {
  getWebGpuSplatDebugCounters,
  resetWebGpuSplatDebugCountersForTests,
} from './webGpuSplatDebugCounters';
import {
  getWebGpuSplatTelemetryEvents,
  resetWebGpuSplatTelemetryEventsForTests,
} from './webGpuSplatTelemetry';

type FakeBuffer = WebGpuUploadedBuffer & {
  label: string;
  size: number;
  usage: number;
  destroy: ReturnType<typeof vi.fn>;
};

function makeCloud(overrides: Partial<GaussianCloud> = {}): GaussianCloud {
  return {
    count: 2,
    positions: new Float32Array([
      1, 2, 3,
      -4, 5, -6,
    ]),
    scales: new Float32Array([
      0.1, 0.2, 0.3,
      1.1, 1.2, 1.3,
    ]),
    rotations: new Float32Array([
      1, 0, 0, 0,
      0.5, 0.5, 0.5, 0.5,
    ]),
    opacities: new Float32Array([0.25, 0.75]),
    sh0: new Float32Array([
      0.01, 0.02, 0.03,
      0.11, 0.12, 0.13,
    ]),
    shDegree: 0,
    ...overrides,
  };
}

function createFakeUploader(options: {
  failCreateAt?: number;
  failWriteAt?: number;
  limits?: GPUSupportedLimits;
} = {}): {
  uploader: WebGpuGaussianBufferUploader;
  buffers: FakeBuffer[];
  writes: Array<{ buffer: FakeBuffer; data: Float32Array; offsetBytes: number }>;
} {
  const buffers: FakeBuffer[] = [];
  const writes: Array<{ buffer: FakeBuffer; data: Float32Array; offsetBytes: number }> = [];
  let createCount = 0;
  let writeCount = 0;

  return {
    buffers,
    writes,
    uploader: {
      limits: options.limits,
      createBuffer: vi.fn((descriptor) => {
        createCount += 1;
        if (createCount === options.failCreateAt) {
          throw new Error(`create ${createCount} failed`);
        }

        const buffer: FakeBuffer = {
          label: descriptor.label,
          size: descriptor.size,
          usage: descriptor.usage,
          destroy: vi.fn(),
        };
        buffers.push(buffer);
        return buffer;
      }),
      writeBuffer: vi.fn((buffer, data, offsetBytes = 0) => {
        writeCount += 1;
        if (writeCount === options.failWriteAt) {
          throw new Error(`write ${writeCount} failed`);
        }
        writes.push({ buffer: buffer as FakeBuffer, data, offsetBytes });
      }),
    },
  };
}

describe('WebGPU Gaussian scene resources', () => {
  beforeEach(() => {
    resetWebGpuSplatDebugCountersForTests();
    resetWebGpuSplatTelemetryEventsForTests();
  });

  it('uploads packed Gaussian and SH data into storage buffers', () => {
    const { uploader, buffers, writes } = createFakeUploader();
    const shN = new Float32Array(18).fill(0.4);

    const resources = uploadWebGpuGaussianSceneResources(uploader, makeCloud({
      shDegree: 1,
      shN,
    }), { labelPrefix: 'bicycle' });

    expect(resources.count).toBe(2);
    expect(resources.shDegree).toBe(1);
    expect(resources.gaussianByteLength).toBe(2 * 16 * 4);
    expect(resources.shByteLength).toBe(18 * 4);
    expect(resources.bounds.center).toEqual([-1.5, 3.5, -1.5]);
    expect(buffers).toHaveLength(2);
    expect(buffers[0]).toMatchObject({
      label: 'bicycle: gaussians',
      size: 2 * 16 * 4,
      usage: WEBGPU_BUFFER_USAGE_STORAGE | WEBGPU_BUFFER_USAGE_COPY_DST,
    });
    expect(buffers[1]).toMatchObject({
      label: 'bicycle: sh',
      size: 18 * 4,
      usage: WEBGPU_BUFFER_USAGE_STORAGE | WEBGPU_BUFFER_USAGE_COPY_DST,
    });
    expect(writes.map((write) => write.data.byteLength)).toEqual([2 * 16 * 4, 18 * 4]);
    expect(getWebGpuSplatDebugCounters().buffers).toBe(2);
    expect(getWebGpuSplatTelemetryEvents()).toEqual([
      expect.objectContaining({
        name: 'scene-upload',
        bytes: 2 * 16 * 4 + 18 * 4,
        details: expect.objectContaining({
          labelPrefix: 'bicycle',
          count: 2,
          shDegree: 1,
          gaussianBytes: 2 * 16 * 4,
          shBytes: 18 * 4,
        }),
      }),
    ]);

    resources.dispose();
    resources.dispose();
    expect(buffers[0].destroy).toHaveBeenCalledTimes(1);
    expect(buffers[1].destroy).toHaveBeenCalledTimes(1);
    expect(getWebGpuSplatDebugCounters().buffers).toBe(0);
  });

  it('can upload packed Gaussian buffers in yielded chunks', async () => {
    const { uploader, writes } = createFakeUploader();
    const yieldToMainThread = vi.fn(async () => undefined);

    const resources = await uploadPackedWebGpuGaussianSceneResourcesAsync(uploader, {
      count: 3,
      shDegree: 1,
      gaussianData: new Float32Array(12),
      shData: new Float32Array(8),
      bounds: {
        min: [0, 0, 0],
        max: [1, 1, 1],
        center: [0.5, 0.5, 0.5],
        size: 1,
      },
    }, {
      labelPrefix: 'chunked',
      maxChunkBytes: 16,
      yieldToMainThread,
    });

    expect(writes.map((write) => write.data.byteLength)).toEqual([16, 16, 16, 16, 16]);
    expect(writes.map((write) => write.offsetBytes)).toEqual([0, 16, 32, 0, 16]);
    expect(yieldToMainThread).toHaveBeenCalledTimes(3);

    resources.dispose();
  });

  it('keeps empty and SH0-only scenes valid with minimum storage buffers', () => {
    const { uploader, buffers, writes } = createFakeUploader();

    const resources = uploadWebGpuGaussianSceneResources(uploader, makeCloud({
      count: 0,
      positions: new Float32Array(),
      scales: new Float32Array(),
      rotations: new Float32Array(),
      opacities: new Float32Array(),
      sh0: new Float32Array(),
    }));

    expect(resources.count).toBe(0);
    expect(resources.gaussianByteLength).toBe(0);
    expect(resources.shByteLength).toBe(0);
    expect(buffers).toHaveLength(2);
    expect(buffers[0]).toMatchObject({
      size: WEBGPU_MIN_STORAGE_BUFFER_BYTES,
      usage: WEBGPU_BUFFER_USAGE_STORAGE | WEBGPU_BUFFER_USAGE_COPY_DST,
    });
    expect(buffers[1]).toMatchObject({
      size: WEBGPU_MIN_STORAGE_BUFFER_BYTES,
      usage: WEBGPU_BUFFER_USAGE_STORAGE,
    });
    expect(writes).toEqual([]);
  });

  it('destroys partially created buffers if upload fails', () => {
    const { uploader, buffers } = createFakeUploader({ failCreateAt: 2 });

    expect(() => uploadWebGpuGaussianSceneResources(uploader, makeCloud()))
      .toThrow('create 2 failed');
    expect(buffers).toHaveLength(1);
    expect(buffers[0].destroy).toHaveBeenCalledTimes(1);
    expect(getWebGpuSplatDebugCounters().buffers).toBe(0);
    expect(getWebGpuSplatTelemetryEvents()).toEqual([]);
  });

  it('rejects large uploads before creating buffers when uploader device limits are too low', () => {
    const { uploader, buffers, writes } = createFakeUploader({
      limits: {
        maxBufferSize: 268_435_456,
        maxStorageBufferBindingSize: 134_217_728,
      } as GPUSupportedLimits,
    });

    expect(() => uploadWebGpuGaussianSceneResources(uploader, makeCloud({
      count: 5_000_000,
      shDegree: 3,
    }))).toThrow(
      'WebGPU device maxBufferSize 268435456 is below required 900000000 bytes'
    );

    expect(buffers).toEqual([]);
    expect(writes).toEqual([]);
    expect(uploader.createBuffer).not.toHaveBeenCalled();
    expect(getWebGpuSplatDebugCounters().buffers).toBe(0);
    expect(getWebGpuSplatTelemetryEvents()).toEqual([]);
  });
});
