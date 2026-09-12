import type { Camera, Point2D, Reconstruction } from '../types/colmap';
import type { Sim3dEuler } from '../types/sim3d';
import type { WasmReconstructionWrapper } from './reconstruction';
import {
  assertReconstructionSnapshot, isReconstructionRequest, isReconstructionResponse,
  type ReconstructionExecutionMode, type ReconstructionExportFiles, type ReconstructionExportPayload,
  type ReconstructionLoadFiles, type ReconstructionOperation, type ReconstructionOperationPayloads,
  type ReconstructionOperationResults, type ReconstructionPhase, type ReconstructionPointSource,
  type ReconstructionRequest, type ReconstructionSnapshotData,
} from './reconstructionProtocol';
import { appLogger } from '../utils/logger';
import { createPointMembershipViews } from './compactPointMembership';

interface Authority {
  execute(request: ReconstructionRequest, progress: (phase: ReconstructionPhase) => void): Promise<ReconstructionOperationResults[ReconstructionOperation]>;
  dispose(): void;
}
export interface ReconstructionServiceOptions {
  signal?: AbortSignal;
  onProgress?: (phase: ReconstructionPhase) => void;
  workerFactory?: (() => Worker) | null;
  authorityFactory?: () => Promise<Authority>;
  initializationTimeoutMs?: number;
}

class WorkerTransportError extends Error {}
export function reconstructionAbortError(): DOMException {
  return new DOMException('Reconstruction operation cancelled', 'AbortError');
}

interface PendingRequest {
  operation: ReconstructionOperation;
  resolve(value: ReconstructionOperationResults[ReconstructionOperation]): void;
  reject(error: Error): void;
  cleanup(): void;
}

let nextGeneration = 0;

/** Async operations own all reconstruction records. The UI receives only immutable render snapshots. */
export class ReconstructionService {
  readonly generation = ++nextGeneration;
  mode: ReconstructionExecutionMode = 'worker';
  private worker: Worker | null = null;
  private authority: Authority | null = null;
  private readonly options: ReconstructionServiceOptions;
  private files: ReconstructionLoadFiles | null;
  private pending = new Map<number, PendingRequest>();
  private requestId = 0;
  private disposed = false;
  private revision = 0;
  private queue = Promise.resolve();
  private fallbackUsed = false;
  private journal: ReconstructionRequest[] = [];

  constructor(files: ReconstructionLoadFiles, options: ReconstructionServiceOptions = {}) {
    this.files = files;
    this.options = options;
  }

