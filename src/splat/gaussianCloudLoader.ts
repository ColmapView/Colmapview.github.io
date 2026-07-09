import {
  loadPLYFromBuffer as defaultLoadPLYFromBuffer,
  loadSPZFromBuffer as defaultLoadSPZFromBuffer,
} from 'gs-toolbox';
import { getSplatFileExtension } from '../utils/splatFilePolicy';
import {
  validateGaussianCloud,
  type GaussianCloud,
  type GaussianCloudFormat,
  type LoadedGaussianCloud,
} from './gaussianCloud';
import {
  cachePackedWebGpuGaussianCloud,
  type PackedWebGpuGaussianCloud,
} from './webgpu/gaussianCloudPacking';
import type {
  GaussianCloudWorkerDecodeRequest,
  GaussianCloudWorkerResponse,
} from './gaussianCloudLoaderWorkerProtocol';
import {
  getWebGpuSplatTelemetryElapsedMs,
  nowWebGpuSplatTelemetryMs,
  recordWebGpuSplatTelemetryEvent,
} from './webgpu/webGpuSplatTelemetry';

export type GaussianCloudLoadProgress =
  | {
      phase: 'reading';
      loadedBytes: number;
      totalBytes: number;
    }
  | {
      phase: 'decoding' | 'packing';
    }
  | {
      phase: 'decoded';
      byteLength: number;
      count: number;
      shDegree: number;
    };

export interface GaussianCloudLoaderDeps {
  loadPLYFromBuffer?: (buffer: ArrayBuffer) => GaussianCloud;
  loadSPZFromBuffer?: (buffer: ArrayBuffer) => GaussianCloud;
  createWorker?: (() => Worker | null) | null;
  onProgress?: (progress: GaussianCloudLoadProgress) => void;
}

let gaussianCloudLoadCache = new WeakMap<File, Promise<LoadedGaussianCloud>>();
let nextWorkerRequestId = 1;

export function getGaussianCloudFormatForFile(file: File): GaussianCloudFormat {
  const extension = getSplatFileExtension(file.name);
  switch (extension) {
    case '.spz':
      return 'spz';
    case '.ply':
      return 'ply';
    default:
      throw new Error(`Unsupported Gaussian splat format: ${file.name}`);
  }
}

export function isGaussianCloudFile(file: File): boolean {
  try {
    getGaussianCloudFormatForFile(file);
    return true;
  } catch {
    return false;
  }
}

export async function loadGaussianCloudFromFile(
  file: File,
  deps: GaussianCloudLoaderDeps = {}
): Promise<LoadedGaussianCloud> {
  if (shouldUseGaussianCloudLoadCache(deps)) {
    const cached = gaussianCloudLoadCache.get(file);
    if (cached) {
      return cached.then((loaded) => {
        deps.onProgress?.({
          phase: 'decoded',
          byteLength: loaded.byteLength,
          count: loaded.cloud.count,
          shDegree: loaded.cloud.shDegree,
        });
        return loaded;
      });
    }

    const loaded = loadGaussianCloudFromFileUncached(file, deps)
      .catch((error: unknown) => {
        if (gaussianCloudLoadCache.get(file) === loaded) {
          gaussianCloudLoadCache.delete(file);
        }
        throw error;
      });
    gaussianCloudLoadCache.set(file, loaded);
    return loaded;
  }

  return loadGaussianCloudFromFileUncached(file, deps);
}

export function clearGaussianCloudLoadCacheForTests(): void {
  gaussianCloudLoadCache = new WeakMap<File, Promise<LoadedGaussianCloud>>();
}

/**
 * Pre-populate the File-keyed decode cache with an already-decoded (or in-flight)
 * cloud. Lets a caller decode bytes up front (see loadGaussianCloudFromBytes) and
 * hand the renderer a guaranteed cache hit under a placeholder File, so the later
 * loadGaussianCloudFromFile(file) never re-reads or re-decodes bytes.
 */
export function seedGaussianCloudLoad(
  file: File,
  loaded: Promise<LoadedGaussianCloud>
): void {
  gaussianCloudLoadCache.set(file, loaded);
}

/**
 * Decode Gaussian cloud bytes that are already in memory, bypassing the File read
 * (and its 'reading' progress). This is the post-read tail of
 * loadGaussianCloudFromFileUncached: telemetry start, 'decoding' progress,
 * worker-or-sync decode with buffer transfer, packing, and telemetry. It is not
 * cached because no File key exists; a caller that wants renderer cache hits should
 * seed the result with seedGaussianCloudLoad(placeholderFile, result).
 */
export async function loadGaussianCloudFromBytes(
  buffer: ArrayBuffer,
  format: GaussianCloudFormat,
  deps: GaussianCloudLoaderDeps = {}
): Promise<LoadedGaussianCloud> {
  return decodeLoadedGaussianCloudFromBytes(buffer, format, deps, {
    telemetryStart: nowWebGpuSplatTelemetryMs(),
    // No source File exists on the bytes entry; use an empty placeholder so the
    // returned LoadedGaussianCloud stays well-typed. Callers that need a named File
    // (e.g. to seed the cache) supply their own placeholder via seedGaussianCloudLoad.
    file: new File([], ''),
  });
}

