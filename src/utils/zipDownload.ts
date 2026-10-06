import { fetchDatasetResource } from './fetchDatasetResource';
import { parseSafeIntegerString } from './numberParsing';
import { ARCHIVE_SIZE_LIMIT } from './zipValidation';

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
  fetchImpl?: (url: string, timeout?: number) => Promise<Response>;
  timeoutMs?: number;
  sizeLimit?: number;
  /** Size from a trusted metadata response when Content-Length is unavailable. */
  expectedSize?: number;
}

const DOWNLOAD_TIMEOUT = 120000;

/**
 * Download an archive file from URL with progress tracking.
 */
export async function downloadZip(
  url: string,
  onProgress: ZipProgressCallback,
  options: ZipDownloadOptions = {}
): Promise<Blob> {
  const fetchImpl = options.fetchImpl
    ?? ((targetUrl, timeout) => fetchDatasetResource(targetUrl, timeout, { signal: options.signal }));
  const timeoutMs = options.timeoutMs ?? DOWNLOAD_TIMEOUT;

  onProgress({ percent: 2, message: 'Starting download...' });

  const response = await fetchImpl(url, timeoutMs);

  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new Error(`Failed to download archive (${response.status})`);
  }

  const contentLength = response.headers.get('content-length');
  const total = options.expectedSize ?? (contentLength ? parseSafeIntegerString(contentLength) ?? 0 : 0);

  const sizeLimit = options.sizeLimit ?? ARCHIVE_SIZE_LIMIT;
  try {
    validateDownloadedSize(total, sizeLimit);
  } catch (error) {
    void response.body?.cancel().catch(() => {});
    throw error;
  }

  const blob = response.body
    ? await readStreamingResponseBlob(response.body, total, onProgress, sizeLimit)
    : await response.blob();
  validateDownloadedArchiveSize(blob, sizeLimit);
  if (options.expectedSize !== undefined && blob.size !== options.expectedSize) {
    throw new Error('Archive download was incomplete or the file changed. Please retry.');
  }
  return blob;
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
  sizeLimit: number
): Promise<Blob> {
  const reader = body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      loaded += value.length;
      validateDownloadedSize(loaded, sizeLimit);
      chunks.push(new Uint8Array(value));
      onProgress(getDownloadProgress(loaded, total));
    }
  } finally {
    void reader.cancel().catch(() => {});
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
