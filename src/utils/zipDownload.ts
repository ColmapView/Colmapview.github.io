import { fetchWithTimeout } from './urlUtils';
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
  fetchImpl?: (url: string, timeout?: number) => Promise<Response>;
  timeoutMs?: number;
  sizeLimit?: number;
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
  const fetchImpl = options.fetchImpl ?? fetchWithTimeout;
  const timeoutMs = options.timeoutMs ?? DOWNLOAD_TIMEOUT;

  onProgress({ percent: 2, message: 'Starting download...' });

  const response = await fetchImpl(url, timeoutMs);

  if (!response.ok) {
    throw new Error(`Failed to download archive (${response.status})`);
  }

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseSafeIntegerString(contentLength) ?? 0 : 0;

  if (!response.body) {
    return response.blob();
  }

  const blob = await readStreamingResponseBlob(response.body, total, onProgress);
  validateDownloadedArchiveSize(blob, options.sizeLimit);
  return blob;
}

/**
 * Validate downloaded archive size after streaming or fallback blob creation.
 */
export function validateDownloadedArchiveSize(
  blob: Blob,
  sizeLimit: number = ARCHIVE_SIZE_LIMIT
): void {
  if (blob.size > sizeLimit) {
    const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
    throw new Error(`Downloaded archive exceeds size limit (${sizeMB}MB)`);
  }
}

async function readStreamingResponseBlob(
  body: ReadableStream<Uint8Array>,
  total: number,
  onProgress: ZipProgressCallback
): Promise<Blob> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(new Uint8Array(value));
    loaded += value.length;
    onProgress(getDownloadProgress(loaded, total));
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return new Blob([result]);
}

function getDownloadProgress(loaded: number, total: number): ZipProgress {
  if (total > 0) {
    const percent = 2 + Math.round((loaded / total) * 38);
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
