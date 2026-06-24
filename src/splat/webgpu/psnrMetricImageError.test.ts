import { describe, it, expect } from 'vitest';
import {
  PsnrMetricImageDimensionMismatchError,
  isPsnrMetricImageDimensionMismatchError,
} from './psnrMetricImageError';

describe('isPsnrMetricImageDimensionMismatchError', () => {
  it('detects the typed error', () => {
    expect(
      isPsnrMetricImageDimensionMismatchError(new PsnrMetricImageDimensionMismatchError('x'))
    ).toBe(true);
  });

  it('detects an error that lost its class but kept the marker flag (worker boundary)', () => {
    const cloned = { name: 'Error', message: 'whatever', isPsnrMetricImageDimensionMismatch: true };
    expect(isPsnrMetricImageDimensionMismatchError(cloned)).toBe(true);
  });

  it('detects a plain Error by the stable message phrase', () => {
    const plain = new Error(
      'WebGPU PSNR requires an undistorted metric image matching the PINHOLE camera for 0.jpg: decoded 5568x4176, camera is 5456x4082.'
    );
    expect(isPsnrMetricImageDimensionMismatchError(plain)).toBe(true);
  });

  it('does not match unrelated errors or non-errors', () => {
    expect(
      isPsnrMetricImageDimensionMismatchError(new Error('maxStorageBufferBindingSize is below required size'))
    ).toBe(false);
    expect(isPsnrMetricImageDimensionMismatchError('a string')).toBe(false);
    expect(isPsnrMetricImageDimensionMismatchError(null)).toBe(false);
    expect(isPsnrMetricImageDimensionMismatchError(undefined)).toBe(false);
  });
});
