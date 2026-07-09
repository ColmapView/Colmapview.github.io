/**
 * URL utilities for fetching and normalizing URLs from various Git hosting platforms
 * and cloud storage providers (S3, GCS, R2).
 */

import type { UrlLoadError } from '../types/manifest';
import { detectCloudProvider, getCorsInstructions } from './urlCloudStorage';
import { parseSafeIntegerString } from './numberParsing';

/** Reports download progress as bytes arrive. totalBytes is 0 when unknown. */
export type DownloadProgressCallback = (loadedBytes: number, totalBytes: number) => void;

export {
  detectCloudProvider,
  getCorsInstructions,
  isPreSignedUrl,
  normalizeCloudStorageUrl,
} from './urlCloudStorage';

// Timeout for individual file fetches (30 seconds)
export const FETCH_TIMEOUT = 30000;

/**
 * Fetch with timeout support.
 */
export async function fetchWithTimeout(url: string, timeout: number = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Classify error type from fetch error.
 */
export function classifyFetchError(err: unknown, url?: string): UrlLoadError {
  if (err instanceof Error) {
    // AbortError from timeout
    if (err.name === 'AbortError') {
      return {
        type: 'timeout',
        message: 'Request timed out',
        details: `The request to ${url || 'the server'} took too long to respond.`,
        failedFile: url,
      };
    }

    // CORS errors typically appear as TypeError with network failure message
    if (err.name === 'TypeError' && (
      err.message.includes('Failed to fetch') ||
      err.message.includes('NetworkError') ||
      err.message.includes('CORS')
    )) {
      return {
        type: 'cors',
        message: 'Cross-origin request blocked',
        details: 'This URL does not allow cross-origin requests. The server needs to include CORS headers.',
        failedFile: url,
      };
    }

    // Generic network error
    if (err.name === 'TypeError') {
      return {
        type: 'network',
        message: 'Network error',
        details: err.message,
        failedFile: url,
      };
    }

    return {
      type: 'unknown',
      message: err.message,
      failedFile: url,
    };
  }

  return {
    type: 'unknown',
    message: String(err),
    failedFile: url,
  };
}

/**
 * Create a File object from fetched blob.
 */
export function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type });
}

/**
 * Percent-encode each segment of a relative URL path, preserving slashes.
 * Splat tile filenames can contain characters like '#' (e.g.
 * `splats/5x5#-5_-10.ply`); left raw, the browser treats `#...` as a URL
 * fragment and the request 404s. Already-safe paths (e.g. `sparse/0/cameras.bin`)
 * are unchanged.
 */
export function encodeUrlPath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * Fetch a splat file from a URL on demand (e.g. when switching to a lazy tile).
 * Uses a plain fetch with no timeout because splat tiles can be very large
 * (hundreds of MB) and would otherwise be aborted by the default timeout.
 *
 * When an onProgress callback is given and the response is streamable, the body
 * is read incrementally so the caller can report real download progress. Without
 * it (or without a readable body), falls back to response.blob().
 */
export async function fetchRemoteSplatFile(
  url: string,
  onProgress?: DownloadProgressCallback
): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch splat (${response.status})`);
  }
  return blobToFile(await readResponseToBlob(response, onProgress), getFilenameFromUrl(url));
}

/**
 * Fetch a splat file from a URL into a single Uint8Array, minimizing peak memory.
 * Unlike {@link fetchRemoteSplatFile} (which returns a File and keeps the Blob
 * around), this returns the raw bytes so the lazy-tier path can hand them straight
 * to activation without a second copy.
 *
 * When Content-Length is known and the body is streamable, downloads into one
 * pre-allocated buffer. A mis-reported length is handled transparently: if the
 * stream yields more bytes than declared, the overflow is accumulated and merged
 * once at the end; if it yields fewer, a subarray of the received bytes is
 * returned. With no Content-Length the chunks are accumulated and consolidated
 * once; with no readable body at all, the whole response is taken in one copy.
 * Progress is reported as (loaded, total) bytes arrive, with total 0 when unknown.
 */
export async function fetchRemoteSplatBytes(
  url: string,
  onProgress?: DownloadProgressCallback
): Promise<{ bytes: Uint8Array; name: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch splat (${response.status})`);
  }
  const name = getFilenameFromUrl(url);
  const total = parseSafeIntegerString(response.headers.get('content-length') ?? '') ?? 0;

  // No readable body to stream: take the whole response in a single copy.
  if (!response.body) {
    return { bytes: new Uint8Array(await response.arrayBuffer()), name };
  }

  // Merge accumulated chunks into one buffer with a single final copy.
  const consolidate = (chunks: Uint8Array<ArrayBuffer>[], size: number): Uint8Array<ArrayBuffer> => {
    const merged = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  };

  const reader = response.body.getReader();
  // Pre-allocate when the length is known; otherwise accumulate every chunk.
  const buffer: Uint8Array<ArrayBuffer> | null = total > 0 ? new Uint8Array(total) : null;
  // Chunks past the declared length (mis-report), or all chunks when unknown.
  const overflow: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  onProgress?.(0, total);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (buffer && received + value.length <= total) {
        buffer.set(value, received);
      } else if (buffer && received < total) {
        // This chunk straddles the declared end: fill the rest, overflow the tail.
        buffer.set(value.subarray(0, total - received), received);
        overflow.push(new Uint8Array(value.subarray(total - received)));
      } else {
        // Unknown length, or already past the declared end.
        overflow.push(new Uint8Array(value));
      }
      received += value.length;
      onProgress?.(received, total);
    }
  } finally {
    // Tear down the stream if the loop exits abnormally (read rejection or a
    // throwing progress callback); a no-op once fully drained or already errored.
    reader.cancel().catch(() => {});
  }

  if (!buffer) {
    // Unknown length: one consolidation of all accumulated chunks.
    return { bytes: consolidate(overflow, received), name };
  }
  if (overflow.length > 0) {
    // Undercounted length: merge the filled buffer with the overflow tail.
    return { bytes: consolidate([buffer, ...overflow], received), name };
  }
  // Exact fill, or fewer bytes than declared (return only what arrived).
  return { bytes: received < total ? buffer.subarray(0, received) : buffer, name };
}

