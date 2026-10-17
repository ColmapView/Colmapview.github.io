import { buildImageUrl, buildMaskUrlCandidates, URL_MASK_ABSENCE_THRESHOLD } from './imageFileLookupPolicy';
import { compressAndResizeToJpeg } from './imageFileCompression';
import { createCoalescedRequestState, createImageFileRequestState } from './imageFileRequestState';
import type { DatasetAccessError, DatasetAccessOptions } from '../dataset/types';
import { createUrlFileCache } from '../dataset/urlFileCache';
import { urlMediaScheduler, type MediaTransferOutcome } from '../dataset/urlMediaScheduler';
import { getFilenameFromUrl } from './urlUtils';

const urlFiles = createUrlFileCache();
const urlImageState = createImageFileRequestState(urlFiles.scope('display'));
const urlMaskState = createImageFileRequestState(urlFiles.scope('mask'));
const maskTransfers = createCoalescedRequestState<MediaTransferOutcome>({ kind: 'aborted' });
const urlRawState = createImageFileRequestState();
const displaySourceSizes = new WeakMap<File,number>();
const imageAliases = new Map<string, string>();
const maskAliases = new Map<string, string[]>();
const maskAbsence = new Map<string, { misses: number; found: boolean }>();

function transferError(result: MediaTransferOutcome, url: string): DatasetAccessError | undefined {
  if (result.kind === 'aborted') return { kind: 'aborted', message: 'Media request cancelled.', url };
  if (result.kind !== 'failure') return undefined;
  return {
    kind: result.status === undefined ? 'network' : 'http', status: result.status, url,
    message: result.message ?? (result.status === 429 ? 'HTTP 429: media rate limit exhausted after retries. Try again later.'
      : result.status ? `HTTP ${result.status}: media request failed.` : 'Network error while loading media.'),
  };
}

export function clearUrlImageCache(): void {
  urlImageState.clear();
  urlRawState.clear();
  imageAliases.clear();
  clearUrlMaskCache();
}

export function clearUrlMaskCache(): void {
  urlMaskState.clear();
  maskTransfers.clear();
  maskAliases.clear();
  maskAbsence.clear();
}

function resolveImageRequestUrl(base: string | null, name: string, explicitUrl?: string) {
  if (explicitUrl) return { url: explicitUrl, filename: getFilenameFromUrl(explicitUrl) };
  return base ? buildImageUrl(base, name) : null;
}

const imageKey = (url: string) => `display:${url}`;
const maskKeys = (base: string, name: string) => buildMaskUrlCandidates(base, name).map(item => `mask:${item.url}`);

/** Source-aware callers resolve aliases without trusting a name from another source. */
export function getUrlImageCached(name: string, base?: string | null, explicitUrl?: string): File | undefined {
  const resolved = base !== undefined || explicitUrl ? resolveImageRequestUrl(base ?? null, name, explicitUrl) : null;
  const key = resolved ? imageKey(resolved.url) : base === undefined ? imageAliases.get(name) : undefined;
  return key ? urlImageState.peekCached(key) : undefined;
}

export function getUrlMaskCached(name: string, base?: string | null, explicitUrl?: string): File | undefined {
  const keys = explicitUrl ? [`mask:${explicitUrl}`] : base ? maskKeys(base, name) : base === undefined ? maskAliases.get(name) : undefined;
  return keys?.map(key => urlMaskState.peekCached(key)).find(file => file !== undefined);
}

export async function fetchUrlImage(
  base: string | null, name: string, explicitUrl?: string, options?: DatasetAccessOptions,
  validateOriginal?: (file: Blob, signal: AbortSignal) => Promise<void>,
): Promise<File | null> {
  const resolved = resolveImageRequestUrl(base, name, explicitUrl);
  if (!resolved || options?.signal?.aborted) return null;
  const key = imageKey(resolved.url);
  imageAliases.set(name, key);
  return urlImageState.request(JSON.stringify([key,options?.maxBytes ?? null]), async context => {
    const cached=urlImageState.getCached(key);
    if (cached) {
      if (options?.maxBytes !== undefined && (displaySourceSizes.get(cached) ?? 0) > options.maxBytes) throw new Error(`${resolved.filename} exceeds its read budget.`);
      return cached;
    }
    const result = await urlMediaScheduler.transfer(resolved.url, { ...context, maxBytes: options?.maxBytes });
    const error = transferError(result, resolved.url);
    if (error) context.reportFailure(error);
    if (result.kind !== 'success' || !context.isCurrent()) return null;
    await validateOriginal?.(result.blob, context.signal);
    const preview=await compressAndResizeToJpeg(result.blob, resolved.filename);
    if (preview && context.isCurrent()) {
      displaySourceSizes.set(preview,result.blob.size);
      urlImageState.setCached(key,preview);
    }
    return preview;
  }, options, false);
}