  async load(): Promise<ReconstructionSnapshot> {
    const { signal } = this.options;
    if (this.disposed || signal?.aborted) throw reconstructionAbortError();
    const abort = () => this.dispose();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      try {
        if (this.options.workerFactory === null || (this.options.workerFactory === undefined && typeof Worker === 'undefined')) {
          throw new WorkerTransportError('Workers unavailable');
        }
        this.worker = this.options.workerFactory
          ? this.options.workerFactory()
          : new Worker(new URL('./reconstruction.worker.ts', import.meta.url), { type: 'module', name: 'colmap-reconstruction' });
        this.worker.onmessage = event => this.receive(event.data);
        this.worker.onerror = event => {
          event.preventDefault();
          this.failWorker(new WorkerTransportError(event.message || 'Reconstruction worker crashed'));
        };
        this.worker.onmessageerror = () => this.failWorker(new WorkerTransportError('Invalid reconstruction worker message'));
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            this.send('init', null),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => reject(new WorkerTransportError('Reconstruction worker initialization timed out')),
                this.options.initializationTimeoutMs ?? 15000);
            }),
          ]);
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        if (this.disposed) throw reconstructionAbortError();
        await this.startFallback(error);
      }
      const result = await this.requestWithRecovery('load', this.files!);
      return this.install(result);
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }

  private receive(value: unknown): void {
    if (this.disposed) return;
    if (!isReconstructionResponse(value)) {
      this.failWorker(new WorkerTransportError('Malformed reconstruction worker response'));
      return;
    }
    if (value.generation !== this.generation) return;
    const pending = this.pending.get(value.requestId);
    if (!pending || pending.operation !== value.operation) return;
    if (value.type === 'progress') {
      if (value.operation === 'load' || value.operation === 'init') this.options.onProgress?.(value.phase);
      return;
    }
    this.pending.delete(value.requestId);
    pending.cleanup();
    if (value.type === 'error') pending.reject(new Error(value.error.message));
    else pending.resolve(value.result);
  }

  private async send<K extends ReconstructionOperation>(operation: K, payload: ReconstructionOperationPayloads[K], signal?: AbortSignal): Promise<ReconstructionOperationResults[K]> {
    if (this.disposed || signal?.aborted) throw reconstructionAbortError();
    const request = { requestId: ++this.requestId, generation: this.generation, operation, payload } as ReconstructionRequest;
    if (!isReconstructionRequest(request)) throw new Error('Invalid reconstruction operation payload');
    if (this.authority) {
      const result = await this.authority.execute(request, phase => {
        if (!this.disposed && !signal?.aborted && (operation === 'load' || operation === 'init')) this.options.onProgress?.(phase);
      });
      if (this.disposed || signal?.aborted) {
        if (this.disposed) this.authority.dispose();
        throw reconstructionAbortError();
      }
      return result as ReconstructionOperationResults[K];
    }
    const worker = this.worker;
    if (!worker) throw new WorkerTransportError('Reconstruction worker is unavailable');
    return new Promise<ReconstructionOperationResults[K]>((resolve, reject) => {
      const abort = () => {
        const pending = this.pending.get(request.requestId);
        if (!pending) return;
        this.pending.delete(request.requestId);
        pending.cleanup();
        reject(reconstructionAbortError());
      };
      this.pending.set(request.requestId, {
        operation,
        resolve: result => resolve(result as ReconstructionOperationResults[K]), reject,
        cleanup: () => signal?.removeEventListener('abort', abort),
      });
      signal?.addEventListener('abort', abort, { once: true });
      try {
        worker.postMessage(request);
      } catch (error) {
        this.failWorker(new WorkerTransportError(error instanceof Error ? error.message : String(error)));
      }
    });
  }

  private failWorker(error: Error): void {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) { pending.cleanup(); pending.reject(error); }
    this.pending.clear();
  }

  private async startFallback(reason: unknown): Promise<void> {
    if (this.fallbackUsed || this.disposed) throw this.disposed ? reconstructionAbortError() : reason;
    this.fallbackUsed = true;
    this.failWorker(new WorkerTransportError('Switching to compatible current-thread fallback'));
    this.mode = 'main-thread-fallback';
    appLogger.warn('[Reconstruction] Using current-thread fallback:', reason);
    const authority = await (this.options.authorityFactory?.()
      ?? import('./reconstructionAuthority').then(module => new module.ReconstructionAuthority()));
    if (this.disposed) { authority.dispose(); throw reconstructionAbortError(); }
    this.authority = authority;
  }

  private async requestWithRecovery<K extends ReconstructionOperation>(operation: K, payload: ReconstructionOperationPayloads[K], signal?: AbortSignal): Promise<ReconstructionOperationResults[K]> {
    try {
      return await this.send(operation, payload, signal);
    } catch (error) {
      // Input/operation errors never cause another parse. Only transport failure permits one replay.
      if (!(error instanceof WorkerTransportError) || this.fallbackUsed || signal?.aborted) throw error;
      await this.startFallback(error);
      if (operation !== 'load') {
        await this.send('load', this.files!);
        for (const edit of this.journal) await this.authority!.execute(edit, () => undefined);
      }
      return this.send(operation, payload, signal);
    }
  }

  private install(data: ReconstructionSnapshotData): ReconstructionSnapshot {
    assertReconstructionSnapshot(data);
    this.revision = data.revision;
    if (data.pointMembership) {
      data = { ...data, reconstruction: {
        ...data.reconstruction, imageToPoint3DIds: createPointMembershipViews(data.pointMembership),
      } };
    }
    return new ReconstructionSnapshot(data, this);
  }

  private serialized<T>(revision: number, operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(() => {
      if (this.disposed) throw reconstructionAbortError();
      if (revision !== this.revision) throw new Error('Reconstruction changed before the operation started');
      return operation();
    });
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  observations(revision: number, imageIds: number[], signal?: AbortSignal): Promise<Map<number, Point2D[]>> {
    return this.serialized(revision, async () => {
      const result = await this.requestWithRecovery('observations', { imageIds }, signal);
      if (!(result instanceof Map)) throw new Error('Invalid observation response');
      return result;
    });
  }

  edit(revision: number, operation: 'transform' | 'deleteImages' | 'updateCameras', payload: ReconstructionOperationPayloads['transform'] | ReconstructionOperationPayloads['deleteImages'] | ReconstructionOperationPayloads['updateCameras']): Promise<ReconstructionSnapshot> {
    return this.serialized(revision, async () => {
      const result = await this.requestWithRecovery(operation, payload);
      const snapshot = this.install(result);
      this.journal.push({ requestId: ++this.requestId, generation: this.generation, operation, payload } as ReconstructionRequest);
      return snapshot;
    });
  }

  export(revision: number, payload: ReconstructionExportPayload): Promise<ReconstructionExportFiles> {
    return this.serialized(revision, async () => {
      const result = await this.requestWithRecovery('export', payload);
      if (!result || Object.values(result).some(value => !(value instanceof Uint8Array))) throw new Error('Invalid export response');
      return result;
    });
  }

  floor(revision: number, payload: ReconstructionOperationPayloads['floor'], signal?: AbortSignal) {
    return this.serialized(revision, () => this.requestWithRecovery('floor', payload, signal));
  }
  histogram(revision: number, type: 'trackLength' | 'error', signal?: AbortSignal) {
    return this.serialized(revision, () => this.requestWithRecovery('histogram', { type }, signal));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Termination interrupts synchronous WASM parsing; an abort message cannot do that.
    this.failWorker(reconstructionAbortError());
    this.authority?.dispose();
    this.journal = [];
    this.files = null;
  }

  get isDisposed(): boolean { return this.disposed; }
}

