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

export interface GaussianCloudLoaderDeps {
  loadPLYFromBuffer?: (buffer: ArrayBuffer) => GaussianCloud;
  loadSPZFromBuffer?: (buffer: ArrayBuffer) => GaussianCloud;
  createWorker?: (() => Worker | null) | null;
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
      return cached;
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

async function loadGaussianCloudFromFileUncached(
  file: File,
  deps: GaussianCloudLoaderDeps
): Promise<LoadedGaussianCloud> {
  const telemetryStart = nowWebGpuSplatTelemetryMs();
  const format = getGaussianCloudFormatForFile(file);
  const buffer = await readFileAsArrayBuffer(file);
  const byteLength = buffer.byteLength;
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

  return decodeGaussianCloudInWorker(worker, format, buffer);
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
  buffer: ArrayBuffer
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

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
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
