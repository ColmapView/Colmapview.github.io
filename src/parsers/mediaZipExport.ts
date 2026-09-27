import { appLogger } from '../utils/logger';
import { awaitWithAbort } from '../utils/awaitWithAbort';
import { compressZip, type ZipFiles } from './zipCompression';

export interface MediaZipExportSummary {
  total: number;
  exported: number;
  failed: number;
}

export interface MediaZipExportResult {
  blob: Blob;
  summary: MediaZipExportSummary;
}

export class MediaZipPathConflictError extends Error {
  constructor(path: string) {
    super(`Multiple files would be exported as "${path}".`);
    this.name = 'MediaZipPathConflictError';
  }
}

interface MediaZipExportOptions {
  kind: 'Image' | 'Mask';
  imageNames: string[];
  fetchFile: (imageName: string, signal?: AbortSignal) => Promise<File | null>;
  toZipPath: (imageName: string) => string;
  readFile: (file: File) => Promise<ArrayBuffer>;
  onProgress?: (percent: number, message?: string) => void;
  signal?: AbortSignal;
}

export async function exportMediaZip({
  kind,
  imageNames,
  fetchFile,
  toZipPath,
  readFile,
  onProgress,
  signal,
}: MediaZipExportOptions): Promise<MediaZipExportResult> {
  signal?.throwIfAborted();
  // Validate every output path before fetching so a collision cannot overwrite an entry.
  const paths = new Set<string>();
  const entries = imageNames.map((imageName) => {
    const path = toZipPath(imageName);
    if (paths.has(path)) throw new MediaZipPathConflictError(path);
    paths.add(path);
    return { imageName, path };
  });
  const zipData: ZipFiles = {};
  let processed = 0;
  let exported = 0;

  for (const { imageName, path } of entries) {
    signal?.throwIfAborted();
    let skipped = false;
    try {
      const file = await awaitWithAbort(fetchFile(imageName, signal), signal);
      signal?.throwIfAborted();
      if (file) {
        zipData[path] = new Uint8Array(await awaitWithAbort(readFile(file), signal));
        signal?.throwIfAborted();
        exported++;
      } else {
        skipped = true;
      }
    } catch (err) {
      signal?.throwIfAborted();
      appLogger.warn(`[${kind} Export] Failed to process ${imageName}:`, err);
    }

    processed++;
    const percent = Math.round((processed / entries.length) * 100);
    if (skipped) onProgress?.(percent, `Skipped: ${imageName}`);
    else onProgress?.(percent);
  }

  const summary = { total: entries.length, exported, failed: entries.length - exported };
  if (summary.failed > 0) {
    appLogger.warn(`[${kind} Export] ${summary.failed}/${summary.total} ${kind.toLowerCase()}s failed to export`);
  }

  return { blob: await compressZip(zipData, { signal }), summary };
}
