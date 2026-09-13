import { afterEach, describe, expect, it, vi } from 'vitest';
import { File as NodeFile } from 'node:buffer';
import { ReconstructionService, type ReconstructionServiceOptions } from './reconstructionService';
import { isReconstructionRequest, isReconstructionResponse, type ReconstructionRequest, type ReconstructionSnapshotData } from './reconstructionProtocol';
import { buildReconstruction } from '../test/builders/colmapBuilders';
import { createIdentityEuler } from '../utils/sim3dTransforms';
import { beginReconstructionLoad, cancelPendingReconstructionLoad } from './reconstructionLoadLifecycle';
import { packPointMembership } from './compactPointMembership';

const File = NodeFile as unknown as typeof globalThis.File;

function data(revision = 1): ReconstructionSnapshotData {
  const reconstruction = buildReconstruction();
  delete reconstruction.points3D;
  return {
    revision, reconstruction, positions: new Float32Array([1, 2, 3]), colors: new Float32Array([1, 1, 1]),
    errors: new Float32Array([0]), trackLengths: new Uint32Array([1]), point3DIds: new BigUint64Array([9007199254740997n]),
    boundingBox: { minX: 1, maxX: 1, minY: 2, maxY: 2, minZ: 3, maxZ: 3 }, warnings: [],
    diagnostics: { parser: 'wasm', parseMs: 1, statisticsMs: 1, snapshotMs: 1, renderBytes: 40, wasmHeapBytes: 65536, retainedImageBufferBytes: 64 },
  };
}
const files = {
  camerasFile: new File(['cameras'], 'cameras.bin'), imagesFile: new File(['images'], 'images.bin'), points3DFile: new File(['points'], 'points3D.bin'),
};

class FakeWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  requests: ReconstructionRequest[] = [];
  revision = 1;
  autoLoad = true;
  terminate = vi.fn();
  postMessage = vi.fn((request: ReconstructionRequest) => {
    this.requests.push(request);
    queueMicrotask(() => {
      if (request.operation === 'init') this.result(request, null);
      if (request.operation === 'load' && this.autoLoad) this.result(request, data(this.revision));
      if (request.operation === 'transform') this.result(request, data(++this.revision));
    });
  });
  result(request: ReconstructionRequest, result: unknown): void {
    this.onmessage?.({ data: { requestId: request.requestId, generation: request.generation, operation: request.operation, type: 'result', result } } as MessageEvent);
  }
  fail(request: ReconstructionRequest): void {
    this.onmessage?.({ data: { requestId: request.requestId, generation: request.generation, operation: request.operation, type: 'error', error: { code: 'input', message: 'Malformed input' } } } as MessageEvent);
  }
  crash(): void { this.onerror?.({ message: 'Worker crashed', preventDefault: () => undefined } as ErrorEvent); }
}

