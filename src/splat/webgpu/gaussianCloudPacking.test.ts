import { beforeEach, describe, expect, it } from 'vitest';
import type { GaussianCloud } from '../gaussianCloud';
import {
  clearPackedWebGpuGaussianCloudCacheForTests,
  computeGaussianCloudBounds,
  createPackedWebGpuGaussianCloud,
  packGaussianCloudForWebGpu,
  WEBGPU_GAUSSIAN_STRIDE_BYTES,
  WEBGPU_GAUSSIAN_STRIDE_FLOATS,
} from './gaussianCloudPacking';

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

describe('WebGPU Gaussian cloud packing', () => {
  beforeEach(() => {
    clearPackedWebGpuGaussianCloudCacheForTests();
  });

  it('packs Gaussian data into the renderer 16-float layout', () => {
    const packed = packGaussianCloudForWebGpu(makeCloud());

    expect(WEBGPU_GAUSSIAN_STRIDE_FLOATS).toBe(16);
    expect(WEBGPU_GAUSSIAN_STRIDE_BYTES).toBe(64);
    expect(packed).toEqual(new Float32Array([
      1, 2, 3, 0.25,
      0.1, 0.2, 0.3, 0,
      1, 0, 0, 0,
      0.01, 0.02, 0.03, 0,
      -4, 5, -6, 0.75,
      1.1, 1.2, 1.3, 0,
      0.5, 0.5, 0.5, 0.5,
      0.11, 0.12, 0.13, 0,
    ]));
  });

  it('computes finite bounds with renderer-compatible empty-scene defaults', () => {
    expect(computeGaussianCloudBounds(makeCloud())).toEqual({
      min: [-4, 2, -6],
      max: [1, 5, 3],
      center: [-1.5, 3.5, -1.5],
      size: 9,
    });

    expect(computeGaussianCloudBounds(makeCloud({
      count: 0,
      positions: new Float32Array(),
      scales: new Float32Array(),
      rotations: new Float32Array(),
      opacities: new Float32Array(),
      sh0: new Float32Array(),
    }))).toEqual({
      min: [0, 0, 0],
      max: [0, 0, 0],
      center: [0, 0, 0],
      size: 1,
    });
  });

  it('creates a complete packed payload and reuses immutable higher-order SH data', () => {
    const shN = new Float32Array(18).fill(0.4);
    const cloud = makeCloud({
      shDegree: 1,
      shN,
    });
    const payload = createPackedWebGpuGaussianCloud(cloud);
    const cached = createPackedWebGpuGaussianCloud(cloud);

    expect(payload.count).toBe(2);
    expect(payload.shDegree).toBe(1);
    expect(payload.gaussianData.length).toBe(2 * WEBGPU_GAUSSIAN_STRIDE_FLOATS);
    expect(payload.gaussianData).toEqual(packGaussianCloudForWebGpu(cloud));
    expect(payload.bounds).toEqual(computeGaussianCloudBounds(cloud));
    expect(payload.shData).toBe(shN);
    expect(cached).toBe(payload);
  });

  it('rejects non-finite positions before they can corrupt renderer bounds', () => {
    expect(() => computeGaussianCloudBounds(makeCloud({
      positions: new Float32Array([
        1, Number.NaN, 3,
        -4, 5, -6,
      ]),
    }))).toThrow('Invalid Gaussian cloud position y at index 0: expected finite number');
    expect(() => createPackedWebGpuGaussianCloud(makeCloud({
      positions: new Float32Array([
        1, Number.NaN, 3,
        -4, 5, -6,
      ]),
    }))).toThrow('Invalid Gaussian cloud position y at index 0: expected finite number');
  });
});
