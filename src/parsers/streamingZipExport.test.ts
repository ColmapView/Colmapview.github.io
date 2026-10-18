import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import { downloadStreamingZip, writeStreamingZip } from './streamingZipExport';
import { downloadBlob } from '../utils/download';
import { awaitWithAbort } from '../utils/awaitWithAbort';

vi.mock('../utils/download', () => ({downloadBlob: vi.fn()}));
beforeEach(() => { vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('File', NodeFile); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

function storage() {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const writable = {
    write: vi.fn(async (chunk: Uint8Array) => { chunks.push(new Uint8Array(chunk)); }),
    close: vi.fn(async () => {}), abort: vi.fn(async () => {}),
  };
  const handle = {createWritable: vi.fn(async () => writable), getFile: vi.fn(async () => new File(chunks, 'disk.zip'))};
  const directory = {getFileHandle: vi.fn(async () => handle), removeEntry: vi.fn(async () => {})};
  const getDirectory = vi.fn(async () => ({getDirectoryHandle: async () => directory}));
  vi.stubGlobal('navigator', {storage: {getDirectory}});
  return {chunks, writable, handle, directory, getDirectory};
}

describe('streaming ZIP exports', () => {
  it('finishes a readable archive before downloading its disk-backed file', async () => {
    const {handle, writable, directory} = storage();
    const result = await downloadStreamingZip('scene.zip', new AbortController().signal, async add => {
      await add('sparse/0/cameras.bin', new Blob([new Uint8Array([1,2,3])]));
      await add('images/cam/é.png', new Blob(['original bytes']));
      return 42;
    });
    expect(result).toBe(42);
    expect(writable.close.mock.invocationCallOrder[0]).toBeLessThan(handle.getFile.mock.invocationCallOrder[0]);
    expect(handle.getFile.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(downloadBlob).mock.invocationCallOrder[0]);
    const [file, filename] = vi.mocked(downloadBlob).mock.calls[0];
    expect(filename).toBe('scene.zip');
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    expect([...entries['sparse/0/cameras.bin']]).toEqual([1,2,3]);
    expect(new TextDecoder().decode(entries['images/cam/é.png'])).toBe('original bytes');
    expect(directory.removeEntry).not.toHaveBeenCalled();
  });

  it('honors sink backpressure instead of reading the next original early', async () => {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const write = vi.fn(async (chunk: Uint8Array) => { await blocked; chunks.push(new Uint8Array(chunk)); });
    const next = vi.fn();
    const pending = writeStreamingZip(new WritableStream({write}), new AbortController().signal, async add => {
      await add('first', new Blob(['first'])); next(); await add('second', new Blob(['second']));
    });
    await vi.waitFor(() => expect(write).toHaveBeenCalled()); expect(next).not.toHaveBeenCalled();
    release(); await pending;
    expect(next).toHaveBeenCalledOnce();
    expect(Object.keys(unzipSync(new Uint8Array(await new Blob(chunks).arrayBuffer())))).toEqual(['first','second']);
  });

  it('deletes staged bytes and starts no download when a late mandatory photo is missing', async () => {
    const {writable, directory} = storage();
    await expect(downloadStreamingZip('scene.zip', new AbortController().signal, async add => {
      await add('images/first.png', new Blob(['first'])); throw new Error('Missing second photo');
    })).rejects.toThrow('Missing second photo');
    expect(downloadBlob).not.toHaveBeenCalled(); expect(writable.abort).toHaveBeenCalledOnce();
    expect(directory.removeEntry).toHaveBeenCalledWith(expect.stringMatching(/^export-/));
  });

  it('stops the producer and cleans partial output when disk quota is exhausted', async () => {
    const {writable, directory} = storage(), next = vi.fn();
    writable.write.mockRejectedValueOnce(new DOMException('Quota full', 'QuotaExceededError'));
    await expect(downloadStreamingZip('scene.zip', new AbortController().signal, async add => {
      await add('first', new Blob(['first'])); next();
    })).rejects.toThrow(/Not enough browser storage/);
    expect(next).not.toHaveBeenCalled(); expect(downloadBlob).not.toHaveBeenCalled();
    expect(directory.removeEntry).toHaveBeenCalled();
  });

  it('cancels while waiting for another original, deletes the spool and never downloads it', async () => {
    const {writable, directory} = storage(), controller = new AbortController();
    let reading = false;
    const pending = downloadStreamingZip('scene.zip', controller.signal, async (add, signal) => {
      await add('first', new Blob(['first'])); reading = true;
      await awaitWithAbort(new Promise<void>(() => {}), signal);
    });
    const rejected = expect(pending).rejects.toMatchObject({name: 'AbortError'});
    await vi.waitFor(() => expect(reading).toBe(true)); controller.abort(); await rejected;
    expect(writable.abort).toHaveBeenCalledOnce(); expect(directory.removeEntry).toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('preserves small exports when browser storage is disabled', async () => {
    const {getDirectory} = storage(); getDirectory.mockRejectedValueOnce(new DOMException('Denied', 'SecurityError'));
    await downloadStreamingZip('scene.zip', new AbortController().signal, async add => {
      await add('first', new Blob(['first']));
    });
    expect(downloadBlob).toHaveBeenCalledOnce();
    const [file] = vi.mocked(downloadBlob).mock.calls[0];
    expect(new TextDecoder().decode(unzipSync(new Uint8Array(await file.arrayBuffer())).first)).toBe('first');
  });

  it('bounds the memory fallback when storage is unavailable and the archive exceeds 256 MiB', async () => {
    storage(); vi.stubGlobal('navigator', {});
    // Reuse a lazy Blob backing store; no collection of original files is held by the producer.
    const block = new Blob([new Uint8Array(1024 * 1024)]);
    const large = new Blob(Array.from({length: 64}, () => block));
    await expect(downloadStreamingZip('scene.zip', new AbortController().signal, async add => {
      for (let i = 0; i < 5; i++) await add(`${i}.bin`, large);
    })).rejects.toThrow(/Large exports require writable browser storage/);
    expect(downloadBlob).not.toHaveBeenCalled();
  }, 15000);

  it('reports quota failures during writer creation without retrying in memory', async () => {
    const {handle} = storage(), content = vi.fn(async () => {});
    handle.createWritable.mockRejectedValueOnce(new DOMException('Full', 'QuotaExceededError'));
    await expect(downloadStreamingZip('scene.zip', new AbortController().signal, content)).rejects.toThrow(/Not enough browser storage/);
    expect(content.mock.calls.length).toBeLessThanOrEqual(1);
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
