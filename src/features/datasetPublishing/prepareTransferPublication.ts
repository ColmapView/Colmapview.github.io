import { preparePublication, type PublicationInput } from './preparePublication';
import { parseHfAssetUrl, pinHfAssetUrl } from './publicationPaths';
import { MAX_BUFFERED_PUBLICATION_FILE_BYTES, type PreparedPublication } from './types';
import { fetchDatasetResource } from '../../utils/fetchDatasetResource';
import { readBoundedResponse } from '../../utils/publishedViewerState';
import { buildMaskUrlCandidates, URL_MASK_ABSENCE_THRESHOLD } from '../../utils/imageFileLookupPolicy';
import { awaitWithAbort } from '../../utils/awaitWithAbort';
import { HfError, boundedFetch } from '../huggingface/http';

/** A malformed URL comes from the captured dataset, so it fails the same way on every retry. */
function parseRemoteUrl(value: string): URL {
  try { return new URL(value); } catch { throw new HfError('The dataset has an invalid remote file URL.', undefined, true); }
}
/** Only Hub dataset files have a revision to pin and a folder to list; model and Space files copy like any other host's. */
const isHubDatasetFile = (value: string) => {
  const url = parseRemoteUrl(value);
  return url.origin === 'https://huggingface.co' && url.pathname.startsWith('/datasets/');
};

