import { describe, expect, it, vi } from 'vitest';
import type { GaussianCloud } from '../gaussianCloud';
import type {
  WebGpuGaussianBufferUploader,
  WebGpuGaussianSceneResources,
  WebGpuUploadedBuffer,
} from './gaussianSceneResources';
import { GaussianSceneResourceManager } from './gaussianSceneResourceManager';

type FakeBuffer = WebGpuUploadedBuffer & {
  label: string;
  destroy: ReturnType<typeof vi.fn>;
};

function makeCloud(overrides: Partial<GaussianCloud> = {}): GaussianCloud {
  return {
    count: 1,
    positions: new Float32Array([1, 2, 3]),
    scales: new Float32Array([0.1, 0.2, 0.3]),
    rotations: new Float32Array([1, 0, 0, 0]),
    opacities: new Float32Array([0.5]),
    sh0: new Float32Array([0.01, 0.02, 0.03]),
    shDegree: 0,
    ...overrides,
  };
}

function makeDevice(label: string): GPUDevice {
  return { label } as unknown as GPUDevice;
}

function createFakeBuffer(label: string): FakeBuffer {
  return {
    label,
    destroy: vi.fn(),
  };
}

function createFakeResources(label: string): WebGpuGaussianSceneResources {
  return {
    count: 1,
    shDegree: 0,
    bounds: {
      min: [1, 2, 3],
      max: [1, 2, 3],
      center: [1, 2, 3],
      size: 1,
    },
    gaussianBuffer: createFakeBuffer(`${label}: gaussians`),
    shBuffer: createFakeBuffer(`${label}: sh`),
    gaussianByteLength: 64,
    shByteLength: 0,
    dispose: vi.fn(function dispose(this: WebGpuGaussianSceneResources) {
      this.gaussianBuffer.destroy();
      this.shBuffer.destroy();
    }),
  };
}

function createManagerHarness() {
  const uploader = {} as WebGpuGaussianBufferUploader;
  const resources: WebGpuGaussianSceneResources[] = [];
  const createBufferUploader = vi.fn(() => uploader);
  const uploadResources = vi.fn((
    _uploader: WebGpuGaussianBufferUploader,
    _cloud: GaussianCloud,
    options?: { labelPrefix?: string }
  ) => {
    const resource = createFakeResources(options?.labelPrefix ?? 'scene');
    resources.push(resource);
    return resource;
  });

  return {
    manager: new GaussianSceneResourceManager({
      createBufferUploader,
      uploadResources,
    }),
    createBufferUploader,
    uploadResources,
    resources,
  };
}

