import type { ArchiveEntry, ArchiveExtractOptions, ArchiveFileEntry, ArchiveReader } from '../types/libarchive';
import { MEDIA_PRIORITY_ORDER } from '../utils/imageFileRequestState';
import { publicAsset } from '../utils/paths';
import { ARCHIVE_INITIALIZATION_TIMEOUT_MS, archiveError, type ArchiveMetadata, type ArchiveOperation,
  type ArchiveRequest, type ArchiveResponse, type ArchiveSource } from './protocol';
import { validateByteRange } from './byteSource';
import { removeArchiveTemporaryFile } from './temporaryStorage';

export type ArchiveWorker = Pick<Worker, 'postMessage' | 'terminate' | 'addEventListener' | 'removeEventListener'>;
export interface ArchiveServiceOptions {
  signal?: AbortSignal;
  createWorker?: () => ArchiveWorker;
  read?: (offset: number, length: number, signal: AbortSignal) => Promise<ArrayBuffer>;
  diskBacked?: boolean;
}
interface Job {
  id: number;
  operation: ArchiveOperation;
  options: ArchiveExtractOptions;
  resolve(response: Extract<ArchiveResponse, { kind: 'result' }>): void;
  reject(error: Error): void;
  controller: AbortController;
  cancel(): void;
  settled: boolean;
}

