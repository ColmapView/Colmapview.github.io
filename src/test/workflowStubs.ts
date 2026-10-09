import { vi } from 'vitest';
import type { Camera, Image, Point3D } from '../types/colmap';
import { buildReconstruction } from './builders';
import { noopLogger } from '../utils/logger';

export function emptyParseResult() {
  return { cameras: new Map<number, Camera>(), images: new Map<number, Image>(),
    points3D: new Map<bigint, Point3D>(), wasmWrapper: null, usedWasmPath: false };
}

/** Fresh overrides for the real workflow when a test stubs parsing and reconstruction. */
export function stubbedParsing() {
  return { logger: noopLogger, clearCaches: vi.fn(), delay: async () => {},
    shouldPreloadSplatRuntime: () => false, parseFiles: async () => emptyParseResult(),
    buildReconstruction: async () => ({ reconstruction: buildReconstruction(), pointCount: 0 }) };
}
