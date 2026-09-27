import { afterEach, describe, expect, it, vi } from 'vitest';
import { zipSync, unzipSync } from 'fflate';
import { readBlobAsArrayBuffer } from '../test/builders';
import { compressZip, type ZipWorkerResult } from './zipCompression';

class FakeWorker {
  static latest: FakeWorker;
  onmessage: ((event: MessageEvent<ZipWorkerResult>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { FakeWorker.latest = this; }
}

afterEach(() => vi.unstubAllGlobals());

describe('ZIP compression worker ownership', () => {
  it('transfers archive bytes and releases the worker after receiving a valid ZIP', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const files = { 'images/a.jpg': new Uint8Array([1, 2, 3]) };
    const pending = compressZip(files);
    const worker = FakeWorker.latest;
    expect(worker.postMessage).toHaveBeenCalledWith({ files, level: 6 }, [files['images/a.jpg'].buffer]);
    worker.onmessage!({ data: { buffer: zipSync(files).buffer } } as MessageEvent<ZipWorkerResult>);
    const blob = await pending;
    expect(blob.type).toBe('application/zip');
    expect(unzipSync(new Uint8Array(await readBlobAsArrayBuffer(blob)))['images/a.jpg']).toEqual(files['images/a.jpg']);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull();
  });

  it('terminates compression on abort and ignores a queued completion', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const controller = new AbortController();
    const pending = compressZip({}, { signal: controller.signal });
    const worker = FakeWorker.latest;
    const lateMessage = worker.onmessage!;
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    lateMessage({ data: { buffer: new ArrayBuffer(0) } } as MessageEvent<ZipWorkerResult>);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each([[0, 0], [9, 9], [12, 9], [NaN, 6]])('normalizes compression level %s to %s', async (level, expected) => {
    vi.stubGlobal('Worker', FakeWorker);
    const pending = compressZip({}, { level });
    const worker = FakeWorker.latest;
    expect(worker.postMessage).toHaveBeenCalledWith({ files: {}, level: expected }, []);
    worker.onmessage!({ data: { buffer: zipSync({}).buffer } } as MessageEvent<ZipWorkerResult>);
    await pending;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('does not start a worker for a cancelled export', () => {
    const worker = vi.fn();
    vi.stubGlobal('Worker', worker);
    expect(() => compressZip({}, { signal: AbortSignal.abort() })).toThrow();
    expect(worker).not.toHaveBeenCalled();
  });

  it.each(['compression', 'worker', 'message'] as const)('releases the worker on %s failure', async stage => {
    vi.stubGlobal('Worker', FakeWorker);
    const pending = compressZip({});
    const worker = FakeWorker.latest;
    const rejected = expect(pending).rejects.toThrow();
    if (stage === 'compression') worker.onmessage!({ data: { error: 'Compression failed' } } as MessageEvent<ZipWorkerResult>);
    else if (stage === 'message') worker.onmessageerror!();
    else worker.onerror!(new ErrorEvent('error', { message: 'Worker failed' }));
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('releases the worker if transferring input bytes fails', async () => {
    vi.stubGlobal('Worker', class extends FakeWorker {
      postMessage = vi.fn(() => { throw new Error('Transfer failed'); });
    });
    await expect(compressZip({})).rejects.toThrow('Transfer failed');
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
  });
});
