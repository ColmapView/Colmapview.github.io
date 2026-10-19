import type { ColmapManifest } from '../types/manifest';
import { classifyPlyHeaderText, getPlyHeaderVertexCount } from '../parsers';
import { fetchDatasetResource } from '../utils/fetchDatasetResource';
import { fetchHuggingFaceTreeEntries } from './urlLoaderHuggingFaceListing';
import {
  getDirectoryListingLinks, getDirectoryListingRootUrl, getHuggingFaceDatasetTreeRequest,
  getHuggingFaceSplatPaths, joinManifestUrlPath, sortRemoteSplatCandidates,
} from './urlLoaderPolicy';
import type { RemoteSplatCandidate } from '../splat/loadingPolicy';

type FetchUrl = (url: string, init?: RequestInit) => Promise<Response>;

/** Dependencies for discovering selectable splats without downloading their bytes. */
export interface DiscoverManifestSplatDeps extends DiscoverHuggingFaceSplatDeps {
  log?: (message: string) => void;
}

/**
 * Result of classifying a remote splat candidate URL. `splatCount` is the PLY
 * vertex count read from the same 64 KiB header probe (null when unknown, e.g.
 * non-PLY formats or a failed/unparseable probe).
 */
export interface SplatUrlClassification {
  isSplat: boolean;
  splatCount: number | null;
  /** The classifier's own ranged GET answered OK: the file is served, whatever a HEAD says. */
  served?: boolean;
}

/**
 * Classify a remote splat candidate URL as a true Gaussian splat. Used to drop
 * raw point-cloud .ply files (e.g. a COLMAP `point_cloud.ply`) that share the
 * .ply extension with splats. Non-.ply splat formats classify as splats, and
 * candidates are kept on any classification error (so a transient failure never
 * hides a real splat).
 */
export type ClassifySplatUrl = (url: string) => Promise<SplatUrlClassification>;

export interface DiscoverHuggingFaceSplatDeps {
  fetchImpl?: FetchUrl;
  classifySplatUrl?: ClassifySplatUrl;
}

export interface DiscoverDirectoryListingSplatDeps {
  fetchImpl?: FetchUrl;
  maxCandidates?: number;
  maxDepth?: number;
  maxDirectories?: number;
}

const DIRECTORY_LISTING_DISCOVERY_MAX_DEPTH = 8;

const DIRECTORY_LISTING_DISCOVERY_MAX_DIRECTORIES = 200;

const DIRECTORY_LISTING_DISCOVERY_MAX_CANDIDATES = 200;

const SPLAT_HEADER_RANGE_BYTES = 65536;

// Cap on simultaneous header-classification fetches. Tiled datasets can have
// hundreds of .ply candidates; classifying them all at once would flood the
// connection pool (and, with a Range-ignoring server, pull many full bodies).
const SPLAT_CLASSIFY_CONCURRENCY = 6;

function defaultFetchUrl(url: string, init?: RequestInit): Promise<Response> {
  return fetchDatasetResource(url, undefined, init);
}

/** Map over items with a bounded number of concurrent async calls. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Read only the PLY header, bounded even when a response ignores or exceeds Range.
 * Stop at end_header so classification never waits for the following vertex data.
 */
async function readPlyHeaderText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    return response.text();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let received = 0;
  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const bytes = value.subarray(0, maxBytes - received);
      received += bytes.length;
      text += decoder.decode(bytes, { stream: true });
      const headerEnd = /(?:^|\r\n|\n|\r)[ \t]*end_header[ \t]*(?:\r\n|\n|\r)/.exec(text);
      if (headerEnd) return text.slice(0, headerEnd.index + headerEnd[0].length);
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return text + decoder.decode();
}

async function defaultClassifySplatUrl(url: string, fetchImpl: FetchUrl): Promise<SplatUrlClassification> {
  // Only .ply is ambiguous (splat vs point cloud); .spz and .sog are always splats.
  const pathname = url.split('?')[0].toLowerCase();
  if (!pathname.endsWith('.ply')) {
    return { isSplat: true, splatCount: null };
  }
  try {
    const response = await fetchImpl(url, { headers: { Range: `bytes=0-${SPLAT_HEADER_RANGE_BYTES - 1}` } });
    if (!response.ok) {
      // Cannot classify -> keep (do not hide a real splat on error).
      return { isSplat: true, splatCount: null };
    }
    const headerText = await readPlyHeaderText(response, SPLAT_HEADER_RANGE_BYTES);
    return {
      isSplat: classifyPlyHeaderText(headerText) === 'gaussian-splat',
      splatCount: getPlyHeaderVertexCount(headerText),
      served: true,
    };
  } catch {
    return { isSplat: true, splatCount: null };
  }
}

