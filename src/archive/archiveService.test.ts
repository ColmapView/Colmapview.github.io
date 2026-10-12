import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArchiveImageEncoder, openArchiveReader, type ArchiveWorker } from './archiveService';
import type { ArchiveRequest, ArchiveResponse } from './protocol';
import type { MediaPriority } from '../dataset/types';
import { removeArchiveTemporaryFile } from './temporaryStorage';

vi.mock('./temporaryStorage', () => ({ removeArchiveTemporaryFile: vi.fn(async () => {}) }));
class FakeWorker extends EventTarget {
  messages: ArchiveRequest[] = [];
  terminate = vi.fn();
  postMessage(message: ArchiveRequest) { this.messages.push(message); }
  emit(response: ArchiveResponse) { this.dispatchEvent(new MessageEvent('message', { data: response })); }
  requests() { return this.messages.filter((message): message is Extract<ArchiveRequest, { kind: 'request' }> => message.kind === 'request'); }
  finish(file = new File(['original'], 'photo.png')) { this.emit({ kind: 'result', id: this.requests().at(-1)!.id, file }); }
}
async function open(worker = new FakeWorker(), name = 'scene.zip') {
  const pending = openArchiveReader(new File(['archive'], name), { createWorker: () => worker as unknown as ArchiveWorker });
  expect(worker.requests()).toHaveLength(0);
  worker.emit({ kind: 'ready' });
  worker.emit({ kind: 'result', id: worker.requests()[0].id,
    entries: ['a', 'b', 'c', 'd'].map(name => ({ path: `images/${name}.png`, size: 8, lastModified: 0 })) });
  const reader = await pending;
  const entries = (await reader.getFilesArray()).map(entry => entry.file);
  return { worker, reader, entries };
}
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });

