export const ARCHIVE_STORAGE_DIRECTORY = 'colmapview-archive-cache';
const temporaryLeases = new Map<string, { release(): void; done: Promise<unknown> }>();
const lockName = (name: string) => `${ARCHIVE_STORAGE_DIRECTORY}:${name}`;

async function acquireTemporaryLease(name: string, signal: AbortSignal): Promise<void> {
  if (typeof navigator.locks?.request !== 'function') return;
  let release!: () => void, acquired!: () => void, reject!: (reason: unknown) => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>((resolve, fail) => { acquired = resolve; reject = fail; });
  const done = navigator.locks.request(lockName(name), { signal }, () => { acquired(); return held; });
  void done.catch(reject);
  await ready;
  temporaryLeases.set(name, { release, done });
}

async function releaseTemporaryLease(name: string): Promise<void> {
  const lease = temporaryLeases.get(name);
  temporaryLeases.delete(name);
  lease?.release(); await lease?.done;
}

/** A released browser lock identifies files abandoned by a reload/crash, across tabs and workers. */
export async function cleanupArchiveTemporaryFiles(): Promise<void> {
  if (!hasArchiveStorage() || typeof navigator.locks?.request !== 'function') return;
  const directory = await archiveStorageDirectory() as FileSystemDirectoryHandle & { keys(): AsyncIterable<string> };
  if (typeof directory.keys !== 'function') return;
  for await (const name of directory.keys()) {
    if (!/^(archive|download)-[\da-f-]+$/i.test(name)) continue;
    await navigator.locks.request(lockName(name), { ifAvailable: true }, async lock => {
      if (lock) await directory.removeEntry(name).catch(() => {});
    });
  }
}

export function hasArchiveStorage(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

/** API presence alone does not imply access, e.g. when browser storage is disabled. */
export async function canUseArchiveStorage(signal?: AbortSignal): Promise<boolean> {
  signal?.throwIfAborted();
  if (!hasArchiveStorage()) return false;
  try { await archiveStorageDirectory(); }
  catch { signal?.throwIfAborted(); return false; }
  signal?.throwIfAborted();
  return true;
}

export class ArchiveStorageUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`Browser archive storage is unavailable: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = 'ArchiveStorageUnavailableError';
  }
}

export async function archiveStorageDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(ARCHIVE_STORAGE_DIRECTORY, { create: true });
}

export async function removeArchiveTemporaryFile(name: string): Promise<void> {
  try {
    if (!hasArchiveStorage()) return;
    const directory = await archiveStorageDirectory();
    for (let attempt = 0; attempt < 4; attempt++) {
      try { await directory.removeEntry(name); return; }
      catch (error) {
        if ((error as DOMException).name === 'NotFoundError' && attempt === 3) return;
        if (attempt === 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  } finally { await releaseTemporaryLease(name); }
}

/** Disk-backed streaming keeps large compressed/remote archives out of JS/WASM buffers. */
export async function storeArchiveStream(stream: ReadableStream<Uint8Array>, name: string,
  signal: AbortSignal, onChunk?: (bytes: number) => void): Promise<File> {
  const reader = stream.getReader();
  const cancel = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  let writable: FileSystemWritableFileStream | undefined;
  let setupComplete = false, complete = false;
  try {
    signal.throwIfAborted();
    await cleanupArchiveTemporaryFiles();
    await acquireTemporaryLease(name, signal);
    const directory = await archiveStorageDirectory();
    signal.throwIfAborted();
    const handle = await directory.getFileHandle(name, { create: true });
    writable = await handle.createWritable();
    setupComplete = true;
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      signal.throwIfAborted();
      onChunk?.(value.length);
      await writable.write(value as Uint8Array<ArrayBuffer>);
    }
    signal.throwIfAborted();
    await writable.close();
    const file = await handle.getFile();
    complete = true;
    return file;
  } catch (error) {
    signal.throwIfAborted();
    if (!setupComplete) throw new ArchiveStorageUnavailableError(error);
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    if (!complete) {
      await writable?.abort().catch(() => {});
      // Removal also releases the lease when storage access itself has failed.
      await removeArchiveTemporaryFile(name).catch(() => {});
    }
  }
}
