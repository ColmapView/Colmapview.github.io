import type { TrainingImageOperation, TrainingImageRequest, TrainingImageResponse } from './trainingImagePolicy';

type Task = {
  request: TrainingImageRequest; signal?: AbortSignal; abort: () => void;
  resolve: (blob: Blob | null) => void; reject: (error: unknown) => void;
};
type Slot = { worker: Worker; ready: boolean; task: Task | null; timer: ReturnType<typeof setTimeout> };

/** Null means capability unavailable; corrupt inputs and runtime failures reject. */
export class TrainingImageWorkerPool {
  private readonly size: number;
  private readonly factory: () => Worker;
  private readonly slots = new Set<Slot>();
  private readonly queue: Task[] = [];
  private unavailable = false;
  private disposed = false;
  private nextId = 0;

  constructor(size = 2, factory = () => new Worker(new URL('./trainingImageWorker.ts', import.meta.url), { type: 'module' })) {
    if (![1, 2, 4].includes(size)) throw new Error('Image worker count must be 1, 2 or 4.');
    this.size = size; this.factory = factory;
  }

  inspect() { return { workers: this.slots.size, queued: this.queue.length,
    active: [...this.slots].filter(slot => slot.task !== null).length, unavailable: this.unavailable }; }

  encode(source: Blob, operation: TrainingImageOperation, attemptId: string, signal?: AbortSignal): Promise<Blob | null> {
    signal?.throwIfAborted();
    if (this.disposed) return Promise.reject(new Error('Image worker pool was disposed.'));
    if (this.unavailable) return Promise.resolve(null);
    if (this.queue.length >= 32) return Promise.reject(new Error('Image preparation queue is full.'));
    return new Promise((resolve, reject) => {
      const task: Task = { request: { type: 'encode', attemptId, taskId: String(++this.nextId), source, operation },
        signal, resolve, reject, abort: () => {
          const index = this.queue.indexOf(task);
          if (index >= 0) this.queue.splice(index, 1);
          const slot = [...this.slots].find(candidate => candidate.task === task);
          if (slot) this.remove(slot);
          this.finish(task, signal?.reason ?? new DOMException('Cancelled', 'AbortError'));
          this.pump();
        } };
      signal?.addEventListener('abort', task.abort, { once: true });
      this.queue.push(task);
      this.pump();
    });
  }

  private finish(task: Task, error?: unknown, blob: Blob | null = null) {
    task.signal?.removeEventListener('abort', task.abort);
    if (error !== undefined) task.reject(error); else task.resolve(blob);
  }

  private remove(slot: Slot) {
    clearTimeout(slot.timer);
    slot.worker.onmessage = null;
    slot.worker.onerror = null;
    slot.worker.terminate();
    this.slots.delete(slot);
  }

  private disable() {
    this.unavailable = true;
    // Capability failure affects the whole pool. Return queued work to the
    // existing fallback and reject active work rather than silently duplicating it.
    for (const slot of this.slots) {
      if (slot.task) this.finish(slot.task, new Error('Image worker capability failed.'));
      this.remove(slot);
    }
    for (const task of this.queue.splice(0)) this.finish(task);
  }

  private spawn() {
    let worker: Worker;
    try { worker = this.factory(); } catch { this.disable(); return; }
    const slot: Slot = { worker, task: null, ready: false,
      timer: setTimeout(() => this.disable(), 5000) };
    this.slots.add(slot);
    worker.onerror = event => {
      event.preventDefault();
      if (!slot.ready) { this.disable(); return; }
      const task = slot.task;
      this.remove(slot);
      if (task) this.finish(task, new Error('Image worker crashed.'));
      this.pump();
    };
    worker.onmessage = (event: MessageEvent<TrainingImageResponse>) => {
      const message = event.data;
      if (message.type === 'unavailable') { this.disable(); return; }
      if (message.type === 'ready') {
        clearTimeout(slot.timer); slot.ready = true; this.pump(); return;
      }
      const task = slot.task;
      if (!task || message.taskId !== task.request.taskId || message.attemptId !== task.request.attemptId) return;
      clearTimeout(slot.timer);
      slot.task = null;
      if (message.type === 'error') this.finish(task, new Error(message.message));
      else this.finish(task, undefined, message.blob);
      this.pump();
    };
  }

  private pump() {
    if (this.disposed || this.unavailable) return;
    const desired = Math.min(this.size, this.queue.length + [...this.slots].filter(slot => slot.task).length);
    while (this.slots.size < desired) {
      this.spawn();
      if (this.unavailable) return;
    }
    for (const slot of this.slots) {
      if (!slot.ready || slot.task || !this.queue.length) continue;
      const task = this.queue.shift()!;
      slot.task = task;
      slot.timer = setTimeout(() => {
        this.remove(slot);
        this.finish(task, new Error('Image worker timed out.'));
        this.pump();
      }, 60_000);
      try { slot.worker.postMessage(task.request); }
      catch (error) { this.remove(slot); this.finish(task, error); this.pump(); }
    }
  }

  dispose() {
    this.disposed = true;
    for (const slot of this.slots) {
      if (slot.task) this.finish(slot.task, new DOMException('Disposed', 'AbortError'));
      this.remove(slot);
    }
    for (const task of this.queue.splice(0)) this.finish(task, new DOMException('Disposed', 'AbortError'));
  }
}

// Keep the existing encoder as the default until the benchmark promotion gate.
let pool: TrainingImageWorkerPool | null = null;
export function configureTrainingImageWorkers(count: 0 | 1 | 2 | 4): void {
  if (pool && (pool.inspect().active || pool.inspect().queued)) throw new Error('Image preparation is active.');
  pool?.dispose();
  pool = count ? new TrainingImageWorkerPool(count) : null;
}
export function trainingImageWorkers() { return pool; }
