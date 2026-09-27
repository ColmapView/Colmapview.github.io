import { normalizeZipCompressionLevel, ZIP_MIME_TYPE, type ZipCompressionLevel } from './zipExportPolicy';

export type ZipFiles = Record<string, Uint8Array<ArrayBuffer>>;
export type ZipWorkerRequest = { files: ZipFiles; level: ZipCompressionLevel };
export type ZipWorkerResult = { buffer: ArrayBuffer } | { error: string };

interface ZipCompressionOptions {
  signal?: AbortSignal;
  level?: number;
}

/** One worker owns the archive's buffers and can be terminated during compression. */
export function compressZip(files: ZipFiles, { signal, level }: ZipCompressionOptions = {}): Promise<Blob> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./zipCompression.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    const cleanup = () => {
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    };
    const fail = (error: unknown) => {
      if (settled) return;
      cleanup();
      reject(error);
    };
    const onAbort = () => fail(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    worker.onmessage = ({ data }: MessageEvent<ZipWorkerResult>) => {
      if (settled) return;
      if ('error' in data) { fail(new Error(data.error)); return; }
      cleanup();
      resolve(new Blob([data.buffer], { type: ZIP_MIME_TYPE }));
    };
    worker.onerror = (event) => { event.preventDefault(); fail(new Error(event.message || 'ZIP worker failed.')); };
    worker.onmessageerror = () => fail(new Error('Could not read the ZIP worker result.'));
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      worker.postMessage({ files, level: normalizeZipCompressionLevel(level) } satisfies ZipWorkerRequest,
        [...new Set(Object.values(files).map(bytes => bytes.buffer))]);
    } catch (error) {
      fail(error);
    }
  });
}