describe('archive worker session', () => {
  it('encodes publication images in one worker without opening an archive and disposes it once', async () => {
    const worker = new FakeWorker();
    const encoder = createArchiveImageEncoder({ createWorker: () => worker });
    const source = new Blob(['png']);
    const first = encoder.encode(source, 0.85, new AbortController().signal);
    const second = encoder.encode(source, 0.85, new AbortController().signal);
    worker.emit({ kind: 'ready' });
    expect(worker.requests()).toHaveLength(1);
    expect(worker.requests()[0].operation).toEqual({ kind: 'encode-jpeg', blob: source, quality: 0.85 });
    worker.finish(new File(['first'], 'first.jpg', { type: 'image/jpeg' }));
    expect(worker.requests()).toHaveLength(2);
    worker.finish(new File(['second'], 'second.jpg', { type: 'image/jpeg' }));
    expect((await first).name).toBe('first.jpg'); expect((await second).name).toBe('second.jpg');
    await encoder.close(); await encoder.close();
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(removeArchiveTemporaryFile).not.toHaveBeenCalled();
  });
  it('terminates a publication encoder and rejects pending work when its owning upload is cancelled', async () => {
    const worker = new FakeWorker(), owner = new AbortController();
    const encoder = createArchiveImageEncoder({ createWorker: () => worker, signal: owner.signal });
    const pending = encoder.encode(new Blob(['png']), 0.85, owner.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    worker.emit({ kind: 'ready' }); owner.abort(); await rejected; await encoder.close();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it('serializes work and re-evaluates live priorities when consumers promote queued images', async () => {
    const { worker, reader, entries } = await open();
    let priority: MediaPriority = 'prefetch';
    const a = entries[0].extract({ priority: 'prefetch' });
    const b = entries[1].extract({ getPriority: () => priority });
    const c = entries[2].extract({ priority: 'visible' });
    const d = entries[3].extract({ priority: 'selected' });
    expect(worker.requests()).toHaveLength(2); // Open plus one extraction.
    priority = 'selected'; worker.finish();
    expect(worker.requests().at(-1)?.operation).toMatchObject({ path: 'images/b.png' });
    worker.finish(); expect(worker.requests().at(-1)?.operation).toMatchObject({ path: 'images/d.png' });
    worker.finish(); expect(worker.requests().at(-1)?.operation).toMatchObject({ path: 'images/c.png' });
    worker.finish(); await Promise.all([a, b, c, d]); await reader.close();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it('cancels queued work without sending it and waits for running cancellation before starting the next job', async () => {
    const { worker, reader, entries } = await open();
    const running = new AbortController(), queued = new AbortController();
    const a = entries[0].extract({ signal: running.signal });
    const b = entries[1].extract({ signal: queued.signal });
    const c = entries[2].extract();
    const aRejected = expect(a).rejects.toMatchObject({ name: 'AbortError' });
    const bRejected = expect(b).rejects.toMatchObject({ name: 'AbortError' });
    queued.abort(); running.abort(); await Promise.all([aRejected, bRejected]);
    expect(worker.requests()).toHaveLength(2);
    expect(worker.messages.at(-1)).toEqual({ kind: 'cancel', id: 2 });
    worker.emit({ kind: 'result', id: 2, error: 'cancelled', errorName: 'AbortError' });
    expect(worker.requests().at(-1)?.operation).toMatchObject({ path: 'images/c.png' });
    worker.emit({ kind: 'result', id: 2, file: new File(['stale'], 'stale') });
    worker.finish(); expect((await c).name).toBe('photo.png'); await reader.close();
  });
  it('sends preview bounds only for display requests and leaves original extraction untouched', async () => {
    const { worker, reader, entries } = await open();
    const bounds = { maxWidth: 800, maxHeight: 600 };
    const preview = entries[0].extractPreview({ bounds });
    expect(worker.requests().at(-1)?.operation).toMatchObject({ bounds }); worker.finish(); await preview;
    const raw = entries[0].extract({ bounds });
    expect(worker.requests().at(-1)?.operation).toMatchObject({ bounds: undefined }); worker.finish(); await raw;
    await reader.close();
  });
  it('terminates and rejects pending work once on disposal, including a worker still initializing', async () => {
    const { worker, reader, entries } = await open(new FakeWorker(), 'scene.tar.gz');
    const a = entries[0].extract(), b = entries[1].extract();
    const rejected = [expect(a).rejects.toMatchObject({ name: 'AbortError' }), expect(b).rejects.toMatchObject({ name: 'AbortError' })];
    await reader.close(); await reader.close(); await Promise.all(rejected);
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(removeArchiveTemporaryFile).toHaveBeenCalledOnce();
    await expect(entries[0].extract()).rejects.toThrow('closed');
    const initializing = new FakeWorker(), controller = new AbortController();
    const pending = openArchiveReader(new File([], 'scene.zip'), { createWorker: () => initializing as unknown as ArchiveWorker, signal: controller.signal });
    const failure = expect(pending).rejects.toMatchObject({ name: 'AbortError' }); controller.abort(); await failure;
    expect(initializing.terminate).toHaveBeenCalledOnce();
  });
  it('fails all waiters when the worker crashes or never initializes', async () => {
    const { worker, reader, entries } = await open();
    const a = entries[0].extract(), b = entries[1].extract();
    const failures = [expect(a).rejects.toThrow('stopped unexpectedly'), expect(b).rejects.toThrow('stopped unexpectedly')];
    worker.dispatchEvent(new Event('error')); await Promise.all(failures); await reader.close();
    vi.useFakeTimers();
    const pending = openArchiveReader(new File([], 'scene.zip'), { createWorker: () => new FakeWorker() as unknown as ArchiveWorker });
    const timeout = expect(pending).rejects.toThrow('initialization timed out'); await vi.advanceTimersByTimeAsync(30000); await timeout;
  });
  it('validates remote byte requests and aborts the provider read when its consumer cancels', async () => {
    const worker = new FakeWorker();
    const read = vi.fn(async (_offset: number, length: number, signal: AbortSignal) => { signal.throwIfAborted(); return new ArrayBuffer(length); });
    const pending = openArchiveReader({ kind: 'remote', name: 'scene.tar', size: 1024 }, { read, createWorker: () => worker as unknown as ArchiveWorker });
    worker.emit({ kind: 'ready' }); worker.emit({ kind: 'read', id: 1, offset: 512, length: 512 });
    await vi.waitFor(() => expect(worker.messages.at(-1)).toMatchObject({ kind: 'bytes', id: 1, bytes: expect.any(ArrayBuffer) }));
    worker.emit({ kind: 'read', id: 2, offset: 1000, length: 512 });
    await vi.waitFor(() => expect(worker.messages.at(-1)).toMatchObject({ kind: 'bytes', id: 2, error: expect.stringContaining('byte range') }));
    expect(read).toHaveBeenCalledOnce();
    worker.emit({ kind: 'result', id: 1, entries: [{ path: 'photo.jpg', size: 8, lastModified: 0 }] });
    const reader = await pending, controller = new AbortController();
    const extraction = (await reader.getFilesArray())[0].file.extract({ signal: controller.signal });
    const rejected = expect(extraction).rejects.toMatchObject({ name: 'AbortError' });
    worker.emit({ kind: 'read', id: 3, offset: 0, length: 8 });
    controller.abort(); await rejected;
    expect(read.mock.calls.at(-1)![2].aborted).toBe(true); await reader.close();
  });
});
