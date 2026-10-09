import { fetchDatasetResource } from './fetchDatasetResource';
import { parseSafeIntegerString } from './numberParsing';
import { ARCHIVE_SIZE_LIMIT } from './zipValidation';
import { ArchiveStorageUnavailableError, canUseArchiveStorage, removeArchiveTemporaryFile, storeArchiveStream } from '../archive/temporaryStorage';
import { REMOTE_ARCHIVE_RANGE_THRESHOLD } from '../archive/protocol';

/** Progress callback payload for ZIP operations */
export interface ZipProgress {
  /** Progress percentage (0-100) */
  percent: number;
  /** Description of current operation */
  message: string;
  /** Bytes downloaded (for download phase) */
  bytesLoaded?: number;
  /** Total bytes (for download phase) */
  bytesTotal?: number;
}

export type ZipProgressCallback = (progress: ZipProgress) => void;

export interface ZipDownloadOptions {
  signal?: AbortSignal;
  fetchImpl?: (url: string, timeout?: number, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
  sizeLimit?: number;
  /** Size from a trusted metadata response when Content-Length is unavailable. */
  expectedSize?: number;
}

const DOWNLOAD_TIMEOUT = 120000;
const temporaryDownloads = new WeakMap<Blob, string>();

export function isArchiveDownloadDiskBacked(blob: Blob): boolean { return temporaryDownloads.has(blob); }

export async function releaseArchiveDownload(blob: Blob): Promise<void> {
  const name = temporaryDownloads.get(blob);
  if (!name) return;
  temporaryDownloads.delete(blob);
  await removeArchiveTemporaryFile(name);
}

/**
 * Download an archive file from URL with progress tracking.
 */
export async function downloadZip(
  url: string,
  onProgress: ZipProgressCallback,
  options: ZipDownloadOptions = {}
): Promise<Blob> {
  return downloadArchive(url, onProgress, options, true);
}

async function downloadArchive(url: string, onProgress: ZipProgressCallback,
  options: ZipDownloadOptions, preferDisk: boolean): Promise<Blob> {
  options.signal?.throwIfAborted();
  const fetchImpl = options.fetchImpl
    ?? ((targetUrl, timeout) => fetchDatasetResource(targetUrl, timeout, { signal: options.signal }));
  const timeoutMs = options.timeoutMs ?? DOWNLOAD_TIMEOUT;

  onProgress({ percent: 2, message: 'Starting download...' });

  const response = await fetchImpl(url, timeoutMs);
  try {
    options.signal?.throwIfAborted();
    if (!response.ok) throw new Error(`Failed to download archive (${response.status})`);

    const contentLength = response.headers.get('content-length');
    const total = options.expectedSize ?? (contentLength ? parseSafeIntegerString(contentLength) ?? 0 : 0);
    const useDisk = Boolean(response.body && preferDisk && (total === 0 || total >= REMOTE_ARCHIVE_RANGE_THRESHOLD)
      && await canUseArchiveStorage(options.signal));
    const sizeLimit = useDisk ? options.sizeLimit ?? ARCHIVE_SIZE_LIMIT : Math.min(options.sizeLimit ?? ARCHIVE_SIZE_LIMIT, ARCHIVE_SIZE_LIMIT);
    validateDownloadedSize(total, sizeLimit);

    let blob: Blob;
    if (useDisk && response.body) {
      const name = `download-${crypto.randomUUID()}`;
      let loaded = 0;
      try {
        blob = await storeArchiveStream(response.body, name, options.signal ?? new AbortController().signal, bytes => {
          loaded += bytes; validateDownloadedSize(loaded, sizeLimit);
          onProgress(getDownloadProgress(loaded, total));
        });
      } catch (error) {
        options.signal?.throwIfAborted();
        if (!(error instanceof ArchiveStorageUnavailableError)) throw error;
        // Setup did not consume the body. Its ownership is settled before a single bounded retry.
        return downloadArchive(url, onProgress, options, false);
      }
      temporaryDownloads.set(blob, name);
    } else {
      blob = response.body ? await readStreamingResponseBlob(response.body, total, onProgress, sizeLimit, options.signal)
        : await response.blob();
    }
    try {
      options.signal?.throwIfAborted();
      validateDownloadedArchiveSize(blob, sizeLimit);
      if (options.expectedSize !== undefined && blob.size !== options.expectedSize) {
        throw new Error('Archive download was incomplete or the file changed. Please retry.');
      }
      return blob;
    } catch (error) {
      await releaseArchiveDownload(blob).catch(() => {}); throw error;
    }
  } catch (error) {
    await response.body?.cancel().catch(() => {});
    throw error;
  }
}

/**
 * Validate downloaded archive size after streaming or fallback blob creation.
 */
export function validateDownloadedArchiveSize(
  blob: Blob,
  sizeLimit: number = ARCHIVE_SIZE_LIMIT
): void {
  validateDownloadedSize(blob.size, sizeLimit);
}

function validateDownloadedSize(size: number, sizeLimit: number): void {
  if (size > sizeLimit) {
    const sizeMB = (size / (1024 * 1024)).toFixed(1);
    throw new Error(`Downloaded archive exceeds size limit (${sizeMB}MB)`);
  }
}

async function readStreamingResponseBlob(
  body: ReadableStream<Uint8Array>,
  total: number,
  onProgress: ZipProgressCallback,
  sizeLimit: number,
  signal?: AbortSignal
): Promise<Blob> {
  const reader = body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;
  const cancel = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });

  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;

      loaded += value.length;
      validateDownloadedSize(loaded, sizeLimit);
      chunks.push(new Uint8Array(value));
      onProgress(getDownloadProgress(loaded, total));
    }
    signal?.throwIfAborted();
  } finally {
    signal?.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {}); reader.releaseLock();
  }

  return new Blob(chunks);
}

function getDownloadProgress(loaded: number, total: number): ZipProgress {
  if (total > 0) {
    const percent = Math.min(40, 2 + Math.round((loaded / total) * 38));
    const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
    const totalMB = (total / (1024 * 1024)).toFixed(1);
    return {
      percent,
      message: `Downloading archive (${loadedMB} / ${totalMB} MB)...`,
      bytesLoaded: loaded,
      bytesTotal: total,
    };
  }

  const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
  return {
    percent: 20,
    message: `Downloading archive (${loadedMB} MB)...`,
    bytesLoaded: loaded,
  };
}
