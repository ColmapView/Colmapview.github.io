import { validateGaussianCloud, type GaussianCloud } from '../gaussianCloud';

export const WEBGPU_GAUSSIAN_STRIDE_FLOATS = 16;
export const WEBGPU_GAUSSIAN_STRIDE_BYTES = WEBGPU_GAUSSIAN_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT;

export type Vec3Tuple = [number, number, number];

export interface WebGpuGaussianCloudBounds {
  min: Vec3Tuple;
  max: Vec3Tuple;
  center: Vec3Tuple;
  size: number;
}

export interface PackedWebGpuGaussianCloud {
  count: number;
  shDegree: number;
  gaussianData: Float32Array;
  shData: Float32Array | null;
  bounds: WebGpuGaussianCloudBounds;
}

let packedGaussianCloudCache = new WeakMap<GaussianCloud, PackedWebGpuGaussianCloud>();

export function packGaussianCloudForWebGpu(cloud: GaussianCloud): Float32Array {
  validateGaussianCloud(cloud);

  const gaussianData = new Float32Array(cloud.count * WEBGPU_GAUSSIAN_STRIDE_FLOATS);
  for (let i = 0; i < cloud.count; i++) {
    const offset = i * WEBGPU_GAUSSIAN_STRIDE_FLOATS;
    gaussianData[offset + 0] = cloud.positions[i * 3];
    gaussianData[offset + 1] = cloud.positions[i * 3 + 1];
    gaussianData[offset + 2] = cloud.positions[i * 3 + 2];
    gaussianData[offset + 3] = cloud.opacities[i];
    gaussianData[offset + 4] = cloud.scales[i * 3];
    gaussianData[offset + 5] = cloud.scales[i * 3 + 1];
    gaussianData[offset + 6] = cloud.scales[i * 3 + 2];
    gaussianData[offset + 7] = 0;
    gaussianData[offset + 8] = cloud.rotations[i * 4];
    gaussianData[offset + 9] = cloud.rotations[i * 4 + 1];
    gaussianData[offset + 10] = cloud.rotations[i * 4 + 2];
    gaussianData[offset + 11] = cloud.rotations[i * 4 + 3];
    gaussianData[offset + 12] = cloud.sh0[i * 3];
    gaussianData[offset + 13] = cloud.sh0[i * 3 + 1];
    gaussianData[offset + 14] = cloud.sh0[i * 3 + 2];
    gaussianData[offset + 15] = 0;
  }

  return gaussianData;
}

export function computeGaussianCloudBounds(cloud: GaussianCloud): WebGpuGaussianCloudBounds {
  validateGaussianCloud(cloud);

  if (cloud.count === 0) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
      center: [0, 0, 0],
      size: 1,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < cloud.count; i++) {
    const x = requireFinitePosition(cloud.positions[i * 3], i, 'x');
    const y = requireFinitePosition(cloud.positions[i * 3 + 1], i, 'y');
    const z = requireFinitePosition(cloud.positions[i * 3 + 2], i, 'z');
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2,
    ],
    size: Number.isFinite(size) && size > 0 ? size : 1,
  };
}

export function createPackedWebGpuGaussianCloud(cloud: GaussianCloud): PackedWebGpuGaussianCloud {
  const cached = packedGaussianCloudCache.get(cloud);
  if (cached) {
    return cached;
  }

  validateGaussianCloud(cloud);
  const shData = getHigherOrderShData(cloud);
  const { gaussianData, bounds } = packGaussianCloudForWebGpuWithBounds(cloud);

  const packed = {
    count: cloud.count,
    shDegree: cloud.shDegree,
    gaussianData,
    shData,
    bounds,
  };
  packedGaussianCloudCache.set(cloud, packed);
  return packed;
}

export function getCachedPackedWebGpuGaussianCloud(cloud: GaussianCloud): PackedWebGpuGaussianCloud | null {
  return packedGaussianCloudCache.get(cloud) ?? null;
}

export function cachePackedWebGpuGaussianCloud(
  cloud: GaussianCloud,
  packed: PackedWebGpuGaussianCloud
): void {
  validatePackedWebGpuGaussianCloud(cloud, packed);
  packedGaussianCloudCache.set(cloud, packed);
}

