import { storeArchiveStream, releaseArchiveTemporaryLease, removeArchiveTemporaryFile, ArchiveStorageUnavailableError } from '../archive/temporaryStorage';
import { downloadBlob } from '../utils/download';
import { anySignal } from '../utils/abortSignals';
import { awaitWithAbort } from '../utils/awaitWithAbort';

export type AddZipBlob = (path: string, blob: Blob) => Promise<void>;
const MEMORY_FALLBACK_LIMIT = 256 * 1024 * 1024;

/** Preserve small exports on older browsers and when private/site storage is disabled. */
async function downloadMemoryZip<T>(filename: string, signal: AbortSignal,
  content: (add: AddZipBlob, signal: AbortSignal) => Promise<T>): Promise<T> {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  try {
    const result = await writeStreamingZip(new WritableStream<Uint8Array>({ write(chunk) {
      signal.throwIfAborted();
      bytes += chunk.byteLength;
      if (bytes > MEMORY_FALLBACK_LIMIT) {
        throw new Error('Large exports require writable browser storage. Use Save ZIP to file if available, allow site storage, export a smaller selection, or export the model only.');
      }
      chunks.push(new Uint8Array(chunk));
    }}), signal, add => content(add, signal));
    signal.throwIfAborted();
    downloadBlob(new Blob(chunks, {type: 'application/zip'}), filename);
    return result;
  } finally { chunks.length = 0; }
}

/** Sequential STORE entries with backpressure, ZIP64 as needed, and no accumulated archive buffer. */
export async function writeStreamingZip<T>(writable: WritableStream<Uint8Array>, signal: AbortSignal,
  content: (add: AddZipBlob) => Promise<T>, options: { preventClose?: boolean } = {}): Promise<T> {
  signal.throwIfAborted();
  // Native/core avoids loading compression WASM and worker bundles for uncompressed originals.
  const { ZipWriter, BlobReader } = await import('@zip.js/zip.js/lib/zip-core-native.js');
  signal.throwIfAborted();
  const zip = new ZipWriter(writable, { level: 0, bufferedWrite: false, useWebWorkers: false, signal, preventClose: options.preventClose });
  const result = await content(async (path, blob) => {
    signal.throwIfAborted();
    await zip.add(path, new BlobReader(blob));
    signal.throwIfAborted();
  });
  signal.throwIfAborted();
  await zip.close();
  signal.throwIfAborted();
  return result;
}

/** The chosen file is committed only after a complete, validated ZIP has been written. */
export async function saveStreamingZip<T>(handle: FileSystemFileHandle, signal: AbortSignal,
  content: (add: AddZipBlob, signal: AbortSignal) => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  let writable: FileSystemWritableFileStream | undefined;
  try {
    writable = await awaitWithAbort(handle.createWritable({ keepExistingData: false }), signal,
      late => { void late.abort(signal.reason).catch(() => {}); });
    const result = await writeStreamingZip(writable, signal, add => content(add, signal), { preventClose: true });
    signal.throwIfAborted();
    // close() commits the file. Once it starts, report the result of that commit;
    // a late cancellation cannot roll back a successfully saved file.
    await writable.close();
    return result;
  } catch (error) {
    await writable?.abort(error).catch(() => {});
    signal.throwIfAborted();
    if ((error as Error)?.name === 'QuotaExceededError') {
      throw new Error('Not enough disk space to save this ZIP. Choose another drive or export a smaller selection.', { cause: error });
    }
    throw error;
  }
}

/** Stage to disk so a missing late photo cannot produce a partially successful download. */
export async function downloadStreamingZip<T>(filename: string, signal: AbortSignal,
  content: (add: AddZipBlob, signal: AbortSignal) => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  const name = `export-${crypto.randomUUID()}`;
  const controller = new AbortController();
  const exportSignal = anySignal([signal, controller.signal]);
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  let storageError: unknown;
  // Observe failure immediately: a quota/setup error must also stop fetching further originals.
  const stored = storeArchiveStream(stream.readable, name, exportSignal).then(file => file, error => {
    storageError = error;
    controller.abort(error);
    return null;
  });
  try {
    const result = await writeStreamingZip(stream.writable, exportSignal, add => content(add, exportSignal));
    const file = await stored;
    exportSignal.throwIfAborted();
    if (!file) throw storageError;
    downloadBlob(file, filename);
    // A download has no web completion event. Keep its disk source for at least 24 hours;
    // subsequent archive operations reclaim expired exports, without touching active writers.
    await releaseArchiveTemporaryLease(name).catch(() => {});
    return result;
  } catch (error) {
    controller.abort(error);
    await stream.writable.abort(error).catch(() => {});
    await stored;
    await removeArchiveTemporaryFile(name).catch(() => {});
    signal.throwIfAborted();
    const failure = storageError ?? error;
    const storageCause = failure instanceof ArchiveStorageUnavailableError ? failure.cause : failure;
    if ((storageCause as Error)?.name === 'QuotaExceededError') {
      throw new Error('Not enough browser storage for this export. Use Save ZIP to file if available, free disk/site storage, export a smaller selection, or export the model only.', { cause: failure });
    }
    if (failure instanceof ArchiveStorageUnavailableError) {
      return downloadMemoryZip(filename, signal, content);
    }
    throw failure;
  }
}
