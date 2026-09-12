export type TransferPipelineLimits = {
  preparations: number; uploads: number; waitingFiles: number; waitingBytes: number; residentBytes: number;
};

/** One coordinator owns preparation, ready payloads, cancellation and draining. */
export async function runTrainingTransferPipeline<T, P>(
  entries: readonly T[], signal: AbortSignal, limits: TransferPipelineLimits,
  estimate: (entry: T) => number,
  prepare: (entry: T, signal: AbortSignal) => Promise<P>,
  size: (prepared: P) => number,
  upload: (entry: T, prepared: P, signal: AbortSignal, failWork: (error: unknown) => void) => Promise<void>,
): Promise<void> {
  signal.throwIfAborted();
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid transfer pipeline limits.');
  }
  const abort = new AbortController();
  const workSignal = AbortSignal.any([signal, abort.signal]);
  const ready: Array<{ entry: T; payload: P; bytes: number }> = [];
  let next = 0, preparing = 0, uploading = 0, reservedBytes = 0;
  let residentBytes = 0;
  let failed = false, failure: unknown;
  await new Promise<void>((resolve, reject) => {
    const fail = (error: unknown) => {
      if (!failed) { failed = true; failure = error; abort.abort(error); }
      pump();
    };
    const onAbort = () => fail(signal.reason);
    const finish = () => {
      signal.removeEventListener('abort', onAbort);
      if (failed) reject(failure); else resolve();
    };
    const pump = () => {
      if (failed) {
        ready.length = 0;
        if (!preparing && !uploading) finish();
        return;
      }
      while (ready.length && uploading < limits.uploads) {
        const item = ready.shift()!;
        reservedBytes -= item.bytes;
        uploading += 1;
        // Keep both payload ownership and slot until all upload/hash work settles.
        void Promise.resolve().then(() => upload(item.entry, item.payload, workSignal, fail))
          .catch(fail).finally(() => { residentBytes -= item.bytes; uploading -= 1; pump(); });
      }
      while (next < entries.length && preparing < limits.preparations
        && ready.length + preparing < limits.waitingFiles) {
        const entry = entries[next];
        let bytes: number;
        try {
          bytes = estimate(entry);
          if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid transfer payload estimate.');
        } catch (error) { fail(error); return; }
        // A single oversized/unknown item may proceed; FIFO prevents starvation.
        if (ready.length + preparing && reservedBytes + bytes > limits.waitingBytes) break;
        // Upload/hash work still owns its payload. Work exceeding the resident
        // budget runs alone across the pipeline, not just the waiting queue.
        if (ready.length + preparing + uploading && residentBytes + bytes > limits.residentBytes) break;
        next += 1;
        preparing += 1;
        reservedBytes += bytes;
        residentBytes += bytes;
        void Promise.resolve().then(() => prepare(entry, workSignal)).then(payload => {
          if (failed) return;
          const actual = size(payload);
          if (!Number.isSafeInteger(actual) || actual < 0) throw new Error('Invalid prepared payload size.');
          // Replace the reservation, not add a second copy. Underestimates halt
          // further preparation until consumers drain the excess; native codec
          // output size is not knowable before conversion.
          reservedBytes += actual - bytes;
          residentBytes += actual - bytes;
          ready.push({ entry, payload, bytes: actual });
        }).catch(fail).finally(() => { preparing -= 1; pump(); });
      }
      if (next === entries.length && !preparing && !uploading && !ready.length) finish();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    pump();
  });
}