/** Original image bytes are transient; only simultaneous raw requests coalesce. */
export async function fetchUrlImageRaw(
  base: string | null, name: string, explicitUrl?: string, options?: DatasetAccessOptions,
): Promise<File | null> {
  const resolved = resolveImageRequestUrl(base, name, explicitUrl);
  if (!resolved) return null;
  return urlRawState.request(`raw:${resolved.url}:${options?.maxBytes ?? 'unbounded'}`, async context => {
    const result = await urlMediaScheduler.transfer(resolved.url, { ...context, maxBytes: options?.maxBytes });
    const error = transferError(result, resolved.url);
    if (error) context.reportFailure(error);
    return result.kind === 'success'
      ? new File([result.blob], resolved.filename, { type: result.blob.type || 'application/octet-stream' })
      : null;
  }, options, false);
}

export async function fetchUrlMask(base: string, name: string, options?: DatasetAccessOptions, explicitUrl?: string): Promise<File | null> {
  if (options?.signal?.aborted) return null;
  const candidates = explicitUrl ? [{ url: explicitUrl, filename: getFilenameFromUrl(explicitUrl) }] : buildMaskUrlCandidates(base, name);
  const keys = candidates.map(item => `mask:${item.url}`);
  const key = JSON.stringify([keys, options?.maxBytes ?? null]);
  maskAliases.set(name, keys);
  // An explicit consumer request refreshes recency; synchronous snapshots do not.
  const cached = keys.map(candidateKey => urlMaskState.getCached(candidateKey)).find(file => file !== undefined);
  if (cached && (options?.maxBytes === undefined || cached.size <= options.maxBytes)) return cached;
  const absence = maskAbsence.get(base) ?? { misses: 0, found: false };
  maskAbsence.set(base, absence);
  if (!explicitUrl && !absence.found && absence.misses >= URL_MASK_ABSENCE_THRESHOLD) return null;
  return urlMaskState.request(key, async context => {
    let allAbsent = true;
    let failure: DatasetAccessError | undefined;
    for (const { url, filename } of candidates) {
      const candidateKey = `mask:${url}`;
      const cachedCandidate = urlMaskState.getCached(candidateKey);
      if (cachedCandidate && (options?.maxBytes === undefined || cachedCandidate.size <= options.maxBytes)) return cachedCandidate;
      const result = await maskTransfers.request(`${candidateKey}:${options?.maxBytes ?? 'unbounded'}`,
        transferContext => urlMediaScheduler.transfer(url, { ...transferContext, maxBytes: options?.maxBytes }),
        { signal: context.signal, getPriority: context.getPriority });
      if (!context.isCurrent()) return null;
      if (result.kind === 'success') {
        absence.found = true;
        absence.misses = 0;
        const file = new File([result.blob], filename, { type: result.blob.type || 'image/png' });
        urlMaskState.setCached(candidateKey, file);
        return file;
      }
      if (result.kind !== 'absent') allAbsent = false;
      failure ??= transferError(result, url);
    }
    if (failure) context.reportFailure(failure);
    if (allAbsent && context.isCurrent()) absence.misses += 1;
    return null;
  }, options, false);
}

export async function prefetchUrlImages(
  base: string | null, names: string[], concurrency = 5,
  imageNameToUrl?: Record<string, string>, options: DatasetAccessOptions = {},
): Promise<void> {
  const requestOptions = { ...options, priority: options.priority ?? 'prefetch' } as const;
  const generation = urlImageState.getGeneration();
  const batchSize = Math.max(1, Math.floor(concurrency) || 1);
  for (let i = 0; i < names.length; i += batchSize) {
    if (options.signal?.aborted || generation !== urlImageState.getGeneration()) return;
    await Promise.all(names.slice(i, i + batchSize).map(name => fetchUrlImage(base, name, imageNameToUrl?.[name], requestOptions)));
  }
}

export function getUrlImageCacheStats() { return urlImageState.getStats(); }
export function getUrlMaskCacheStats() { return urlMaskState.getStats(); }

export function getUrlFileRetentionStats() { return urlFiles.getStats(); }