export async function discoverHuggingFaceSplatPaths(
  baseUrl: string,
  deps: DiscoverHuggingFaceSplatDeps = {}
): Promise<RemoteSplatCandidate[]> {
  const request = getHuggingFaceDatasetTreeRequest(baseUrl);
  if (!request) {
    return [];
  }

  const fetchImpl = deps.fetchImpl ?? defaultFetchUrl;
  const entries = await fetchHuggingFaceTreeEntries(request.apiUrl, fetchImpl);
  const candidates = getHuggingFaceSplatPaths(entries, request.treePath);

  // Drop .ply candidates that are raw point clouds rather than Gaussian splats
  // (the .ply extension alone is ambiguous - 3DGS even names splats
  // point_cloud.ply, while this dataset uses point_cloud.ply for a point cloud).
  const classify = deps.classifySplatUrl ?? ((url: string) => defaultClassifySplatUrl(url, fetchImpl));
  const classified = await mapWithConcurrency(candidates, SPLAT_CLASSIFY_CONCURRENCY, async (candidate) => ({
    candidate,
    classification: await classify(joinManifestUrlPath(baseUrl, candidate.path)),
  }));
  return classified
    .filter((entry) => entry.classification.isSplat)
    .map((entry) => ({ ...entry.candidate, splatCount: entry.classification.splatCount }));
}

/** A HEAD probe: the size when known, and whether the server says the file is not there. */
async function probeRemoteFile(url: string, fetchImpl: FetchUrl): Promise<{ size: number | null; missing: boolean }> {
  let response: Response;
  try {
    response = await fetchImpl(url, { method: 'HEAD' });
  } catch {
    return { size: null, missing: false };
  }

  if (!response.ok) {
    return { size: null, missing: response.status === 404 || response.status === 410 };
  }

  const contentLength = response.headers.get('content-length');
  if (!contentLength) {
    return { size: null, missing: false };
  }

  const size = Number(contentLength);
  return { size: Number.isFinite(size) && size >= 0 ? size : null, missing: false };
}

/** One ranged GET for a file whose HEAD said it is gone: whether GET says so too. */
async function isMissingOnGet(url: string, fetchImpl: FetchUrl): Promise<boolean> {
  try {
    const response = await fetchImpl(url, { headers: { Range: 'bytes=0-0' } });
    void response.body?.cancel().catch(() => {});
    return response.status === 404 || response.status === 410;
  } catch {
    return false;
  }
}

export async function discoverDirectoryListingSplatPaths(
  baseUrl: string,
  deps: DiscoverDirectoryListingSplatDeps = {}
): Promise<RemoteSplatCandidate[]> {
  const rootUrl = getDirectoryListingRootUrl(baseUrl);
  if (!rootUrl) {
    return [];
  }

  const fetchImpl = deps.fetchImpl ?? defaultFetchUrl;
  const maxCandidates = deps.maxCandidates ?? DIRECTORY_LISTING_DISCOVERY_MAX_CANDIDATES;
  const maxDepth = deps.maxDepth ?? DIRECTORY_LISTING_DISCOVERY_MAX_DEPTH;
  const maxDirectories = deps.maxDirectories ?? DIRECTORY_LISTING_DISCOVERY_MAX_DIRECTORIES;
  const queue: Array<{ url: string; depth: number }> = [{ url: rootUrl, depth: 0 }];
  const visitedDirectories = new Set<string>();
  let checkedCandidates = 0;
  const candidatesByPath = new Map<string, RemoteSplatCandidate>();

  while (queue.length > 0 && visitedDirectories.size < maxDirectories) {
    const current = queue.shift();
    if (!current || visitedDirectories.has(current.url)) {
      continue;
    }

    visitedDirectories.add(current.url);

    let response: Response;
    try {
      response = await fetchImpl(current.url);
    } catch {
      continue;
    }

    if (!response.ok) {
      continue;
    }

    let html: string;
    try {
      html = await response.text();
    } catch {
      continue;
    }

    for (const link of getDirectoryListingLinks(current.url, rootUrl, html)) {
      if (link.isSplat) {
        if (checkedCandidates >= maxCandidates || candidatesByPath.has(link.relativePath)) {
          continue;
        }

        checkedCandidates++;
        // Keep the splat even when the size is unknown (HEAD blocked/405, or no
        // Content-Length): the file exists and is a valid splat; dropping it would
        // make it silently vanish on static hosts. Unknown size sorts last and
        // shows no size label.
        const { size } = await probeRemoteFile(link.url, fetchImpl);
        candidatesByPath.set(link.relativePath, {
          path: link.relativePath,
          size: size ?? 0,
        });
        continue;
      }

      if (link.isDirectory && current.depth < maxDepth && !visitedDirectories.has(link.url)) {
        queue.push({ url: link.url, depth: current.depth + 1 });
      }
    }
  }

  return sortRemoteSplatCandidates([...candidatesByPath.values()]);
}