const services: ReconstructionService[] = [];
function service(worker: FakeWorker, options: ReconstructionServiceOptions = {}): ReconstructionService {
  const result = new ReconstructionService(files, { workerFactory: () => worker as unknown as Worker, ...options });
  services.push(result);
  return result;
}
afterEach(() => { services.splice(0).forEach(value => value.dispose()); cancelPendingReconstructionLoad(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('reconstruction worker lifecycle', () => {
  it('passes Files to its owner and keeps transfer-owned snapshot buffers stable', async () => {
    const worker = new FakeWorker();
    const snapshot = await service(worker).load();
    expect(worker.requests[1].payload).toBe(files);
    expect(snapshot.immutableBuffers).toBe(true);
    expect(snapshot.getPositions()).toBe(snapshot.getPositions());
    expect(snapshot.getPoint3DIds()?.[0]).toBe(9007199254740997n);
    const changed = await snapshot.transform({ ...createIdentityEuler(), scale: 2 });
    expect(changed.revision).toBe(2);
    expect(changed.getPositions()).not.toBe(snapshot.getPositions());
    expect(snapshot.getPositions()).toEqual(new Float32Array([1, 2, 3]));
    await expect(snapshot.export({ format: 'binary' })).rejects.toThrow('changed');
  });

  it('installs compact reverse membership in worker and current-thread modes without boxed Set expansion', async () => {
    for (const fallback of [false, true]) {
      const packedData = data();
      packedData.reconstruction.imageToPoint3DIds = new Map();
      packedData.pointMembership = packPointMembership(new Map([[7, new Set([9007199254740997n])], [42, new Set<bigint>()]]));
      const worker = new FakeWorker();
      worker.autoLoad = false;
      const current = service(worker, fallback ? {
        workerFactory: null,
        authorityFactory: async () => ({ execute: async () => packedData, dispose: vi.fn() }),
      } : {});
      const loading = current.load();
      if (!fallback) {
        await vi.waitFor(() => expect(worker.requests.at(-1)?.operation).toBe('load'));
        worker.result(worker.requests.at(-1)!, packedData);
      }
      const snapshot = await loading;
      const ids = snapshot.reconstruction.imageToPoint3DIds.get(7)!;
      expect(ids).not.toBeInstanceOf(Set);
      expect([...ids]).toEqual([9007199254740997n]);
      expect(ids.has(9007199254740997n)).toBe(true);
      expect(snapshot.reconstruction.imageToPoint3DIds.get(42)?.size).toBe(0);
      expect(packedData.reconstruction.imageToPoint3DIds.size).toBe(0);
    }
  });

  it('terminates a busy parse immediately, settles cancellation, and ignores late messages', async () => {
    const worker = new FakeWorker(); worker.autoLoad = false;
    const controller = new AbortController();
    const onProgress = vi.fn();
    const result = service(worker, { signal: controller.signal, onProgress }).load().catch(error => error);
    await vi.waitFor(() => expect(worker.requests.some(request => request.operation === 'load')).toBe(true));
    const load = worker.requests.find(request => request.operation === 'load')!;
    controller.abort();
    expect((await result).name).toBe('AbortError');
    expect(worker.terminate).toHaveBeenCalledOnce();
    worker.result(load, data());
    worker.onmessage?.({ data: { ...load, type: 'progress', phase: 'statistics' } } as MessageEvent);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('cancels an observation consumer without terminating other observation work', async () => {
    const worker = new FakeWorker();
    const snapshot = await service(worker).load();
    const controller = new AbortController();
    const first = snapshot.observations([7], controller.signal).catch(error => error);
    const second = snapshot.observations([42]);
    await vi.waitFor(() => expect(worker.requests.some(request => request.operation === 'observations')).toBe(true));
    const oldRequest = worker.requests.at(-1)!;
    controller.abort();
    expect((await first).name).toBe('AbortError');
    await vi.waitFor(() => expect(worker.requests.at(-1)?.payload).toEqual({ imageIds: [42] }));
    const newRequest = worker.requests.at(-1)!;
    worker.result(oldRequest, new Map([[7, []]]));
    worker.result(newRequest, new Map([[42, []]]));
    expect(await second).toEqual(new Map([[42, []]]));
    expect(worker.terminate).not.toHaveBeenCalled();
  });

  it('rejects malformed input without retrying the parser or entering fallback', async () => {
    const worker = new FakeWorker(); worker.autoLoad = false;
    const authorityFactory = vi.fn();
    const result = service(worker, { authorityFactory }).load().catch(error => error);
    await vi.waitFor(() => expect(worker.requests.at(-1)?.operation).toBe('load'));
    worker.fail(worker.requests.at(-1)!);
    expect((await result).message).toBe('Malformed input');
    expect(authorityFactory).not.toHaveBeenCalled();
    expect(worker.requests.filter(request => request.operation === 'load')).toHaveLength(1);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('uses one compatible fallback after a crash and replays confirmed edits before exporting', async () => {
    const worker = new FakeWorker();
    const operations: string[] = [];
    const authority = {
      execute: vi.fn(async (request: ReconstructionRequest) => {
        operations.push(request.operation);
        if (request.operation === 'load') return data();
        if (request.operation === 'transform') return data(2);
        if (request.operation === 'export') return { 'points.ply': new Uint8Array([1]) };
        return null;
      }), dispose: vi.fn(),
    };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const owner = service(worker, { authorityFactory: async () => authority });
    const first = await owner.load();
    const edited = await first.transform({ ...createIdentityEuler(), scale: 2 });
    worker.crash();
    expect(await edited.export({ format: 'ply' })).toEqual({ 'points.ply': new Uint8Array([1]) });
    expect(operations).toEqual(['load', 'transform', 'export']);
    expect(owner.mode).toBe('main-thread-fallback');
    expect(worker.terminate).toHaveBeenCalledOnce();
    owner.dispose();
    expect(authority.dispose).toHaveBeenCalledOnce();
  });

  it('times out initialization once and settles all worker requests before fallback', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker(); worker.postMessage.mockImplementation(request => { worker.requests.push(request); });
    const authority = { execute: vi.fn(async () => data()), dispose: vi.fn() };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const owner = service(worker, { initializationTimeoutMs: 20, authorityFactory: async () => authority });
    const loading = owner.load();
    await vi.advanceTimersByTimeAsync(21);
    expect((await loading).pointCount).toBe(1);
    expect(owner.mode).toBe('main-thread-fallback');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('invalidates dataset load generations on replacement and clear', () => {
    const first = beginReconstructionLoad();
    const second = beginReconstructionLoad();
    expect(first.signal.aborted).toBe(true);
    expect(() => first.assertCurrent()).toThrow();
    first.finish();
    second.assertCurrent();
    cancelPendingReconstructionLoad();
    expect(second.signal.aborted).toBe(true);
    expect(() => second.assertCurrent()).toThrow();
  });

  it('validates protocol envelopes and payloads', () => {
    expect(isReconstructionRequest({ requestId: 1, generation: 1, operation: 'load', payload: files })).toBe(true);
    expect(isReconstructionRequest({ requestId: 1, generation: 1, operation: 'observations', payload: { imageIds: [-1] } })).toBe(false);
    expect(isReconstructionRequest({ requestId: 1, generation: 1, operation: 'transform', payload: { transform: { ...createIdentityEuler(), scale: NaN } } })).toBe(false);
    expect(isReconstructionResponse({ requestId: 1, generation: 1, operation: 'load', type: 'error', error: { code: 'input', message: 'Bad input' } })).toBe(true);
    expect(isReconstructionResponse({ requestId: 1, generation: 1, operation: 'load', type: 'progress', phase: 'unknown' })).toBe(false);
  });
});
