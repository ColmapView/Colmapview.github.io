type Waiter = {
  bytes: number; signal?: AbortSignal; abort: () => void;
  resolve: (release: () => void) => void; reject: (reason: unknown) => void;
};

/** FIFO reservations. Oversized work runs alone, never starves behind small work. */
export class TrainingPreparationBudget {
  private readonly waiting: Waiter[] = [];
  private active = 0;
  private bytes = 0;
  readonly limitBytes: number;
  readonly limitCount: number;

  constructor(limitBytes: number, limitCount: number) {
    if (!Number.isSafeInteger(limitBytes) || limitBytes < 1
      || !Number.isSafeInteger(limitCount) || limitCount < 1) throw new Error('Invalid preparation budget.');
    this.limitBytes = limitBytes;
    this.limitCount = limitCount;
  }

  inspect() { return { active: this.active, bytes: this.bytes, queued: this.waiting.length }; }

  acquire(bytes: number, signal?: AbortSignal): Promise<() => void> {
    signal?.throwIfAborted();
    if (!Number.isSafeInteger(bytes) || bytes < 0) return Promise.reject(new Error('Invalid preparation estimate.'));
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { bytes, signal, resolve, reject, abort: () => {
        const index = this.waiting.indexOf(waiter);
        if (index < 0) return;
        this.waiting.splice(index, 1);
        signal?.removeEventListener('abort', waiter.abort);
        reject(signal?.reason);
        this.pump();
      } };
      signal?.addEventListener('abort', waiter.abort, { once: true });
      this.waiting.push(waiter);
      this.pump();
    });
  }

  private pump() {
    while (this.waiting.length && this.active < this.limitCount) {
      const waiter = this.waiting[0];
      if (this.active && this.bytes + waiter.bytes > this.limitBytes) return;
      this.waiting.shift();
      waiter.signal?.removeEventListener('abort', waiter.abort);
      this.active += 1;
      this.bytes += waiter.bytes;
      let released = false;
      waiter.resolve(() => {
        if (released) return;
        released = true;
        this.active -= 1;
        this.bytes -= waiter.bytes;
        this.pump();
      });
    }
  }
}

export type TrainingRasterDimensions = { width: number; height: number };
export const trainingRasterBudget = new TrainingPreparationBudget(256 * 1024 * 1024, 4);

/** Bitmap + canvas + conservative codec allowance; native allocations are estimates. */
export function estimateTrainingRasterBytes(dimensions?: TrainingRasterDimensions): number {
  if (!dimensions) return trainingRasterBudget.limitBytes + 1; // Unknown dimensions run exclusively.
  const { width, height } = dimensions;
  const bytes = width * height * 12 + 1024 * 1024;
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1
    || !Number.isSafeInteger(bytes)) throw new Error('Invalid training raster dimensions.');
  return bytes;
}

export async function withTrainingRasterBudget<T>(
  dimensions: TrainingRasterDimensions | undefined, signal: AbortSignal | undefined, operation: () => Promise<T>,
): Promise<T> {
  const release = await trainingRasterBudget.acquire(estimateTrainingRasterBytes(dimensions), signal);
  try { signal?.throwIfAborted(); return await operation(); }
  finally { release(); }
}