/** One worker and one active operation; live consumer priorities order the waiting queue. */
export async function openArchiveReader(source: ArchiveSource, options: ArchiveServiceOptions = {}): Promise<ArchiveReader> {
  options.signal?.throwIfAborted();
  const worker = options.createWorker?.() ?? new Worker(new URL('./archive.worker.ts', import.meta.url), { type: 'module' });
  const temporaryName = `archive-${crypto.randomUUID()}`;
  let ready = false, closed = false, nextId = 0;
  let closing: Promise<void> | undefined;
  let active: Job | undefined;
  const queue: Job[] = [];
  const initializationTimer = setTimeout(() => fail(archiveError('Archive worker initialization timed out.')), ARCHIVE_INITIALIZATION_TIMEOUT_MS);

  function settle(job: Job, error?: Error, response?: Extract<ArchiveResponse, { kind: 'result' }>) {
    if (job.settled) return;
    job.settled = true;
    job.options.signal?.removeEventListener('abort', job.cancel);
    if (error) job.reject(error); else job.resolve(response!);
  }
  function dispatch() {
    if (!ready || closed || active || !queue.length) return;
    queue.sort((a, b) => MEDIA_PRIORITY_ORDER[a.options.getPriority?.() ?? a.options.priority ?? 'visible']
      - MEDIA_PRIORITY_ORDER[b.options.getPriority?.() ?? b.options.priority ?? 'visible'] || a.id - b.id);
    active = queue.shift()!;
    try { worker.postMessage({ kind: 'request', id: active.id, operation: active.operation } satisfies ArchiveRequest); }
    catch (error) { fail(error instanceof Error ? error : new Error('Could not send the archive request.')); }
  }
  function request(operation: ArchiveOperation, extractOptions: ArchiveExtractOptions = {}) {
    return new Promise<Extract<ArchiveResponse, { kind: 'result' }>>((resolve, reject) => {
      if (closed) { reject(archiveError('Archive reader is closed.')); return; }
      if (extractOptions.signal?.aborted) { reject(archiveError('Archive operation cancelled.', 'AbortError')); return; }
      const job: Job = { id: ++nextId, operation, options: extractOptions, resolve, reject,
        controller: new AbortController(), settled: false, cancel: () => {} };
      job.cancel = () => {
        job.controller.abort();
        settle(job, archiveError('Archive operation cancelled.', 'AbortError'));
        if (active === job) worker.postMessage({ kind: 'cancel', id: job.id } satisfies ArchiveRequest);
        else { const index = queue.indexOf(job); if (index >= 0) queue.splice(index, 1); }
      };
      extractOptions.signal?.addEventListener('abort', job.cancel, { once: true });
      queue.push(job); dispatch();
    });
  }
  function close(): Promise<void> {
    if (closing) return closing;
    closing = Promise.resolve().then(() => !('kind' in source) && /\.(tar\.gz|tgz)$/i.test(source.name)
      ? removeArchiveTemporaryFile(temporaryName) : undefined);
    closed = true; clearTimeout(initializationTimer);
    worker.removeEventListener('message', onMessage);
    worker.removeEventListener('error', onError);
    worker.removeEventListener('messageerror', onError);
    options.signal?.removeEventListener('abort', abortOpen);
    worker.terminate();
    for (const job of [...queue, ...(active ? [active] : [])]) {
      job.controller.abort(); settle(job, archiveError('Archive reader is closed.', 'AbortError'));
    }
    queue.length = 0; active = undefined;
    return closing;
  }
  function fail(error: Error) {
    for (const job of [...queue, ...(active ? [active] : [])]) settle(job, error);
    void close().catch(() => {});
  }
  const onError = () => fail(new Error('Archive worker stopped unexpectedly. Reload the dataset to retry.'));
  const abortOpen = () => { void close().catch(() => {}); };
  const onMessage = (event: Event) => {
    const response = (event as MessageEvent<ArchiveResponse>).data;
    if (response.kind === 'ready') { ready = true; clearTimeout(initializationTimer); dispatch(); return; }
    if (response.kind === 'read') {
      const ownedJob = active;
      void (async () => {
        try {
          if (!ownedJob || !options.read) throw new Error('Archive byte source is unavailable.');
          validateByteRange(source.size, response.offset, response.length);
          ownedJob.controller.signal.throwIfAborted();
          const bytes = await options.read(response.offset, response.length, ownedJob.controller.signal);
          if (bytes.byteLength !== response.length) throw new Error('Archive range response is incomplete.');
          if (!closed) worker.postMessage({ kind: 'bytes', id: response.id, bytes } satisfies ArchiveRequest, [bytes]);
        } catch (error) {
          if (!closed) worker.postMessage({ kind: 'bytes', id: response.id,
            error: error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Archive range read failed.',
            errorName: error instanceof Error ? error.name : 'Error' } satisfies ArchiveRequest);
        }
      })();
      return;
    }
    if (!active || response.id !== active.id) return;
    settle(active, response.error ? archiveError(response.error, response.errorName) : undefined, response);
    active = undefined; dispatch();
  };
  worker.addEventListener('message', onMessage);
  worker.addEventListener('error', onError);
  worker.addEventListener('messageerror', onError);
  options.signal?.addEventListener('abort', abortOpen, { once: true });
  let metadata: ArchiveMetadata[];
  try {
    metadata = (await request({ kind: 'open', source, temporaryName, diskBacked: options.diskBacked,
      wasmUrl: new URL(publicAsset('workers/libarchive.wasm'), location.href).href }, { signal: options.signal })).entries ?? [];
    options.signal?.throwIfAborted();
  } catch (error) { await close().catch(() => {}); throw error; }
  // Once loaded, caller owns the reader; cancelling its old load must not dispose the installed scene.
  options.signal?.removeEventListener('abort', abortOpen);
  const extract = async (path: string, extractOptions: ArchiveExtractOptions = {}) => {
    const result = await request({ kind: 'extract', path, bounds: extractOptions.bounds }, extractOptions);
    if (!result.file) throw new Error('Archive worker returned no file.');
    return result.file;
  };
  const entries: ArchiveFileEntry[] = metadata.map(item => {
    const slash = item.path.lastIndexOf('/');
    return { path: slash < 0 ? '' : item.path.slice(0, slash), file: {
      name: item.path.slice(slash + 1), size: item.size, lastModified: item.lastModified,
      extract: extractOptions => extract(item.path, { ...extractOptions, bounds: undefined }),
      extractPreview: extractOptions => extract(item.path, extractOptions),
    } };
  });
  const getObject = async (extractAll = false, callback?: (entry: ArchiveFileEntry) => void) => {
    const result: Record<string, ArchiveEntry | object> = Object.create(null);
    for (const entry of entries) {
      let parent = result;
      for (const part of entry.path.split('/').filter(Boolean)) {
        if (!parent[part]) parent[part] = Object.create(null);
        parent = parent[part] as Record<string, ArchiveEntry | object>;
      }
      parent[entry.file.name] = extractAll ? await entry.file.extract() : entry.file;
      callback?.(entry);
    }
    return result;
  };
  return { getFilesArray: async () => entries, getFilesObject: () => getObject(),
    extractFiles: callback => getObject(true, callback), extractSingleFile: path => extract(path), close };
}
