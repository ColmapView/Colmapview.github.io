import { createArchiveByteSource } from './byteSource';
import { IndexedZipBackend } from './indexedZip';
import { IndexedTarBackend } from './indexedTar';
import { NativeArchiveBackend } from './nativeArchive';
import { createArchiveImagePreview } from './imagePreview';
import { ArchiveStorageUnavailableError, canUseArchiveStorage, storeArchiveStream } from './temporaryStorage';
import { archiveError, type ArchiveRequest, type ArchiveResponse } from './protocol';
import type { ArchiveBackend } from './backend';

const worker = self as unknown as {
  onmessage: (event: MessageEvent<ArchiveRequest>) => void;
  postMessage: (response: ArchiveResponse) => void;
};
let backend: ArchiveBackend | undefined;
let active: { id: number; controller: AbortController } | undefined;
let nextRead = 0;
const reads = new Map<number, { resolve(bytes: ArrayBuffer): void; reject(error: Error): void }>();
const read = (offset: number, length: number) => new Promise<ArrayBuffer>((resolve, reject) => {
  const id = ++nextRead; reads.set(id, { resolve, reject }); worker.postMessage({ kind: 'read', id, offset, length });
});

worker.onmessage = ({ data }) => {
  if (data.kind === 'bytes') {
    const pending = reads.get(data.id); reads.delete(data.id);
    if (data.bytes) pending?.resolve(data.bytes);
    else pending?.reject(archiveError(data.error ?? 'Could not read archive bytes.', data.errorName));
    return;
  }
  if (data.kind === 'cancel') { if (active?.id === data.id) active.controller.abort(); return; }
  if (active) { worker.postMessage({ kind: 'result', id: data.id, error: 'Archive worker received concurrent operations.' }); return; }
  const controller = new AbortController();
  active = { id: data.id, controller };
  void (async () => {
    try {
      const operation = data.operation;
      if (operation.kind === 'open') {
        let source = operation.source;
        let name = source.name;
        let diskBacked = operation.diskBacked;
        if (/\.(tar\.gz|tgz)$/i.test(name) && !('kind' in source)
          && typeof DecompressionStream !== 'undefined' && await canUseArchiveStorage(controller.signal)) {
          try {
            source = await storeArchiveStream(source.stream().pipeThrough(new DecompressionStream('gzip')), operation.temporaryName, controller.signal);
            name = name.replace(/\.(tar\.gz|tgz)$/i, '.tar');
            diskBacked = true;
          } catch (error) {
            controller.signal.throwIfAborted();
            if (!(error instanceof ArchiveStorageUnavailableError) && (error as Error).name !== 'QuotaExceededError') throw error;
            // The original compressed File remains readable by the bounded compatibility codec.
          }
        }
        const bytes = createArchiveByteSource(source, read);
        // OPFS File slices become unreadable after unlink. Returned entries must own their bytes.
        if (diskBacked) bytes.slice = undefined;
        backend = /\.zip$/i.test(name) ? new IndexedZipBackend(bytes)
          : /\.tar$/i.test(name) ? new IndexedTarBackend(bytes) : undefined;
        let entries;
        try { entries = await backend?.list(controller.signal); }
        catch (error) {
          if ((error as Error).name !== 'ArchiveUnsupportedFeatureError' || 'kind' in source) throw error;
          await backend?.close(); backend = undefined;
        }
        if (!backend) {
          if ('kind' in source) throw new Error('This archive format cannot be read using HTTP ranges.');
          backend = await NativeArchiveBackend.open(source, operation.wasmUrl);
          entries = await backend.list(controller.signal);
        }
        controller.signal.throwIfAborted();
        worker.postMessage({ kind: 'result', id: data.id, entries });
      } else {
        if (!backend) throw new Error('Archive reader is closed.');
        let file = await backend.extract(operation.path, controller.signal);
        controller.signal.throwIfAborted();
        if (operation.bounds) file = await createArchiveImagePreview(file, operation.bounds, controller.signal);
        controller.signal.throwIfAborted();
        worker.postMessage({ kind: 'result', id: data.id, file });
      }
    } catch (error) {
      worker.postMessage({ kind: 'result', id: data.id, error: error instanceof Error ? error.message : 'Archive operation failed.',
        errorName: error instanceof Error ? error.name : 'Error' });
    } finally { active = undefined; }
  })();
};
worker.postMessage({ kind: 'ready' });
