import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import { downloadStreamingZip, saveStreamingZip, writeStreamingZip } from './streamingZipExport';
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

/** Model a native writer's temporary file: only close replaces the existing file. */
function destination(overrides: UnderlyingSink<Uint8Array> = {}) {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let committed = new Blob(['existing file']);
  const close = vi.fn(async () => { committed = new Blob(chunks); });
  const stream = new WritableStream<Uint8Array>({
    write(chunk) { chunks.push(new Uint8Array(chunk)); }, close,
    ...overrides,
  }) as FileSystemWritableFileStream;
  const abort = vi.spyOn(stream, 'abort');
  const handle = { name: 'chosen.zip', createWritable: vi.fn(async () => stream) } as unknown as FileSystemFileHandle;
  return { handle, stream, close, abort, getFile: () => committed };
}

describe('direct ZIP saves', () => {
  it('commits a complete readable ZIP once, without a browser-storage spool or download', async () => {
    const { handle, close, getFile } = destination();
    const { getDirectory } = storage();
    const result = await saveStreamingZip(handle, new AbortController().signal, async add => {
      await add('sparse/0/cameras.bin', new Blob([new Uint8Array([1, 2, 3])]));
      await add('images/é.png', new Blob(['original photo']));
      expect(close).not.toHaveBeenCalled();
      expect(await getFile().text()).toBe('existing file');
      return 7;
    });
    expect(result).toBe(7);
    expect(handle.createWritable).toHaveBeenCalledWith({ keepExistingData: false });
    expect(close).toHaveBeenCalledOnce();
    const entries = unzipSync(new Uint8Array(await getFile().arrayBuffer()));
    expect([...entries['sparse/0/cameras.bin']]).toEqual([1, 2, 3]);
    expect(new TextDecoder().decode(entries['images/é.png'])).toBe('original photo');
    expect(getDirectory).not.toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it.each(['missing photo', 'cancelled'] as const)('preserves an existing destination when a late photo is %s', async failure => {
    const { handle, close, abort, getFile } = destination(), controller = new AbortController();
    await expect(saveStreamingZip(handle, controller.signal, async add => {
      await add('images/first.png', new Blob(['first']));
      if (failure === 'cancelled') { controller.abort(); controller.signal.throwIfAborted(); }
      throw new Error('Missing second photo');
    })).rejects.toThrow(failure === 'cancelled' ? /abort/i : /Missing second photo/);
    expect(close).not.toHaveBeenCalled(); expect(abort).toHaveBeenCalledOnce();
    expect(await getFile().text()).toBe('existing file');
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('aborts a writer that opens after cancellation instead of writing a ZIP', async () => {
    const { handle, stream, abort, close, getFile } = destination();
    let open!: (stream: FileSystemWritableFileStream) => void;
    vi.mocked(handle.createWritable).mockImplementationOnce(() => new Promise(resolve => { open = resolve; }));
    const controller = new AbortController(), content = vi.fn();
    const pending = saveStreamingZip(handle, controller.signal, content);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await rejected;
    open(stream);
    await vi.waitFor(() => expect(abort).toHaveBeenCalledOnce());
    expect(content).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
    expect(await getFile().text()).toBe('existing file');
  });

  it('preserves an existing file when cancellation arrives during ZIP finalization', async () => {
    const controller = new AbortController();
    const { handle, close, abort, getFile } = destination({ write(chunk) {
      // Central-directory records are written after all content callbacks have succeeded.
      if (chunk[0] === 0x50 && chunk[1] === 0x4b && chunk[2] === 1 && chunk[3] === 2) controller.abort();
    } });
    await expect(saveStreamingZip(handle, controller.signal, async add => {
      await add('photo', new Blob(['original']));
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(close).not.toHaveBeenCalled(); expect(abort).toHaveBeenCalledOnce();
    expect(await getFile().text()).toBe('existing file');
  });

  it.each(['open', 'write', 'commit'] as const)('reports disk quota errors during %s without retrying in browser memory', async stage => {
    const error = new DOMException('Disk full', 'QuotaExceededError');
    const { handle, abort, getFile } = destination(stage === 'write' ? { write: () => { throw error; } }
      : stage === 'commit' ? { close: () => { throw error; } } : {});
    if (stage === 'open') vi.mocked(handle.createWritable).mockRejectedValueOnce(error);
    const { getDirectory } = storage();
    await expect(saveStreamingZip(handle, new AbortController().signal, async add => {
      await add('photo', new Blob(['original']));
    })).rejects.toThrow(/Not enough disk space/);
    expect(await getFile().text()).toBe('existing file');
    expect(abort).toHaveBeenCalledTimes(stage === 'open' ? 0 : 1);
    expect(getDirectory).not.toHaveBeenCalled(); expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('reports permission errors without disguising them as quota errors', async () => {
    const { handle } = destination();
    vi.mocked(handle.createWritable).mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    await expect(saveStreamingZip(handle, new AbortController().signal, vi.fn())).rejects.toMatchObject({ name: 'NotAllowedError' });
  });

  it('reports a successful commit even if cancellation arrives after the commit starts', async () => {
    const controller = new AbortController();
    let finish!: () => void, committing = false;
    const { handle, abort } = destination({ close: () => {
      committing = true;
      return new Promise<void>(resolve => { finish = resolve; });
    } });
    const pending = saveStreamingZip(handle, controller.signal, async add => {
      await add('photo', new Blob(['original'])); return 'saved';
    });
    await vi.waitFor(() => expect(committing).toBe(true));
    controller.abort(); finish();
    expect(await pending).toBe('saved'); expect(abort).not.toHaveBeenCalled();
  });
});

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
