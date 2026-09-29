import { describe, expect, it } from 'vitest';
import { decodeGaussianCloudBuffer } from './gaussianCloudDecode';
import type { GaussianCloudFormat } from './gaussianCloud';

describe('worker-side Gaussian cloud decode dispatch', () => {
  it('refuses a format it cannot decode instead of treating it as PLY', () => {
    expect(() => decodeGaussianCloudBuffer('sog' as GaussianCloudFormat, new ArrayBuffer(8)))
      .toThrow('Unsupported Gaussian splat format: sog');
  });
});