function validatePackedWebGpuGaussianCloud(
  cloud: GaussianCloud,
  packed: PackedWebGpuGaussianCloud
): void {
  validateGaussianCloud(cloud);
  if (packed.count !== cloud.count || packed.shDegree !== cloud.shDegree) {
    throw new Error('Packed WebGPU Gaussian cloud does not match decoded cloud metadata');
  }

  const expectedGaussianBytes = cloud.count * WEBGPU_GAUSSIAN_STRIDE_BYTES;
  if (!(packed.gaussianData instanceof Float32Array) || packed.gaussianData.byteLength !== expectedGaussianBytes) {
    throw new Error(
      `Packed WebGPU Gaussian data length does not match decoded cloud: expected ${expectedGaussianBytes} bytes, got ${packed.gaussianData?.byteLength ?? 'missing'}`
    );
  }

  const expectedShBytes = getHigherOrderShData(cloud)?.byteLength ?? 0;
  const actualShBytes = packed.shData?.byteLength ?? 0;
  if (actualShBytes !== expectedShBytes) {
    throw new Error(
      `Packed WebGPU SH data length does not match decoded cloud: expected ${expectedShBytes} bytes, got ${actualShBytes}`
    );
  }
}

function getHigherOrderShData(cloud: GaussianCloud): Float32Array | null {
  if (cloud.shDegree <= 0) {
    return null;
  }

  if (!cloud.shN) {
    throw new Error(`Invalid Gaussian cloud shN: required for SH degree ${cloud.shDegree}`);
  }

  return cloud.shN;
}

function packGaussianCloudForWebGpuWithBounds(cloud: GaussianCloud): {
  gaussianData: Float32Array;
  bounds: WebGpuGaussianCloudBounds;
} {
  const gaussianData = new Float32Array(cloud.count * WEBGPU_GAUSSIAN_STRIDE_FLOATS);
  if (cloud.count === 0) {
    return {
      gaussianData,
      bounds: createEmptyBounds(),
    };
  }

  const { positions, scales, rotations, opacities, sh0 } = cloud;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < cloud.count; i++) {
    const positionOffset = i * 3;
    const rotationOffset = i * 4;
    const outputOffset = i * WEBGPU_GAUSSIAN_STRIDE_FLOATS;
    const x = requireFinitePosition(positions[positionOffset], i, 'x');
    const y = requireFinitePosition(positions[positionOffset + 1], i, 'y');
    const z = requireFinitePosition(positions[positionOffset + 2], i, 'z');

    gaussianData[outputOffset + 0] = x;
    gaussianData[outputOffset + 1] = y;
    gaussianData[outputOffset + 2] = z;
    gaussianData[outputOffset + 3] = opacities[i];
    gaussianData[outputOffset + 4] = scales[positionOffset];
    gaussianData[outputOffset + 5] = scales[positionOffset + 1];
    gaussianData[outputOffset + 6] = scales[positionOffset + 2];
    gaussianData[outputOffset + 7] = 0;
    gaussianData[outputOffset + 8] = rotations[rotationOffset];
    gaussianData[outputOffset + 9] = rotations[rotationOffset + 1];
    gaussianData[outputOffset + 10] = rotations[rotationOffset + 2];
    gaussianData[outputOffset + 11] = rotations[rotationOffset + 3];
    gaussianData[outputOffset + 12] = sh0[positionOffset];
    gaussianData[outputOffset + 13] = sh0[positionOffset + 1];
    gaussianData[outputOffset + 14] = sh0[positionOffset + 2];
    gaussianData[outputOffset + 15] = 0;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  return {
    gaussianData,
    bounds: createBoundsFromMinMax(minX, minY, minZ, maxX, maxY, maxZ),
  };
}

function createEmptyBounds(): WebGpuGaussianCloudBounds {
  return {
    min: [0, 0, 0],
    max: [0, 0, 0],
    center: [0, 0, 0],
    size: 1,
  };
}

function createBoundsFromMinMax(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number
): WebGpuGaussianCloudBounds {
  const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2,
    ],
    size: Number.isFinite(size) && size > 0 ? size : 1,
  };
}

export function clearPackedWebGpuGaussianCloudCacheForTests(): void {
  packedGaussianCloudCache = new WeakMap<GaussianCloud, PackedWebGpuGaussianCloud>();
}

function requireFinitePosition(value: number, index: number, axis: 'x' | 'y' | 'z'): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid Gaussian cloud position ${axis} at index ${index}: expected finite number`);
  }
  return value;
}