export class ReconstructionSnapshot implements ReconstructionPointSource {
  readonly immutableBuffers = true;
  readonly data: ReconstructionSnapshotData;
  readonly service: ReconstructionService;
  constructor(data: ReconstructionSnapshotData, service: ReconstructionService) {
    this.data = data;
    this.service = service;
  }
  get revision(): number { return this.data.revision; }
  get reconstruction(): Reconstruction { return this.data.reconstruction; }
  get pointCount(): number { return this.data.point3DIds.length; }
  hasPoints(): boolean { return !this.service.isDisposed && this.pointCount > 0; }
  getPositions(): Float32Array { return this.data.positions; }
  getPositionsCopy(): Float32Array { return this.data.positions.slice(); }
  getColors(): Float32Array { return this.data.colors; }
  getColorsCopy(): Float32Array { return this.data.colors.slice(); }
  getErrors(): Float32Array { return this.data.errors; }
  getTrackLengths(): Uint32Array { return this.data.trackLengths; }
  getPoint3DIds(): BigUint64Array { return this.data.point3DIds; }
  getBoundingBox() { return this.data.boundingBox; }
  observations(imageIds: number[], signal?: AbortSignal) { return this.service.observations(this.revision, imageIds, signal); }
  transform(transform: Sim3dEuler) { return this.service.edit(this.revision, 'transform', { transform }); }
  deleteImages(imageIds: number[]) { return this.service.edit(this.revision, 'deleteImages', { imageIds }); }
  updateCameras(cameras: Map<number, Camera>) { return this.service.edit(this.revision, 'updateCameras', { cameras }); }
  export(payload: ReconstructionExportPayload) { return this.service.export(this.revision, payload); }
  floor(payload: ReconstructionOperationPayloads['floor'], signal?: AbortSignal) { return this.service.floor(this.revision, payload, signal); }
  histogram(type: 'trackLength' | 'error', signal?: AbortSignal) { return this.service.histogram(this.revision, type, signal); }
  dispose(): void { this.service.dispose(); }
}

export type ReconstructionSource = WasmReconstructionWrapper | ReconstructionSnapshot;
export function isReconstructionSnapshot(source: ReconstructionSource | null | undefined): source is ReconstructionSnapshot {
  return source instanceof ReconstructionSnapshot;
}