/** Shared source pinning and lazy media preparation for object storage and archive publication. */
export async function prepareTransferPublication(input: PublicationInput, signal: AbortSignal,
  progress: (message: string) => void, assertCurrent: () => void,
  options: { maxAssetBytes?: number; maxBufferedMaskBytes?: number; maskLimitError?: () => Error; splats?: 'all' | 'active' } = {}): Promise<PreparedPublication> {
  let sdkPromise: Promise<typeof import('@huggingface/hub')> | undefined;
  const sdk = () => {
    signal.throwIfAborted();
    return awaitWithAbort(sdkPromise ??= import('@huggingface/hub'), signal);
  };
  const read: typeof fetch = (value, init) => fetchDatasetResource(typeof value === 'string' ? value : value instanceof URL ? value.href : value.url,
    undefined, { ...init, signal });
  // Throttled or briefly unavailable hosts, the Hub's API included, get a bounded backoff (429/502/503/504).
  const readSource = boundedFetch(signal, null, read);
  const revisions = new Map<string, Promise<string>>();
  const resolveRevision = (repoId: string, revision: string) => {
    const key = `${repoId}/${revision}`;
    if (!revisions.has(key)) revisions.set(key, (async () => {
      const info = await (await sdk()).datasetInfo({ name: repoId, revision, additionalFields: ['sha'], fetch: readSource });
      // The Hub redirects other spellings and renamed repositories (info.name is its current id); the commit pins the files.
      if (!/^[a-f0-9]{40,64}$/i.test(info.sha)) throw new HfError('Could not pin the source dataset revision.');
      return info.sha;
    })());
    return revisions.get(key)!;
  };
  const pinAssetUrl = async (value: string): Promise<string> => {
    const url = parseRemoteUrl(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new HfError('The dataset has an unsupported remote file URL.', undefined, true);
    return isHubDatasetFile(value) ? pinHfAssetUrl(value, resolveRevision) : url.href;
  };
  const maskListings = new Map<string, Promise<Map<string, number>>>();
  const maskAbsence = new Map<string, { misses: number; found: boolean }>();
  let heldMaskBytes = 0;
  const readRemoteMask = async (base: string, name: string): Promise<{ blob: Blob } | { url: string; size: number } | null> => {
    if (isHubDatasetFile(base)) {
      if (!maskListings.has(base)) maskListings.set(base, (async () => {
        const folder = parseHfAssetUrl(base.replace(/\/?$/, '/'));
        const revision = await resolveRevision(folder.repoId, folder.revision);
        const files = new Map<string, number>();
        try {
          for await (const file of (await sdk()).listFiles({ repo: { type: 'dataset', name: folder.repoId }, revision, path: folder.path, recursive: true, fetch: readSource })) {
            if (file.type === 'file') files.set(file.path, file.size);
          }
        } catch (error) {
          if (!(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404)) throw error;
        }
        return files;
      })());
      const files = await maskListings.get(base)!;
      // The listing proves the mask exists, so it downloads with the images while packaging instead of being held.
      for (const candidate of buildMaskUrlCandidates(base, name)) {
        const size = files.get(parseHfAssetUrl(candidate.url).path);
        if (size !== undefined) return { url: candidate.url, size };
      }
      return null;
    }
    // Like the viewer's mask loader, stop asking a folder that had no mask for the first images (masks/ is a default).
    const absence = maskAbsence.get(base) ?? { misses: 0, found: false };
    maskAbsence.set(base, absence);
    if (!absence.found && absence.misses >= URL_MASK_ABSENCE_THRESHOLD) return null;
    // Like the viewer's mask loader, only names that all answer 404 count toward the folder's absence.
    let absent = true;
    for (const candidate of buildMaskUrlCandidates(base, name)) {
      const url = await pinAssetUrl(candidate.url);
      let response: Response;
      try { response = await readSource(url); } catch (error) {
        // A 404 without CORS headers reaches the browser as a network error; the viewer skips the name too.
        if (signal.aborted || !(error instanceof TypeError)) throw error;
        absent = false; continue;
      }
      // S3 or GCS without list access answers a missing key with 403, which the viewer skips without counting.
      if (response.status === 403) absent = false;
      if (response.status === 404 || response.status === 403) { await response.body?.cancel(); continue; }
      if (!response.ok) {
        await response.body?.cancel();
        throw new HfError(`Could not read the mask for ${name} (HTTP ${response.status}). Retry the publication.`);
      }
      const blob = await readBoundedResponse(response, MAX_BUFFERED_PUBLICATION_FILE_BYTES, () => new HfError(
        `The mask for ${name} (${candidate.filename}) exceeds the 128 MiB publication limit for non-splat files. Shrink it in the source dataset, then publish again.`,
        undefined, true));
      absence.found = true;
      // Without a listing the probe is the download, so the mask is held until packaging; never more than the ZIP can take.
      heldMaskBytes += blob.size;
      if (heldMaskBytes > (options.maxBufferedMaskBytes ?? MAX_BUFFERED_PUBLICATION_FILE_BYTES)) {
        throw options.maskLimitError?.() ?? new HfError('The mask probes exceed the 128 MiB preparation limit. Load the dataset locally before uploading.', undefined, true);
      }
      return { blob };
    }
    if (absent) absence.misses++;
    return null;
  };
  const folderSizes = new Map<string, Promise<Map<string, number>>>();
  /** A Hub file's exact size at the pinned revision, from one listing per folder; other hosts list nothing. */
  const remoteSize = async (value: string): Promise<number | null> => {
    if (!isHubDatasetFile(value)) return null;
    const file = parseHfAssetUrl(value);
    const revision = await resolveRevision(file.repoId, file.revision);
    const folder = file.path.slice(0, Math.max(0, file.path.lastIndexOf('/')));
    const key = `${file.repoId}/${revision}/${folder}`;
    if (!folderSizes.has(key)) folderSizes.set(key, (async () => {
      const sizes = new Map<string, number>();
      try {
        for await (const entry of (await sdk()).listFiles({ repo: { type: 'dataset', name: file.repoId }, revision, path: folder, fetch: readSource })) {
          if (entry.type === 'file') sizes.set(entry.path, entry.size);
        }
      } catch (error) {
        // Unknown sizes only lose the early limit check: packaging still stops at the limit.
        if (signal.aborted) throw error;
      }
      return sizes;
    })());
    return (await folderSizes.get(key)!).get(file.path) ?? null;
  };
  const prepared = await preparePublication({ ...input, ...(options.splats ? { splats: options.splats } : {}) }, signal, {
    resolveRevision, listFiles: async () => [], pinAssetUrl, readRemoteMask, remoteSize, assertCurrent, maxAssetBytes: options.maxAssetBytes,
    progress,
  });
  return prepared;
}
