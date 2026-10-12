import { createMD5 } from 'hash-wasm';
import type { PublicationInput } from '../datasetPublishing/preparePublication';
import { prepareTransferPublication } from '../datasetPublishing/prepareTransferPublication';
import { packagePublicationZip, type ArchiveProgress } from '../datasetPublishing/packagePublicationZip';
import { releasePublicationAssets } from '../datasetPublishing/publicationAssets';
import type { PreparedPublication, PublicationImageFormat } from '../datasetPublishing/types';
import { ARCHIVE_SIZE_LIMIT } from '../../utils/zipValidation';
import { awaitWithAbort } from '../../utils/awaitWithAbort';
import { HfError } from '../huggingface/http';
import { GoogleDrivePublishError } from './upload';

export interface DriveArchive { blob: Blob; md5: string; viewerBaseUrl: string }
export type DriveArchiveProgress = ArchiveProgress;
const archiveTooLarge = () => new GoogleDrivePublishError('The dataset ZIP exceeds the Drive publisher’s 2 GiB archive limit. Use a smaller dataset or splat.', undefined, true);

/** Drive adds its required checksum to the shared ZIP packager. */
export async function packageDriveArchive(prepared: PreparedPublication, signal: AbortSignal,
  progress: DriveArchiveProgress, assertCurrent: () => void, sizeLimit = ARCHIVE_SIZE_LIMIT): Promise<DriveArchive> {
  try {
    signal.throwIfAborted(); assertCurrent();
    const md5 = await awaitWithAbort(createMD5(), signal);
    const { blob } = await packagePublicationZip(prepared.assets, signal, progress, assertCurrent,
      { sizeLimit, onChunk: bytes => md5.update(bytes), imageFormat: prepared.imageFormat });
    return { blob, md5: md5.digest(), viewerBaseUrl: prepared.viewerBaseUrl };
  } catch (error) {
    if (error instanceof HfError) throw new GoogleDrivePublishError(error.message, error.status, error.permanent);
    throw error;
  } finally { releasePublicationAssets(prepared.assets); }
}

export async function prepareDriveArchive(input: PublicationInput, signal: AbortSignal,
  progress: DriveArchiveProgress, assertCurrent: () => void, sizeLimit = ARCHIVE_SIZE_LIMIT,
  imageFormat: PublicationImageFormat = 'original'): Promise<DriveArchive> {
  const prepared = await prepareTransferPublication(input, signal, message => progress(message, 0, 0), assertCurrent,
    { splats: 'active', maxAssetBytes: sizeLimit, maxBufferedMaskBytes: sizeLimit, maskLimitError: archiveTooLarge, imageFormat });
  return packageDriveArchive(prepared, signal, progress, assertCurrent, sizeLimit);
}
