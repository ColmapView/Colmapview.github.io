import type { GaussianCloud } from '../gaussianCloud';
import type { WebGpuGaussianCloudBounds } from './gaussianCloudPacking';
import {
  createGpuDeviceBufferUploader,
  uploadWebGpuGaussianSceneResourcesAsync,
  uploadWebGpuGaussianSceneResources,
  type WebGpuGaussianBufferUploader,
  type WebGpuGaussianSceneResources,
  type WebGpuGaussianSceneUploadAsyncOptions,
  type WebGpuUploadedBuffer,
} from './gaussianSceneResources';
import {
  assertWebGpuDeviceMeetsSplatRequiredLimits,
  getWebGpuSplatRequiredLimitsForCloud,
} from './webGpuSplatLimits';

export interface GaussianSceneResource {
  sceneId: string;
  cloud: GaussianCloud;
  labelPrefix?: string;
}

export interface GpuGaussianSceneRef {
  sceneId: string;
  device: GPUDevice;
  count: number;
  shDegree: number;
  bounds: WebGpuGaussianCloudBounds;
  gaussianBuffer: WebGpuUploadedBuffer;
  shBuffer: WebGpuUploadedBuffer;
  gaussianByteLength: number;
  shByteLength: number;
  release: () => void;
}

export interface GaussianSceneResourceManagerDeps {
  createBufferUploader?: (device: GPUDevice) => WebGpuGaussianBufferUploader;
  uploadResources?: (
    uploader: WebGpuGaussianBufferUploader,
    cloud: GaussianCloud,
    options?: { labelPrefix?: string }
  ) => WebGpuGaussianSceneResources;
}

interface ResourceEntry {
  resources: WebGpuGaussianSceneResources;
  refCount: number;
  disposed: boolean;
}

export class GaussianSceneResourceManager {
  private readonly createBufferUploader: NonNullable<GaussianSceneResourceManagerDeps['createBufferUploader']>;
  private readonly uploadResources: NonNullable<GaussianSceneResourceManagerDeps['uploadResources']>;
  private readonly entriesByDevice = new Map<GPUDevice, Map<string, ResourceEntry>>();

  constructor(deps: GaussianSceneResourceManagerDeps = {}) {
    this.createBufferUploader = deps.createBufferUploader ?? createGpuDeviceBufferUploader;
    this.uploadResources = deps.uploadResources ?? uploadWebGpuGaussianSceneResources;
  }

  acquire(device: GPUDevice, resource: GaussianSceneResource): GpuGaussianSceneRef {
    const sceneId = requireSceneId(resource.sceneId);
    let entries = this.entriesByDevice.get(device);
    if (!entries) {
      entries = new Map();
      this.entriesByDevice.set(device, entries);
    }

    let entry = entries.get(sceneId);
    if (!entry) {
      assertWebGpuDeviceMeetsSplatRequiredLimits(
        device,
        getWebGpuSplatRequiredLimitsForCloud(resource.cloud)
      );
      const uploader = this.createBufferUploader(device);
      const resources = this.uploadResources(uploader, resource.cloud, {
        labelPrefix: resource.labelPrefix ?? sceneId,
      });
      entry = {
        resources,
        refCount: 0,
        disposed: false,
      };
      entries.set(sceneId, entry);
    }

    entry.refCount += 1;
    return this.createSceneRef(device, sceneId, entry);
  }

  async acquireAsync(
    device: GPUDevice,
    resource: GaussianSceneResource,
    options: WebGpuGaussianSceneUploadAsyncOptions = {}
  ): Promise<GpuGaussianSceneRef> {
    const sceneId = requireSceneId(resource.sceneId);
    let entries = this.entriesByDevice.get(device);
    if (!entries) {
      entries = new Map();
      this.entriesByDevice.set(device, entries);
    }

    let entry = entries.get(sceneId);
    if (!entry) {
      assertWebGpuDeviceMeetsSplatRequiredLimits(
        device,
        getWebGpuSplatRequiredLimitsForCloud(resource.cloud)
      );
      const uploader = this.createBufferUploader(device);
      const resources = await uploadWebGpuGaussianSceneResourcesAsync(uploader, resource.cloud, {
        ...options,
        labelPrefix: options.labelPrefix ?? resource.labelPrefix ?? sceneId,
      });
      entry = {
        resources,
        refCount: 0,
        disposed: false,
      };
      entries.set(sceneId, entry);
    }

    entry.refCount += 1;
    return this.createSceneRef(device, sceneId, entry);
  }

  getRefCount(device: GPUDevice, sceneId: string): number {
    return this.entriesByDevice.get(device)?.get(sceneId)?.refCount ?? 0;
  }

  clearDevice(device: GPUDevice): void {
    const entries = this.entriesByDevice.get(device);
    if (!entries) return;

    for (const entry of entries.values()) {
      this.disposeEntry(entry);
    }
    this.entriesByDevice.delete(device);
  }

  dispose(): void {
    for (const device of this.entriesByDevice.keys()) {
      this.clearDevice(device);
    }
  }

  private createSceneRef(
    device: GPUDevice,
    sceneId: string,
    entry: ResourceEntry
  ): GpuGaussianSceneRef {
    let released = false;
    const { resources } = entry;
    return {
      sceneId,
      device,
      count: resources.count,
      shDegree: resources.shDegree,
      bounds: resources.bounds,
      gaussianBuffer: resources.gaussianBuffer,
      shBuffer: resources.shBuffer,
      gaussianByteLength: resources.gaussianByteLength,
      shByteLength: resources.shByteLength,
      release: () => {
        if (released) return;
        released = true;
        this.releaseEntry(device, sceneId, entry);
      },
    };
  }

  private releaseEntry(device: GPUDevice, sceneId: string, entry: ResourceEntry): void {
    if (entry.disposed) return;

    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount > 0) return;

    this.disposeEntry(entry);
    const entries = this.entriesByDevice.get(device);
    entries?.delete(sceneId);
    if (entries?.size === 0) {
      this.entriesByDevice.delete(device);
    }
  }

  private disposeEntry(entry: ResourceEntry): void {
    if (entry.disposed) return;

    entry.disposed = true;
    entry.refCount = 0;
    entry.resources.dispose();
  }
}

function requireSceneId(sceneId: string): string {
  const trimmed = sceneId.trim();
  if (!trimmed) {
    throw new Error('Gaussian scene resource requires a non-empty sceneId');
  }
  return trimmed;
}
