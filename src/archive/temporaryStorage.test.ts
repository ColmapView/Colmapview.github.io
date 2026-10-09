import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARCHIVE_STORAGE_DIRECTORY, cleanupArchiveTemporaryFiles, removeArchiveTemporaryFile, storeArchiveStream } from './temporaryStorage';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function storage() {
  const file = new File(['streamed'], 'temporary');
  const writable = { write: vi.fn(async (_bytes: Uint8Array) => {}), close: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
  const handle = { createWritable: vi.fn(async () => writable), getFile: vi.fn(async () => file) };
  const directory = { getFileHandle: vi.fn(async () => handle), removeEntry: vi.fn(async () => {}) };
  const root = { getDirectoryHandle: vi.fn(async () => directory) };
  const getDirectory = vi.fn(async () => root);
  vi.stubGlobal('navigator', { storage: { getDirectory } });
  return { file, writable, handle, directory, root, getDirectory };
}
const stream = () => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.enqueue(new Uint8Array([3])); controller.close(); } });
describe('temporary archive storage', () => {
  it('streams sequentially to disk and closes the writer before returning the file', async () => {
    const { root, handle, writable, file } = storage(), onChunk = vi.fn();
    expect(await storeArchiveStream(stream(), 'archive-owned', new AbortController().signal, onChunk)).toBe(file);
    expect(root.getDirectoryHandle).toHaveBeenCalledWith(ARCHIVE_STORAGE_DIRECTORY, { create: true });
    expect(writable.write.mock.calls.map(([bytes]) => [...bytes])).toEqual([[1, 2], [3]]);
    expect(onChunk.mock.calls).toEqual([[2], [1]]);
    expect(writable.close.mock.invocationCallOrder[0]).toBeLessThan(handle.getFile.mock.invocationCallOrder[0]);
  });
  it('cancels a stalled stream, aborts its writer and deletes the partially stored archive', async () => {
    const { writable, directory, handle } = storage(), cancel = vi.fn(), controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const pending = storeArchiveStream(body, 'archive-owned', controller.signal);
    const failure = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(handle.createWritable).toHaveBeenCalledOnce()); controller.abort(); await failure;
    expect(cancel).toHaveBeenCalledOnce(); expect(writable.abort).toHaveBeenCalledOnce();
    expect(directory.removeEntry).toHaveBeenCalledWith('archive-owned'); expect(body.locked).toBe(false);
  });
  it('deletes the temporary file after a disk quota error or writer setup failure', async () => {
    const { writable, directory, handle } = storage();
    writable.write.mockRejectedValueOnce(new DOMException('Disk quota exceeded', 'QuotaExceededError'));
    await expect(storeArchiveStream(stream(), 'failed-write', new AbortController().signal)).rejects.toMatchObject({ name: 'QuotaExceededError' });
    expect(directory.removeEntry).toHaveBeenCalledWith('failed-write');
    handle.createWritable.mockRejectedValueOnce(new Error('Writer unavailable'));
    await expect(storeArchiveStream(stream(), 'failed-open', new AbortController().signal)).rejects.toThrow('Writer unavailable');
    expect(directory.removeEntry).toHaveBeenCalledWith('failed-open');
  });
  it('releases its lease and cancels the input if directory access fails after locking', async () => {
    const { root, getDirectory } = storage(), held = new Set<string>(), cancel = vi.fn();
    const request = vi.fn(async (name: string, options: LockOptions, callback: (lock: Lock | null) => unknown) => {
      if (options.ifAvailable) return callback(held.has(name) ? null : { name } as Lock);
      held.add(name); try { return await callback({ name } as Lock); } finally { held.delete(name); }
    });
    Object.assign(navigator, { locks: { request } });
    getDirectory.mockResolvedValueOnce(root)
      .mockRejectedValueOnce(new DOMException('Storage unavailable', 'UnknownError'));
    const body = new ReadableStream<Uint8Array>({ cancel });
    await expect(storeArchiveStream(body, 'download-aabb', new AbortController().signal))
      .rejects.toMatchObject({ name: 'ArchiveStorageUnavailableError' });
    expect(held.size).toBe(0); expect(cancel).toHaveBeenCalledOnce(); expect(body.locked).toBe(false);
  });
  it('cancels the input when cleanup or writer creation fails before the first read', async () => {
    const { handle } = storage();
    handle.createWritable.mockRejectedValueOnce(new DOMException('Writing denied', 'NotAllowedError'));
    const cancel = vi.fn(), body = new ReadableStream<Uint8Array>({ cancel });
    await expect(storeArchiveStream(body, 'failed-open', new AbortController().signal))
      .rejects.toMatchObject({ name: 'ArchiveStorageUnavailableError' });
    expect(cancel).toHaveBeenCalledOnce(); expect(body.locked).toBe(false);
    Object.assign(navigator, { locks: { request: vi.fn() } });
    vi.mocked(navigator.storage.getDirectory).mockRejectedValueOnce(new DOMException('Storage denied', 'SecurityError'));
    const cleanupCancel = vi.fn(), cleanupBody = new ReadableStream<Uint8Array>({ cancel: cleanupCancel });
    await expect(storeArchiveStream(cleanupBody, 'failed-cleanup', new AbortController().signal))
      .rejects.toMatchObject({ name: 'ArchiveStorageUnavailableError' });
    expect(cleanupCancel).toHaveBeenCalledOnce(); expect(cleanupBody.locked).toBe(false);
  });
  it('protects active temporary files and cleans abandoned files after the owner releases its browser lock', async () => {
    const { directory } = storage(), held = new Set<string>();
    const request = vi.fn(async (name: string, options: LockOptions, callback: (lock: Lock | null) => unknown) => {
      if (options.ifAvailable) return callback(held.has(name) ? null : { name } as Lock);
      held.add(name); try { return await callback({ name } as Lock); } finally { held.delete(name); }
    });
    Object.assign(navigator, { locks: { request } });
    Object.assign(directory, { async *keys() { yield 'archive-aabb'; yield 'download-ccdd'; yield 'other.txt'; } });
    const file = await storeArchiveStream(stream(), 'archive-aabb', new AbortController().signal);
    expect(file).toBeDefined(); directory.removeEntry.mockClear();
    await cleanupArchiveTemporaryFiles();
    expect(directory.removeEntry).not.toHaveBeenCalledWith('archive-aabb');
    expect(directory.removeEntry).toHaveBeenCalledWith('download-ccdd');
    expect(directory.removeEntry).not.toHaveBeenCalledWith('other.txt');
    await removeArchiveTemporaryFile('archive-aabb'); expect(held.size).toBe(0);
    directory.removeEntry.mockClear(); await cleanupArchiveTemporaryFiles();
    expect(directory.removeEntry).toHaveBeenCalledWith('archive-aabb');
  });
});
