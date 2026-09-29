import { loadPLYFromBuffer, loadSPZFromBuffer } from 'gs-toolbox';
import type { GaussianCloud, GaussianCloudFormat } from './gaussianCloud';

/** Decode dispatch for the worker; an unknown format must never fall through to the PLY parser. */
export function decodeGaussianCloudBuffer(format: GaussianCloudFormat, buffer: ArrayBuffer): GaussianCloud {
  switch (format) {
    case 'spz':
      return loadSPZFromBuffer(buffer);
    case 'ply':
      return loadPLYFromBuffer(buffer);
    default:
      throw new Error(`Unsupported Gaussian splat format: ${String(format)}`);
  }
}
