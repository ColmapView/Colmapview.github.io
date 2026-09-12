import { describe, expect, it, vi } from 'vitest';
import { runTrainingTransferPipeline } from './trainingTransferPipeline';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const limits = { preparations: 2, uploads: 1, waitingFiles: 2, waitingBytes: 10, residentBytes: 40 };

describe('training transfer pipeline', () => {
  it('retains resident-byte reservations until uploads settle', async () => {
    const gate = deferred();
    const prepare = vi.fn(async (entry: number) => entry);
    const upload = vi.fn(async () => { await gate.promise; });
    const pending = runTrainingTransferPipeline([0, 1, 2], new AbortController().signal,
      { ...limits, uploads: 4, residentBytes: 10 }, () => 8, prepare, () => 8, upload);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
    expect(prepare).toHaveBeenCalledOnce();
    gate.resolve();
    await pending;
    expect(upload).toHaveBeenCalledTimes(3);
  });

  it('keeps a known oversized payload exclusive through upload completion', async () => {
    const gate = deferred();
    const prepare = vi.fn(async (entry: number) => entry);
    const upload = vi.fn(async () => { await gate.promise; });
    const pending = runTrainingTransferPipeline([0, 1], new AbortController().signal,
      { ...limits, uploads: 4, residentBytes: 10 }, () => 20, prepare, () => 20, upload);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
    expect(prepare).toHaveBeenCalledOnce();
    gate.resolve();
    await pending;
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('pauses new preparation when actual payload sizes exceed resident estimates', async () => {
    const gate = deferred();
    const prepare = vi.fn(async (entry: number) => entry);
    const upload = vi.fn(async () => { await gate.promise; });
    const pending = runTrainingTransferPipeline([0, 1, 2], new AbortController().signal,
      { ...limits, preparations: 1, uploads: 4, residentBytes: 10 }, () => 4, prepare, () => 12, upload);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
    expect(prepare).toHaveBeenCalledOnce();
    gate.resolve();
    await pending;
    expect(upload).toHaveBeenCalledTimes(3);
  });

  it('overlaps independent preparation and upload slots with bounded lookahead', async () => {
    const gate = deferred();
    const prepare = vi.fn(async (entry: number) => entry);
    const upload = vi.fn(async () => { await gate.promise; });
    const pending = runTrainingTransferPipeline([0, 1, 2, 3, 4], new AbortController().signal,
      limits, () => 4, prepare, () => 4, upload);
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(3));
    expect(upload).toHaveBeenCalledTimes(1);
    gate.resolve();
    await pending;
    expect(upload).toHaveBeenCalledTimes(5);
  });

  it('reserves bytes before reading, rather than after parallel encodes complete', async () => {
    const conversion = deferred<number>();
    const prepare = vi.fn(() => conversion.promise);
    const pending = runTrainingTransferPipeline([0, 1], new AbortController().signal,
      limits, () => 8, prepare, () => 8, async () => {});
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    conversion.resolve(8);
    await pending;
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it('handles oversized entries and shrinks reservations to actual sizes', async () => {
    const gate = deferred();
    const prepare = vi.fn(async (entry: number) => entry);
    const upload = vi.fn(async () => { await gate.promise; });
    const pending = runTrainingTransferPipeline([0, 1, 2, 3], new AbortController().signal,
      limits, () => 20, prepare, () => 3, upload);
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
    expect(upload).toHaveBeenCalledTimes(1);
    gate.resolve();
    await pending;
    expect(upload).toHaveBeenCalledTimes(4);
  });

  it('aborts uploads on encoding failure and drains active work before rejecting', async () => {
    const conversion = deferred<number>();
    const put = deferred();
    let uploadSignal: AbortSignal | undefined;
    const pending = runTrainingTransferPipeline([0, 1, 2], new AbortController().signal,
      limits, () => 4, async entry => entry === 1 ? conversion.promise : entry, () => 4,
      async (_entry, _payload, signal) => { uploadSignal = signal; await put.promise; });
    const rejected = expect(pending).rejects.toThrow('encode failed');
    await vi.waitFor(() => expect(uploadSignal).toBeDefined());
    conversion.reject(new Error('encode failed'));
    await vi.waitFor(() => expect(uploadSignal!.aborted).toBe(true));
    let settled = false;
    void pending.catch(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    put.resolve();
    await rejected;
  });

  it('aborts pending preparation on PUT failure and discards late results', async () => {
    const conversion = deferred<number>();
    let prepareSignal: AbortSignal | undefined;
    const upload = vi.fn(async () => { throw new Error('put failed'); });
    const pending = runTrainingTransferPipeline([0, 1, 2], new AbortController().signal,
      limits, () => 4, async (entry, signal) => {
        prepareSignal = signal;
        return entry ? conversion.promise : entry;
      }, () => 4, upload);
    const rejected = expect(pending).rejects.toThrow('put failed');
    await vi.waitFor(() => expect(prepareSignal?.aborted).toBe(true));
    conversion.resolve(1);
    await rejected;
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('cancels without publishing a late prepared payload', async () => {
    const abort = new AbortController();
    const conversion = deferred<number>();
    const prepare = vi.fn(() => conversion.promise);
    const upload = vi.fn(async () => {});
    const pending = runTrainingTransferPipeline([0, 1], abort.signal,
      limits, () => 8, prepare, () => 8, upload);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
    abort.abort();
    conversion.resolve(0);
    await rejected;
    expect(upload).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledOnce();
  });
});
