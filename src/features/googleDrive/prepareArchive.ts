import { Zip, ZipPassThrough } from 'fflate';
import { createMD5 } from 'hash-wasm';
import { preparePublication, type PublicationInput } from '../datasetPublishing/preparePublication';
import { parseHfAssetUrl, publicationPath } from '../datasetPublishing/publicationPaths';
import type { PreparedPublication } from '../datasetPublishing/types';
import { MAX_BUFFERED_PUBLICATION_FILE_BYTES } from '../datasetPublishing/types';
import { fetchDatasetResource } from '../../utils/fetchDatasetResource';
import { ARCHIVE_SIZE_LIMIT } from '../../utils/zipValidation';
import { readBoundedResponse } from '../../utils/publishedViewerState';
import { buildMaskUrlCandidates } from '../../utils/imageFileLookupPolicy';
import { awaitWithAbort } from '../../utils/awaitWithAbort';
import { GoogleDrivePublishError } from './upload';

export interface DriveArchive { blob: Blob; md5: string; viewerBaseUrl: string }
export type DriveArchiveProgress = (message: string, filesDone: number, filesTotal: number) => void;

/** Store ZIP entries as browser Blob parts rather than one dataset-sized JS array. */
export async function packageDriveArchive(prepared: PreparedPublication, signal: AbortSignal,
  progress: DriveArchiveProgress, assertCurrent: () => void, sizeLimit = ARCHIVE_SIZE_LIMIT): Promise<DriveArchive> {
  const check = () => { signal.throwIfAborted(); assertCurrent(); };
  check();
  if (prepared.assets.length > 60_000) throw new GoogleDrivePublishError('This dataset has too many files for a Drive ZIP.');
  const tooLarge = () => new GoogleDrivePublishError('The dataset ZIP exceeds the viewer’s 2 GiB archive limit. Use a smaller dataset or splat.');
  if (prepared.assets.reduce((sum, asset) => sum + (asset.size ?? 0), 0) > sizeLimit) throw tooLarge();
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
    if (total > sizeLimit) { failure = tooLarge(); return; }
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
      if ((asset.size !== null && asset.size !== blob.size) || blob.size + total > sizeLimit) {
        if (blob.size + total > sizeLimit) throw tooLarge();
        throw new GoogleDrivePublishError(`The source file ${asset.path} changed. Publish again.`);
      }
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
      progress(`Packaged ${asset.path}`, index + 1, prepared.assets.length);
    }
    check();
    zip.end();
    if (failure) throw failure;
    flush();
    return { blob: new Blob(parts, { type: 'application/zip' }), md5: md5.digest(), viewerBaseUrl: prepared.viewerBaseUrl };
  } catch (error) { zip.terminate(); throw error; }
}
const DRIVE_BLOB_PART_BYTES = 8 * 1024 * 1024;

export async function prepareDriveArchive(input: PublicationInput, signal: AbortSignal,
  progress: DriveArchiveProgress, assertCurrent: () => void): Promise<DriveArchive> {
  const sdk = await import('@huggingface/hub');
  const read: typeof fetch = (value, init) => fetchDatasetResource(typeof value === 'string' ? value : value instanceof URL ? value.href : value.url,
    undefined, { ...init, signal });
  const revisions = new Map<string, Promise<string>>();
  const resolveRevision = (repoId: string, revision: string) => {
    const key = `${repoId}/${revision}`;
    if (!revisions.has(key)) revisions.set(key, sdk.datasetInfo({ name: repoId, revision, additionalFields: ['sha'], fetch: read }).then(info => {
      if (info.name !== repoId || !/^[a-f0-9]{40,64}$/i.test(info.sha)) throw new GoogleDrivePublishError('Could not pin the source dataset revision.');
      return info.sha;
    }));
    return revisions.get(key)!;
  };
  const pinAssetUrl = async (value: string): Promise<string> => {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new GoogleDrivePublishError('The dataset has an unsupported remote file URL.');
    if (url.origin !== 'https://huggingface.co') return url.href;
    const parsed = parseHfAssetUrl(value);
    const sha = await resolveRevision(parsed.repoId, parsed.revision);
    parsed.url.pathname = parsed.url.pathname.replace(/(\/resolve\/)[^/]+\//, `$1${sha}/`);
    return parsed.url.href;
  };
  const maskListings = new Map<string, Promise<Set<string>>>();
  const readRemoteMask = async (base: string, name: string): Promise<Blob | null> => {
    let paths: Set<string> | null = null;
    if (new URL(base).origin === 'https://huggingface.co') {
      if (!maskListings.has(base)) maskListings.set(base, (async () => {
        const folder = parseHfAssetUrl(base.replace(/\/?$/, '/'));
        const revision = await resolveRevision(folder.repoId, folder.revision);
        const files = new Set<string>();
        try {
          for await (const file of sdk.listFiles({ repo: { type: 'dataset', name: folder.repoId }, revision, path: folder.path, recursive: true, fetch: read })) {
            if (file.type === 'file') files.add(file.path);
          }
        } catch (error) {
          if (!(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404)) throw error;
        }
        return files;
      })());
      paths = await maskListings.get(base)!;
    }
    for (const candidate of buildMaskUrlCandidates(base, name)) {
      if (paths && !paths.has(parseHfAssetUrl(candidate.url).path)) continue;
      const response = await fetchDatasetResource(await pinAssetUrl(candidate.url), undefined, { signal });
      if (response.status === 404) { await response.body?.cancel(); continue; }
      if (!response.ok) { await response.body?.cancel(); throw new GoogleDrivePublishError(`Could not read the mask for ${name}.`); }
      return readBoundedResponse(response, MAX_BUFFERED_PUBLICATION_FILE_BYTES);
    }
    return null;
  };
  const prepared = await preparePublication({ ...input, splats: 'active' }, signal, {
    resolveRevision, listFiles: async () => [], pinAssetUrl, readRemoteMask, assertCurrent, maxAssetBytes: ARCHIVE_SIZE_LIMIT,
    progress: message => progress(message, 0, 0),
  });
  return packageDriveArchive(prepared, signal, progress, assertCurrent);
}
