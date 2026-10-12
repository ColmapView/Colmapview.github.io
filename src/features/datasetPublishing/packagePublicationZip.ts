import { Zip, ZipPassThrough } from 'fflate';
import { ARCHIVE_SIZE_LIMIT } from '../../utils/zipValidation';
import { awaitWithAbort } from '../../utils/awaitWithAbort';
import { DATASET_VIEWER_SETTINGS_FILE, serializeDatasetViewerSettings } from '../../utils/datasetViewerSettings';
import { HfError } from '../huggingface/http';
import { publicationPath } from './publicationPaths';
import { releasePublicationAsset, releasePublicationAssets } from './publicationAssets';
import type { PreparedPublication, PublishAsset } from './types';

export type ArchiveProgress = (message: string, filesDone: number, filesTotal: number) => void;
const BLOB_PART_BYTES = 8 * 1024 * 1024;
const archiveTooLarge = () => new HfError('The dataset ZIP exceeds the 2 GiB archive limit. Use a smaller dataset or splat.', undefined, true);

/** Stored entries preserve original bytes; Blob parts avoid a dataset-sized JS allocation. */
export async function packagePublicationZip(assets: PublishAsset[], signal: AbortSignal,
  progress: ArchiveProgress, assertCurrent: () => void,
  options: { sizeLimit?: number; onChunk?: (bytes: Uint8Array) => void } = {}) {
  const sizeLimit = options.sizeLimit ?? ARCHIVE_SIZE_LIMIT;
  const check = () => { signal.throwIfAborted(); assertCurrent(); };
  try {
    check();
    if (assets.length > 60_000) throw new HfError('This dataset has too many files for a ZIP archive.', undefined, true);
    if (assets.reduce((sum, asset) => sum + (asset.size ?? asset.estimatedSize ?? 0), 0) > sizeLimit) throw archiveTooLarge();
    const paths = assets.map(asset => publicationPath(asset.path));
    if (new Set(paths.map(path => path.normalize('NFC'))).size !== paths.length) throw new HfError('Two selected files use the same ZIP path.', undefined, true);
    const files: Array<{ path: string; size: number }> = [];
    const parts: Blob[] = [];
    let chunks: Uint8Array<ArrayBuffer>[] = [];
    let buffered = 0;
    let total = 0;
    let failure: Error | null = null;
    const flush = () => { if (chunks.length) parts.push(new Blob(chunks)); chunks = []; buffered = 0; };
    const zip = new Zip((error, data) => {
      if (error) { failure = error; return; }
      total += data.byteLength;
      if (total > sizeLimit) { failure = archiveTooLarge(); return; }
      chunks.push(new Uint8Array(data));
      options.onChunk?.(data);
      buffered += data.byteLength;
      if (buffered >= BLOB_PART_BYTES) flush();
    });
    try {
      for (const [index, asset] of assets.entries()) {
        check();
        progress(`Packaging ${asset.path}…`, index, assets.length);
        check();
        const blob = await awaitWithAbort(asset.open(signal), signal);
        check();
        if (blob.size + total > sizeLimit) throw archiveTooLarge();
        if (asset.size !== null && asset.size !== blob.size) throw new HfError(`The source file ${asset.path} changed. Publish again.`, undefined, true);
        const entry = new ZipPassThrough(paths[index]);
        zip.add(entry);
        if (failure) throw failure;
        const reader = blob.stream().getReader();
        try {
          for (;;) {
            const result = await awaitWithAbort(reader.read(), signal);
            check();
            if (result.done) { entry.push(new Uint8Array(), true); break; }
            entry.push(result.value);
            if (failure) throw failure;
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        if (failure) throw failure;
        files.push({ path: paths[index], size: blob.size });
        releasePublicationAsset(asset);
        progress(`Packaged ${asset.path}`, index + 1, assets.length);
      }
      check();
      zip.end();
      if (failure) throw failure;
      flush();
      return { blob: new Blob(parts, { type: 'application/zip' }), files };
    } catch (error) { zip.terminate(); throw error; }
  } finally { releasePublicationAssets(assets); }
}

/** Repositories retain a cover and settings sidecar; object storage needs only the ZIP. */
export async function packageZipPublication(prepared: PreparedPublication, signal: AbortSignal,
  progress: (message: string) => void, assertCurrent: () => void,
  options: { repositorySidecars?: boolean } = {}): Promise<PreparedPublication> {
  const payload = prepared.assets.filter(asset => !options.repositorySidecars || asset.kind !== 'preview');
  const sidecars = options.repositorySidecars ? prepared.assets.filter(asset => asset.kind === 'preview') : [];
  try {
    const { blob, files } = await packagePublicationZip(payload, signal, message => progress(message), assertCurrent);
    const path = 'dataset.zip';
    if (options.repositorySidecars) {
      const settings = new Blob([serializeDatasetViewerSettings(prepared.viewerState)]);
      sidecars.push({ path: DATASET_VIEWER_SETTINGS_FILE, kind: 'viewer-state', size: settings.size,
        open: async target => { target.throwIfAborted(); return settings; } });
    }
    return { ...prepared, archive: { path, size: blob.size, files }, assets: [
      { path, kind: 'archive', size: blob.size, open: async target => { target.throwIfAborted(); return blob; } }, ...sidecars,
    ] };
  } catch (error) { releasePublicationAssets(sidecars); throw error; }
}
