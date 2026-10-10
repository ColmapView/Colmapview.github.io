import { Zip, ZipPassThrough } from 'fflate';
import { createMD5 } from 'hash-wasm';
import type { PublicationInput } from '../datasetPublishing/preparePublication';
import { prepareTransferPublication } from '../datasetPublishing/prepareTransferPublication';
import { publicationPath } from '../datasetPublishing/publicationPaths';
import type { PreparedPublication, PublishAsset } from '../datasetPublishing/types';
import { ARCHIVE_SIZE_LIMIT } from '../../utils/zipValidation';
import { awaitWithAbort } from '../../utils/awaitWithAbort';
import { GoogleDrivePublishError } from './upload';

export interface DriveArchive { blob: Blob; md5: string; viewerBaseUrl: string }
export type DriveArchiveProgress = (message: string, filesDone: number, filesTotal: number) => void;
const archiveTooLarge = () => new GoogleDrivePublishError('The dataset ZIP exceeds the Drive publisher’s 2 GiB archive limit. Use a smaller dataset or splat.', undefined, true);

/** Store ZIP entries as browser Blob parts rather than one dataset-sized JS array. */
export async function packageDriveArchive(prepared: PreparedPublication, signal: AbortSignal,
  progress: DriveArchiveProgress, assertCurrent: () => void, sizeLimit = ARCHIVE_SIZE_LIMIT): Promise<DriveArchive> {
  const check = () => { signal.throwIfAborted(); assertCurrent(); };
  const release = (asset: PublishAsset) => {
    const dropBuffer = asset.release;
    delete asset.release;
    dropBuffer?.();
  };
  try {
    check();
    if (prepared.assets.length > 60_000) throw new GoogleDrivePublishError('This dataset has too many files for a Drive ZIP.', undefined, true);
    if (prepared.assets.reduce((sum, asset) => sum + (asset.size ?? asset.estimatedSize ?? 0), 0) > sizeLimit) throw archiveTooLarge();
    const md5 = await awaitWithAbort(createMD5(), signal);
    check();
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
      md5.update(data);
      buffered += data.byteLength;
      if (buffered >= DRIVE_BLOB_PART_BYTES) flush();
    });
    try {
      for (const [index, asset] of prepared.assets.entries()) {
        check();
        progress(`Packaging ${asset.path}…`, index, prepared.assets.length);
        const blob = await awaitWithAbort(asset.open(signal), signal);
        check();
        if (blob.size + total > sizeLimit) throw archiveTooLarge();
        if (asset.size !== null && asset.size !== blob.size) throw new GoogleDrivePublishError(`The source file ${asset.path} changed. Publish again.`, undefined, true);
        const entry = new ZipPassThrough(publicationPath(asset.path));
        zip.add(entry);
        const reader = blob.stream().getReader();
        try {
          for (;;) {
            const result = await awaitWithAbort(reader.read(), signal);
            check();
            if (result.done) { entry.push(new Uint8Array(), true); break; }
            entry.push(result.value);
            if (failure) throw failure;
          }
        } finally { void reader.cancel().catch(() => {}); }
        if (failure) throw failure;
        release(asset);
        progress(`Packaged ${asset.path}`, index + 1, prepared.assets.length);
      }
      check();
      zip.end();
      if (failure) throw failure;
      flush();
      return { blob: new Blob(parts, { type: 'application/zip' }), md5: md5.digest(), viewerBaseUrl: prepared.viewerBaseUrl };
    } catch (error) { zip.terminate(); throw error; }
  } finally { prepared.assets.forEach(release); }
}
const DRIVE_BLOB_PART_BYTES = 8 * 1024 * 1024;

export async function prepareDriveArchive(input: PublicationInput, signal: AbortSignal,
  progress: DriveArchiveProgress, assertCurrent: () => void, sizeLimit = ARCHIVE_SIZE_LIMIT): Promise<DriveArchive> {
  const prepared = await prepareTransferPublication(input, signal, message => progress(message, 0, 0), assertCurrent,
    { splats: 'active', maxAssetBytes: sizeLimit, maxBufferedMaskBytes: sizeLimit, maskLimitError: archiveTooLarge });
  return packageDriveArchive(prepared, signal, progress, assertCurrent, sizeLimit);
}