describe('GaussianSceneResourceManager', () => {
  it('shares one uploaded scene for repeated acquires on the same device and scene id', () => {
    const device = makeDevice('gpu-a');
    const cloud = makeCloud();
    const { manager, createBufferUploader, uploadResources, resources } = createManagerHarness();

    const firstRef = manager.acquire(device, { sceneId: 'bicycle', cloud });
    const secondRef = manager.acquire(device, { sceneId: 'bicycle', cloud });

    expect(createBufferUploader).toHaveBeenCalledTimes(1);
    expect(uploadResources).toHaveBeenCalledTimes(1);
    expect(firstRef.gaussianBuffer).toBe(secondRef.gaussianBuffer);
    expect(firstRef.shBuffer).toBe(secondRef.shBuffer);
    expect(manager.getRefCount(device, 'bicycle')).toBe(2);

    firstRef.release();
    expect(manager.getRefCount(device, 'bicycle')).toBe(1);
    expect(resources[0].dispose).not.toHaveBeenCalled();

    secondRef.release();
    secondRef.release();
    expect(manager.getRefCount(device, 'bicycle')).toBe(0);
    expect(resources[0].dispose).toHaveBeenCalledTimes(1);
    expect(resources[0].gaussianBuffer.destroy).toHaveBeenCalledTimes(1);
    expect(resources[0].shBuffer.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not share GPU buffers across devices even when scene ids match', () => {
    const cloud = makeCloud();
    const deviceA = makeDevice('gpu-a');
    const deviceB = makeDevice('gpu-b');
    const { manager, uploadResources } = createManagerHarness();

    const refA = manager.acquire(deviceA, { sceneId: 'shared-scene', cloud });
    const refB = manager.acquire(deviceB, { sceneId: 'shared-scene', cloud });

    expect(uploadResources).toHaveBeenCalledTimes(2);
    expect(refA.gaussianBuffer).not.toBe(refB.gaussianBuffer);
    expect(manager.getRefCount(deviceA, 'shared-scene')).toBe(1);
    expect(manager.getRefCount(deviceB, 'shared-scene')).toBe(1);

    refA.release();
    expect(manager.getRefCount(deviceA, 'shared-scene')).toBe(0);
    expect(manager.getRefCount(deviceB, 'shared-scene')).toBe(1);

    refB.release();
    expect(manager.getRefCount(deviceB, 'shared-scene')).toBe(0);
  });

  it('clears all resources for a device and keeps old refs idempotent', () => {
    const device = makeDevice('gpu-a');
    const cloud = makeCloud();
    const { manager, resources } = createManagerHarness();

    const firstRef = manager.acquire(device, { sceneId: 'scene-a', cloud });
    const secondRef = manager.acquire(device, { sceneId: 'scene-b', cloud });

    manager.clearDevice(device);
    expect(manager.getRefCount(device, 'scene-a')).toBe(0);
    expect(manager.getRefCount(device, 'scene-b')).toBe(0);
    expect(resources[0].dispose).toHaveBeenCalledTimes(1);
    expect(resources[1].dispose).toHaveBeenCalledTimes(1);

    firstRef.release();
    secondRef.release();
    expect(resources[0].dispose).toHaveBeenCalledTimes(1);
    expect(resources[1].dispose).toHaveBeenCalledTimes(1);
  });

  it('does not cache failed uploads', () => {
    const device = makeDevice('gpu-a');
    const cloud = makeCloud();
    const uploader = {} as WebGpuGaussianBufferUploader;
    const uploadResources = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error('upload failed');
      })
      .mockImplementationOnce(() => createFakeResources('retry'));
    const manager = new GaussianSceneResourceManager({
      createBufferUploader: vi.fn(() => uploader),
      uploadResources,
    });

    expect(() => manager.acquire(device, { sceneId: 'scene', cloud }))
      .toThrow('upload failed');
    expect(manager.getRefCount(device, 'scene')).toBe(0);

    const retryRef = manager.acquire(device, { sceneId: 'scene', cloud });
    expect(uploadResources).toHaveBeenCalledTimes(2);
    expect(manager.getRefCount(device, 'scene')).toBe(1);

    retryRef.release();
  });

  it('rejects large clouds before uploading when the device has low storage-binding limits', () => {
    const device = {
      label: 'low-limit-gpu',
      limits: {
        maxBufferSize: 268_435_456,
        maxStorageBufferBindingSize: 134_217_728,
      } as GPUSupportedLimits,
    } as unknown as GPUDevice;
    const { manager, createBufferUploader, uploadResources } = createManagerHarness();

    expect(() => manager.acquire(device, {
      sceneId: 'large-scene',
      cloud: makeCloud({
        count: 5_000_000,
        shDegree: 3,
      }),
    })).toThrow(
      'WebGPU device maxBufferSize 268435456 is below required 900000000 bytes'
    );

    expect(createBufferUploader).not.toHaveBeenCalled();
    expect(uploadResources).not.toHaveBeenCalled();
    expect(manager.getRefCount(device, 'large-scene')).toBe(0);
  });

  it('requires stable non-empty scene ids', () => {
    const device = makeDevice('gpu-a');
    const { manager, uploadResources } = createManagerHarness();

    expect(() => manager.acquire(device, { sceneId: '   ', cloud: makeCloud() }))
      .toThrow('Gaussian scene resource requires a non-empty sceneId');
    expect(uploadResources).not.toHaveBeenCalled();
  });
});