async function loadGaussianCloudFromFileUncached(
  file: File,
  deps: GaussianCloudLoaderDeps
): Promise<LoadedGaussianCloud> {
  const telemetryStart = nowWebGpuSplatTelemetryMs();
  const format = getGaussianCloudFormatForFile(file);
  deps.onProgress?.({
    phase: 'reading',
    loadedBytes: 0,
    totalBytes: file.size,
  });
  const buffer = await readFileAsArrayBuffer(file, (loadedBytes, totalBytes) => {
    deps.onProgress?.({
      phase: 'reading',
      loadedBytes,
      totalBytes,
    });
  });
  const byteLength = buffer.byteLength;
  deps.onProgress?.({
    phase: 'reading',
    loadedBytes: byteLength,
    totalBytes: byteLength,
  });
  return decodeLoadedGaussianCloudFromBytes(buffer, format, deps, {
    telemetryStart,
    file,
  });
}

async function decodeLoadedGaussianCloudFromBytes(
  buffer: ArrayBuffer,
  format: GaussianCloudFormat,
  deps: GaussianCloudLoaderDeps,
  context: { telemetryStart: number; file: File }
): Promise<LoadedGaussianCloud> {
  const { telemetryStart, file } = context;
  const byteLength = buffer.byteLength;
  deps.onProgress?.({ phase: 'decoding' });
  const loaded = await decodeGaussianCloud(format, buffer, deps);
  const cloud = loaded.cloud;

  validateGaussianCloud(cloud);
  if (loaded.packed) {
    cachePackedWebGpuGaussianCloud(cloud, loaded.packed);
  }
  recordWebGpuSplatTelemetryEvent({
    name: 'gaussian-decode',
    durationMs: getWebGpuSplatTelemetryElapsedMs(telemetryStart),
    bytes: byteLength,
    details: {
      fileName: file.name,
      format,
      count: cloud.count,
      shDegree: cloud.shDegree,
    },
  });
  deps.onProgress?.({
    phase: 'decoded',
    byteLength,
    count: cloud.count,
    shDegree: cloud.shDegree,
  });
  return {
    file,
    format,
    byteLength,
    cloud,
  };
}

function shouldUseGaussianCloudLoadCache(deps: GaussianCloudLoaderDeps): boolean {
  return deps.loadPLYFromBuffer === undefined
    && deps.loadSPZFromBuffer === undefined
    && deps.createWorker === undefined;
}

async function decodeGaussianCloud(
  format: GaussianCloudFormat,
  buffer: ArrayBuffer,
  deps: GaussianCloudLoaderDeps
): Promise<{ cloud: GaussianCloud; packed: PackedWebGpuGaussianCloud | null }> {
  if (deps.loadPLYFromBuffer || deps.loadSPZFromBuffer) {
    return {
      cloud: await decodeGaussianCloudInProcess(format, buffer, deps),
      packed: null,
    };
  }

  const workerFactory = deps.createWorker === undefined
    ? createDefaultGaussianCloudLoaderWorker
    : deps.createWorker;
  const worker = workerFactory?.();
  if (!worker) {
    return {
      cloud: await decodeGaussianCloudInProcess(format, buffer, deps),
      packed: null,
    };
  }

  return decodeGaussianCloudInWorker(worker, format, buffer, deps.onProgress);
}

async function decodeGaussianCloudInProcess(
  format: GaussianCloudFormat,
  buffer: ArrayBuffer,
  deps: GaussianCloudLoaderDeps
): Promise<GaussianCloud> {
  switch (format) {
    case 'spz':
      return (deps.loadSPZFromBuffer ?? defaultLoadSPZFromBuffer)(buffer);
    case 'ply':
      return (deps.loadPLYFromBuffer ?? defaultLoadPLYFromBuffer)(buffer);
  }
}

function createDefaultGaussianCloudLoaderWorker(): Worker | null {
  if (typeof Worker !== 'function') {
    return null;
  }

  try {
    return new Worker(new URL('./gaussianCloudLoader.worker.ts', import.meta.url), {
      type: 'module',
      name: 'gaussian-cloud-loader',
    });
  } catch {
    return null;
  }
}

function decodeGaussianCloudInWorker(
  worker: Worker,
  format: GaussianCloudFormat,
  buffer: ArrayBuffer,
  onProgress?: GaussianCloudLoaderDeps['onProgress']
): Promise<{ cloud: GaussianCloud; packed: PackedWebGpuGaussianCloud }> {
  const id = nextWorkerRequestId++;
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    worker.onmessage = (event: MessageEvent<GaussianCloudWorkerResponse>) => {
      const response = event.data;
      if (response.id !== id) {
        return;
      }

      if (response.type === 'loaded') {
        settle(() => resolve({
          cloud: response.cloud,
          packed: response.packed,
        }));
        return;
      }

      if (response.type === 'progress') {
        onProgress?.({ phase: response.phase });
        return;
      }

      settle(() => {
        const error = new Error(response.message);
        if (response.stack) {
          error.stack = response.stack;
        }
        reject(error);
      });
    };
    worker.onerror = (event) => {
      settle(() => reject(new Error(event.message || 'Gaussian cloud worker failed')));
    };

    const request: GaussianCloudWorkerDecodeRequest = {
      type: 'decode',
      id,
      format,
      buffer,
    };
    worker.postMessage(request, [buffer]);
  });
}

function readFileAsArrayBuffer(
  file: File,
  onProgress?: (loadedBytes: number, totalBytes: number) => void
): Promise<ArrayBuffer> {
  if (!onProgress && typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }

  if (typeof FileReader !== 'function') {
    return file.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.onprogress = (event) => {
      onProgress?.(
        event.loaded,
        event.lengthComputable ? event.total : file.size
      );
    };
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }
      reject(new Error(`Failed to read ${file.name} as an ArrayBuffer`));
    };
    reader.readAsArrayBuffer(file);
  });
}
