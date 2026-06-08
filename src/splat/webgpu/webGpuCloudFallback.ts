import {
  createSh0OnlyGaussianCloud,
  type GaussianCloud,
} from '../gaussianCloud';
import {
  cachePackedWebGpuGaussianCloud,
  getCachedPackedWebGpuGaussianCloud,
} from './gaussianCloudPacking';

const WEBGPU_SH_RETRY_ERROR_PATTERN = /binding size|buffer size|exceeds.*limit|limit.*exceed|maxBufferSize|maxStorageBufferBindingSize|required.*limit|storage buffer|validation/i;

export function createWebGpuSh0FallbackCloud(cloud: GaussianCloud): GaussianCloud {
  return createSh0OnlyGaussianCloud(cloud);
}

export function createCachedWebGpuSh0FallbackCloud(cloud: GaussianCloud): GaussianCloud {
  const fallbackCloud = createWebGpuSh0FallbackCloud(cloud);
  if (fallbackCloud === cloud) {
    return fallbackCloud;
  }

  const packed = getCachedPackedWebGpuGaussianCloud(cloud);
  if (!packed) {
    return fallbackCloud;
  }

  cachePackedWebGpuGaussianCloud(fallbackCloud, {
    count: fallbackCloud.count,
    shDegree: 0,
    gaussianData: packed.gaussianData,
    shData: null,
    bounds: packed.bounds,
  });
  return fallbackCloud;
}

export function shouldRetryWebGpuCloudWithSh0(error: unknown, cloud: GaussianCloud): boolean {
  if (cloud.shDegree <= 0) {
    return false;
  }

  return WEBGPU_SH_RETRY_ERROR_PATTERN.test(getWebGpuCloudFallbackErrorMessage(error));
}

export function getWebGpuCloudFallbackErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
