import { Zip, ZipPassThrough } from 'fflate';
import { ARCHIVE_SIZE_LIMIT } from '../../utils/zipValidation';
import { awaitWithAbort } from '../../utils/awaitWithAbort';
import { DATASET_VIEWER_SETTINGS_FILE, serializeDatasetViewerSettings } from '../../utils/datasetViewerSettings';
import { HfError } from '../huggingface/http';
import { publicationPath } from './publicationPaths';
import { createArchiveImageEncoder } from '../../archive/archiveService';
import { releasePublicationAsset, releasePublicationAssets } from './publicationAssets';
import { summarizePublicationAssets } from './publicationSummary';
import { PUBLICATION_JPEG_QUALITY, type PreparedPublication, type PublishAsset, type PublicationImageFormat } from './types';

export type ArchiveProgress = (message: string, filesDone: number, filesTotal: number) => void;
const BLOB_PART_BYTES = 8 * 1024 * 1024;
const archiveTooLarge = () => new HfError('The dataset ZIP exceeds the 2 GiB archive limit. Use a smaller dataset or splat.', undefined, true);

/** Store original bytes or opt-in JPEG image copies; Blob parts avoid a dataset-sized JS allocation. */
export async function packagePublicationZip(assets: PublishAsset[], signal: AbortSignal,
  progress: ArchiveProgress, assertCurrent: () => void,
  options: { sizeLimit?: number; onChunk?: (bytes: Uint8Array) => void; imageFormat?: PublicationImageFormat;
    createImageEncoder?: () => ReturnType<typeof createArchiveImageEncoder> } = {}) {
  const sizeLimit = options.sizeLimit ?? ARCHIVE_SIZE_LIMIT;
  const check = () => { signal.throwIfAborted(); assertCurrent(); };
  let encoder: ReturnType<typeof createArchiveImageEncoder> | undefined;
  try {
    check();
    if (assets.length > 60_000) throw new HfError('This dataset has too many files for a ZIP archive.', undefined, true);
    // JPEG output size is unknown until encoding; originals must not reject a ZIP that would fit after conversion.
    if (assets.reduce((sum, asset) => sum + (options.imageFormat === 'jpeg' && asset.kind === 'image'
      ? 0 : asset.size ?? asset.estimatedSize ?? 0), 0) > sizeLimit) throw archiveTooLarge();
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
        const original = await awaitWithAbort(asset.open(signal), signal);
        check();
        const toJpeg = options.imageFormat === 'jpeg' && asset.kind === 'image';
        if (!toJpeg && original.size + total > sizeLimit) throw archiveTooLarge();
        if (asset.size !== null && asset.size !== original.size) throw new HfError(`The source file ${asset.path} changed. Publish again.`, undefined, true);
        let blob = original;
        if (toJpeg) {
          progress(`Converting ${asset.path} to JPEG…`, index, assets.length);
          check();
          encoder ??= options.createImageEncoder?.() ?? createArchiveImageEncoder({ signal });
          try { blob = await encoder.encode(original, PUBLICATION_JPEG_QUALITY, signal); }
          catch (error) {
            check();
            throw new HfError(`JPEG conversion failed for ${asset.path}: ${error instanceof Error ? error.message : 'Choose Source formats instead.'}`, undefined, true);
          }
          check();
          if (blob.size + total > sizeLimit) throw archiveTooLarge();
        }
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
  } finally { await encoder?.close(); releasePublicationAssets(assets); }
}

/** Repositories retain a cover and settings sidecar; object storage needs only the ZIP. */
export async function packageZipPublication(prepared: PreparedPublication, signal: AbortSignal,
  progress: (message: string) => void, assertCurrent: () => void,
  options: { repositorySidecars?: boolean } = {}): Promise<PreparedPublication> {
  const payload = prepared.assets.filter(asset => !options.repositorySidecars || asset.kind !== 'preview');
  const sidecars = options.repositorySidecars ? prepared.assets.filter(asset => asset.kind === 'preview') : [];
  try {
    const { blob, files } = await packagePublicationZip(payload, signal, message => progress(message), assertCurrent,
      { imageFormat: prepared.imageFormat });
    const path = 'dataset.zip';
    if (options.repositorySidecars) {
      const settings = new Blob([serializeDatasetViewerSettings(prepared.viewerState)]);
      sidecars.push({ path: DATASET_VIEWER_SETTINGS_FILE, kind: 'viewer-state', size: settings.size,
        open: async target => { target.throwIfAborted(); return settings; } });
    }
    const summary = summarizePublicationAssets({ ...prepared, assets: [...payload, ...sidecars] }, 'zip');
    return { ...prepared, archive: { path, size: blob.size, files, summary }, assets: [
      { path, kind: 'archive', size: blob.size, open: async target => { target.throwIfAborted(); return blob; } }, ...sidecars,
    ] };
  } catch (error) { releasePublicationAssets(sidecars); throw error; }
}