function getDiscoveredSplatLogMessage(
  source: 'Hugging Face' | 'directory',
  candidates: readonly RemoteSplatCandidate[]
): string {
  const label = source === 'Hugging Face' ? 'Hugging Face splat' : 'directory splat';
  const candidateList = candidates.map((candidate) => `${candidate.path} (${candidate.size} bytes)`).join(', ');
  return candidates.length === 1
    ? `[URL Loader] Discovered ${label} file: ${candidateList}`
    : `[URL Loader] Discovered ${candidates.length} ${label} files: ${candidateList}`;
}

async function discoverRemoteSplatCatalog(
  baseUrl: string,
  deps: DiscoverManifestSplatDeps
): Promise<RemoteSplatCandidate[]> {
  try {
    const candidates = await discoverHuggingFaceSplatPaths(baseUrl, {
      fetchImpl: deps.fetchImpl,
      classifySplatUrl: deps.classifySplatUrl,
    });
    if (candidates.length > 0) {
      deps.log?.(getDiscoveredSplatLogMessage('Hugging Face', candidates));
      return candidates;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.log?.(`[URL Loader] Hugging Face splat discovery skipped: ${message}`);
  }

  // A Hugging Face resolve URL serves files, never an HTML directory index.
  // Its tree API is authoritative; probing the folder creates a spurious CORS
  // error on otherwise readable native models with no splats.
  if (getHuggingFaceDatasetTreeRequest(baseUrl)) return [];

  try {
    const candidates = await discoverDirectoryListingSplatPaths(baseUrl, {
      fetchImpl: deps.fetchImpl,
    });
    if (candidates.length > 0) {
      deps.log?.(getDiscoveredSplatLogMessage('directory', candidates));
    }
    return candidates;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.log?.(`[URL Loader] Directory splat discovery skipped: ${message}`);
  }

  return [];
}

/** Discover selectable tiles without transferring full splat files. */
export async function discoverManifestSplatCatalog(
  manifest: ColmapManifest,
  deps: DiscoverManifestSplatDeps = {}
): Promise<RemoteSplatCandidate[]> {
  if (manifest.splats?.length === 0) return [];
  if (manifest.splats?.length) {
    const fetchImpl = deps.fetchImpl ?? defaultFetchUrl;
    const classify = deps.classifySplatUrl ?? ((url: string) => defaultClassifySplatUrl(url, fetchImpl));
    const paths = [...new Set(manifest.splats)];
    const candidates = await mapWithConcurrency(paths, SPLAT_CLASSIFY_CONCURRENCY, async path => {
      const url = joinManifestUrlPath(manifest.baseUrl, path);
      const [classification, probe] = await Promise.all([classify(url), probeRemoteFile(url, fetchImpl)]);
      // A listed splat the server says is gone is left out, as a missing optional file always was. Some
      // routes answer HEAD with 404 yet serve GET, so only a GET that says so too counts; the size stays unknown.
      if (probe.missing && !classification.served && await isMissingOnGet(url, fetchImpl)) {
        deps.log?.(`[URL Loader] Optional file not found: ${path}`);
        return null;
      }
      return classification.isSplat ? { path, size: probe.size ?? 0, splatCount: classification.splatCount } : null;
    });
    return sortRemoteSplatCandidates(candidates.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null));
  }
  return discoverRemoteSplatCatalog(manifest.baseUrl, deps);
}