/**
 * Read a successful response into a Blob. When an onProgress callback is given and
 * the body is streamable, reports bytes (vs Content-Length) as they arrive;
 * otherwise falls back to response.blob(). Shared by remote splat and COLMAP-file
 * downloads so both can drive the byte counter in the loading overlay.
 */
export async function readResponseToBlob(
  response: Response,
  onProgress?: DownloadProgressCallback
): Promise<Blob> {
  if (!onProgress || !response.body) {
    return response.blob();
  }
  const total = parseSafeIntegerString(response.headers.get('content-length') ?? '') ?? 0;
  return readResponseStreamToBlob(response.body, total, onProgress);
}

/**
 * Read a fetch response body to a Blob, reporting bytes as they arrive. Builds
 * the Blob directly from the chunk array (no intermediate full-buffer copy) to
 * keep peak memory near one copy of the file.
 */
async function readResponseStreamToBlob(
  body: ReadableStream<Uint8Array>,
  total: number,
  onProgress: DownloadProgressCallback
): Promise<Blob> {
  const reader = body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;
  onProgress(0, total);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // Copy into an ArrayBuffer-backed view: detaches from the stream buffer and
      // satisfies the BlobPart type (the raw chunk is Uint8Array<ArrayBufferLike>).
      chunks.push(new Uint8Array(value));
      loaded += value.length;
      onProgress(loaded, total);
    }
  } finally {
    // Tear down the stream if the loop exits abnormally (read rejection, or a
    // throwing progress callback) so the underlying connection isn't left open.
    // A no-op once the stream is fully drained or already errored.
    reader.cancel().catch(() => {});
  }
  return new Blob(chunks);
}

/**
 * Extract filename from a URL path, percent-decoded so it matches the
 * human-readable path (e.g. a tile URL `.../5x5%23-5.ply` yields `5x5#-5.ply`).
 * URL.pathname keeps segments percent-encoded; without decoding, the resulting
 * File.name would not match the decoded name used elsewhere (download progress,
 * splat-loading ownership checks), breaking those matches for tiles whose names
 * contain `#`, spaces, etc. Falls back to the raw segment on malformed escapes.
 */
export function getFilenameFromUrl(url: string): string {
  const segment = new URL(url).pathname.split('/').pop() || 'unknown';
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Normalize Git hosting URLs to use raw file endpoints instead of web viewer URLs.
 * Supports: HuggingFace, GitHub, GitLab, Bitbucket, Gitea, Codeberg
 */
export function normalizeGitHostingUrl(url: string): string {
  // HuggingFace: Convert tree/main or blob/main to resolve/main
  if (url.includes('huggingface.co')) {
    return url
      .replace('/tree/main/', '/resolve/main/')
      .replace('/blob/main/', '/resolve/main/');
  }

  // GitHub: Convert to raw.githubusercontent.com
  // https://github.com/user/repo/blob/main/path -> https://raw.githubusercontent.com/user/repo/main/path
  const githubMatch = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(blob|tree)\/([^/]+)\/(.*)$/);
  if (githubMatch) {
    const [, user, repo, , branch, path] = githubMatch;
    return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path}`;
  }

  // GitLab (including self-hosted): Convert blob/tree to raw
  // https://gitlab.com/user/repo/-/blob/main/path -> https://gitlab.com/user/repo/-/raw/main/path
  if (url.includes('gitlab.com') || url.includes('gitlab.')) {
    return url
      .replace('/-/tree/', '/-/raw/')
      .replace('/-/blob/', '/-/raw/');
  }

  // Bitbucket: Convert src to raw
  // https://bitbucket.org/user/repo/src/main/path -> https://bitbucket.org/user/repo/raw/main/path
  if (url.includes('bitbucket.org')) {
    return url.replace('/src/', '/raw/');
  }

  // Gitea / Codeberg: Convert src/branch to raw/branch
  // https://codeberg.org/user/repo/src/branch/main/path -> https://codeberg.org/user/repo/raw/branch/main/path
  if (url.includes('codeberg.org') || url.includes('gitea.')) {
    return url.replace('/src/branch/', '/raw/branch/');
  }

  return url;
}

/**
 * Check if URL points to a JSON manifest file.
 */
export function isManifestUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith('.json');
  } catch {
    return false;
  }
}

/**
 * Enhanced error classification with cloud provider-specific CORS messages.
 */
export function classifyFetchErrorWithCloudContext(
  err: unknown,
  url?: string
): UrlLoadError {
  const baseError = classifyFetchError(err, url);

  // Enhance CORS errors with provider-specific instructions
  if (baseError.type === 'cors' && url) {
    const provider = detectCloudProvider(url);
    if (provider) {
      const instructions = getCorsInstructions(provider);
      baseError.details = `This ${provider.toUpperCase()} bucket does not allow cross-origin requests.\n\n${instructions}`;
    }
  }

  return baseError;
}
