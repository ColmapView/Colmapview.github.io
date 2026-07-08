import {
  type ColmapManifest,
  type UrlLoadError,
  type UrlLoadErrorType,
  type UrlLoadProgress,
} from '../types/manifest';
import { validateColmapManifest } from '../utils/manifestValidation';
import {
  blobToFile,
  classifyFetchError,
  fetchWithTimeout,
  getFilenameFromUrl,
  readResponseToBlob,
  type DownloadProgressCallback,
} from '../utils/urlUtils';
import { appLogger } from '../utils/logger';
import { isSplatFilePath } from '../utils/splatFilePolicy';
import { resolveImageSource } from '../utils/imageSourceResolution';
import { IMAGE_SOURCE_STRATEGIES } from '../utils/imageSourceStrategies';
import { classifyPlyHeaderText } from '../parsers';
import {
  getDirectoryListingLinks,
  getDirectoryListingRootUrl,
  getHuggingFaceColmapPaths,
  getHuggingFaceColmapTotalBytes,
  getHuggingFaceDatasetTreeRequest,
  getHuggingFaceImagesPath,
  getHuggingFaceSplatPaths,
  getLargeColmapDatasetWarning,
  getManifestColmapFileEntries,
  getRelativeHuggingFaceTreePaths,
  getSplatAutoLoadDecision,
  joinManifestUrlPath,
  sortRemoteSplatCandidates,
  type HuggingFaceColmapPaths,
  type HuggingFaceDatasetTreeEntry,
  type RemoteSplatCandidate,
} from './urlLoaderPolicy';
import { isUrlLoadError } from './urlLoaderErrorHandling';
import { detectTouchDevice } from './useIsTouchDevice';

type FetchUrl = (url: string, init?: RequestInit) => Promise<Response>;
type FetchManifestFile = (
  baseUrl: string,
  relativePath: string,
  onProgress?: DownloadProgressCallback
) => Promise<File>;
type SetUrlProgress = (progress: UrlLoadProgress | null) => void;

const DIRECTORY_LISTING_DISCOVERY_MAX_DEPTH = 8;
const DIRECTORY_LISTING_DISCOVERY_MAX_DIRECTORIES = 200;
const DIRECTORY_LISTING_DISCOVERY_MAX_CANDIDATES = 200;

function defaultFetchUrl(url: string, init?: RequestInit): Promise<Response> {
  return init ? fetch(url, init) : fetchWithTimeout(url);
}

export interface FetchUrlManifestDeps {
  fetchImpl?: FetchUrl;
  setUrlProgress: SetUrlProgress;
}

export interface FetchManifestFileOptions {
  fetchImpl?: FetchUrl;
  onProgress?: DownloadProgressCallback;
}

export interface FetchManifestColmapFilesDeps {
  fetchImpl?: FetchUrl;
  fetchFile?: FetchManifestFile;
  log?: (message: string) => void;
  setUrlProgress: SetUrlProgress;
  /**
   * Receives the full discovered remote splat catalog (all tiles, with sizes)
   * so the caller can list every tile as a lazy, on-demand source. At most the
   * lone discovered splat is eager-downloaded, and only within the auto-load
   * size budget.
   */
  onRemoteSplatCatalog?: (catalog: RemoteSplatCandidate[]) => void;
  /** Override splat classification (defaults to reading the PLY header). */
  classifySplatUrl?: ClassifySplatUrl;
  /**
   * Override touch-device detection for the splat auto-load budget
   * (defaults to detecting from the environment).
   */
  isTouchDevice?: boolean;
}

/**
 * Classify a remote splat candidate URL as a true Gaussian splat. Used to drop
 * raw point-cloud .ply files (e.g. a COLMAP `point_cloud.ply`) that share the
 * .ply extension with splats. Returns true for non-.ply splat formats and keeps
 * candidates on any classification error (so a transient failure never hides a
 * real splat).
 */
export type ClassifySplatUrl = (url: string) => Promise<boolean>;

export interface DiscoverHuggingFaceSplatDeps {
  fetchImpl?: FetchUrl;
  classifySplatUrl?: ClassifySplatUrl;
}

const SPLAT_HEADER_RANGE_BYTES = 65536;
// Cap on simultaneous header-classification fetches. Tiled datasets can have
// hundreds of .ply candidates; classifying them all at once would flood the
// connection pool (and, with a Range-ignoring server, pull many full bodies).
const SPLAT_CLASSIFY_CONCURRENCY = 6;

function safeUrlOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
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
 * Read at most maxBytes of text from a response. A 206 already returns only the
 * requested range, so reading it whole is bounded. A 200 means the server ignored
 * the Range header and is sending the entire file; stream at most maxBytes and
 * stop, instead of buffering a multi-GB body into a string just to sniff a header.
 */
async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  if (response.status === 206 || !response.body) {
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
      received += value.length;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return text + decoder.decode();
}

async function defaultClassifySplatUrl(url: string, fetchImpl: FetchUrl): Promise<boolean> {
  // Non-PLY splat formats (.spz / .splat) are always splats.
  const pathname = url.split('?')[0].toLowerCase();
  if (!pathname.endsWith('.ply')) {
    return true;
  }
  try {
    const response = await fetchImpl(url, { headers: { Range: `bytes=0-${SPLAT_HEADER_RANGE_BYTES - 1}` } });
    if (!response.ok) {
      return true; // cannot classify -> keep (do not hide a real splat on error)
    }
    const headerText = await readBoundedResponseText(response, SPLAT_HEADER_RANGE_BYTES);
    return classifyPlyHeaderText(headerText) === 'gaussian-splat';
  } catch {
    return true;
  }
}

export interface DiscoverDirectoryListingSplatDeps {
  fetchImpl?: FetchUrl;
  maxCandidates?: number;
  maxDepth?: number;
  maxDirectories?: number;
}

const HUGGINGFACE_TREE_MAX_PAGES = 50;

function parseHuggingFaceNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel\s*=\s*"?next"?/i);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Fetch a HuggingFace dataset tree, following the `Link: rel="next"` header so
 * datasets larger than one page (thousands of images plus splat tiles) are fully
 * enumerated. Without pagination, files on later pages (e.g. a splats/ folder
 * after thousands of images) would be invisible to discovery.
 */
async function fetchHuggingFaceTreeEntries(
  apiUrl: string,
  fetchImpl: FetchUrl
): Promise<HuggingFaceDatasetTreeEntry[]> {
  const entries: HuggingFaceDatasetTreeEntry[] = [];
  const seenPaths = new Set<string>();
  const visitedUrls = new Set<string>();
  const apiOrigin = safeUrlOrigin(apiUrl);
  let nextUrl: string | null = apiUrl;
  let pages = 0;

  while (nextUrl && pages < HUGGINGFACE_TREE_MAX_PAGES) {
    // Break a cyclic/repeated pagination cursor instead of re-fetching forever.
    if (visitedUrls.has(nextUrl)) {
      break;
    }
    visitedUrls.add(nextUrl);
    pages += 1;
    const response = await fetchImpl(nextUrl);
    if (!response.ok) {
      throw new Error(`Hugging Face tree request failed (${response.status})`);
    }
    const page: unknown = await response.json();
    if (Array.isArray(page)) {
      // De-duplicate by path so a repeated entry can't make a single splat look
      // like several (which would suppress auto-load and force the picker).
      for (const entry of page as HuggingFaceDatasetTreeEntry[]) {
        if (entry && typeof entry.path === 'string' && !seenPaths.has(entry.path)) {
          seenPaths.add(entry.path);
          entries.push(entry);
        }
      }
    }
    const candidateNext = parseHuggingFaceNextLink(
      response.headers.get('Link') ?? response.headers.get('link')
    );
    // Only follow pagination that stays on the original origin (defense against a
    // tampered/compromised Link header redirecting the crawl off-site).
    nextUrl = candidateNext && safeUrlOrigin(candidateNext) === apiOrigin ? candidateNext : null;
  }

  return entries;
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
    isSplat: await classify(joinManifestUrlPath(baseUrl, candidate.path)),
  }));
  return classified.filter((entry) => entry.isSplat).map((entry) => entry.candidate);
}

export async function discoverHuggingFaceSplatPath(
  baseUrl: string,
  deps: DiscoverHuggingFaceSplatDeps = {}
): Promise<RemoteSplatCandidate | null> {
  return (await discoverHuggingFaceSplatPaths(baseUrl, deps))[0] ?? null;
}

export interface HuggingFaceLayout {
  colmap: HuggingFaceColmapPaths | null;
  imagesPath: string | null;
  /** Per-image override map (COLMAP name -> dataset-relative path), or null. */
  imageNameToPath: Record<string, string> | null;
  /** Combined cameras+images+points3D size from the tree, or null if any is unknown. */
  colmapTotalBytes: number | null;
}

function dirnameOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash >= 0 ? path.slice(0, slash) : '';
}

/**
 * Discover a HuggingFace dataset's COLMAP model location and images directory in
 * a single (paginated) tree read. Returns null when the base URL is not a
 * HuggingFace dataset.
 */
export async function discoverHuggingFaceLayout(
  baseUrl: string,
  deps: DiscoverHuggingFaceSplatDeps = {}
): Promise<HuggingFaceLayout | null> {
  const request = getHuggingFaceDatasetTreeRequest(baseUrl);
  if (!request) {
    return null;
  }

  const fetchImpl = deps.fetchImpl ?? defaultFetchUrl;
  const entries = await fetchHuggingFaceTreeEntries(request.apiUrl, fetchImpl);
  const colmap = getHuggingFaceColmapPaths(entries, request.treePath);
  const colmapTotalBytes = colmap ? getHuggingFaceColmapTotalBytes(entries, request.treePath, colmap) : null;
  const modelDir = colmap ? dirnameOf(colmap.cameras) : undefined;
  const imagesPath = getHuggingFaceImagesPath(entries, request.treePath, modelDir);

  // Run the pluggable image-source resolver for special conventions (e.g. an
  // image_mapping.csv that renamed images before COLMAP). Only the per-image
  // override map is taken here; the base directory stays sourced from
  // getHuggingFaceImagesPath so there is a single source of truth for it.
  const relativePaths = getRelativeHuggingFaceTreePaths(entries, request.treePath);
  const fetchText = async (relativePath: string): Promise<string | null> => {
    try {
      const response = await fetchImpl(joinManifestUrlPath(baseUrl, relativePath));
      return response.ok ? await response.text() : null;
    } catch {
      return null;
    }
  };
  const imageSource = await resolveImageSource(
    { filePaths: relativePaths, modelDir: modelDir ?? '', fetchText },
    IMAGE_SOURCE_STRATEGIES
  );

  return { colmap, colmapTotalBytes, imagesPath, imageNameToPath: imageSource?.imageNameToPath ?? null };
}

/**
 * Discover where the COLMAP bins actually live in a HuggingFace dataset by
 * reading its file tree, rather than assuming the conventional sparse/0 layout.
 * Returns paths relative to the dataset base URL, or null when the base URL is
 * not a HuggingFace dataset or no complete model is present.
 */
export async function discoverHuggingFaceColmapPaths(
  baseUrl: string,
  deps: DiscoverHuggingFaceSplatDeps = {}
): Promise<HuggingFaceColmapPaths | null> {
  return (await discoverHuggingFaceLayout(baseUrl, deps))?.colmap ?? null;
}

/**
 * Derive the masks directory as a sibling of a discovered images directory
 * (e.g. `corrected/images` -> `corrected/masks`). Returns null when the path
 * doesn't end in an `images` segment, so we don't guess for unusual layouts.
 */
export function deriveMasksPathFromImages(imagesPath: string): string | null {
  const trimmed = imagesPath.replace(/\/+$/, '');
  const slash = trimmed.lastIndexOf('/');
  const leaf = (slash >= 0 ? trimmed.slice(slash + 1) : trimmed).toLowerCase();
  if (leaf !== 'images') {
    return null;
  }
  const parent = slash >= 0 ? trimmed.slice(0, slash + 1) : '';
  return `${parent}masks`;
}

/**
 * Best-effort rewrite of a manifest's COLMAP file paths to the locations
 * actually present in the remote dataset. Falls back to the original manifest
 * (e.g. the sparse/0 defaults) when discovery is unavailable or finds nothing,
 * so explicit manifests and conventional layouts are unaffected.
 */
export async function withDiscoveredColmapPaths(
  manifest: ColmapManifest,
  deps: Pick<FetchManifestColmapFilesDeps, 'fetchImpl' | 'log' | 'isTouchDevice'> & {
    onLargeDatasetWarning?: (message: string) => void;
  } = {}
): Promise<ColmapManifest> {
  try {
    const layout = await discoverHuggingFaceLayout(manifest.baseUrl, {
      fetchImpl: deps.fetchImpl,
    });
    if (!layout) {
      return manifest;
    }

    const warning = getLargeColmapDatasetWarning(
      layout.colmapTotalBytes,
      deps.isTouchDevice ?? detectTouchDevice()
    );
    if (warning) {
      deps.log?.(`[URL Loader] ${warning}`);
      deps.onLargeDatasetWarning?.(warning);
    }

    let result = manifest;
    if (layout.colmap) {
      const { cameras, images, points3D, rigs, frames } = layout.colmap;
      deps.log?.(
        `[URL Loader] Discovered COLMAP files: cameras=${cameras}, images=${images}, points3D=${points3D}`
      );
      result = {
        ...result,
        files: {
          ...result.files,
          cameras,
          images,
          points3D,
          // Use the optional files from the discovered model dir (undefined when
          // absent), not the sparse/0 defaults which won't exist there.
          rigs,
          frames,
        },
      };
    }
    if (layout.imagesPath !== null && layout.imagesPath !== result.imagesPath) {
      deps.log?.(`[URL Loader] Discovered images directory: ${layout.imagesPath}`);
      result = { ...result, imagesPath: layout.imagesPath };
      // Masks conventionally sit beside images; without this they'd stay at the
      // sparse/0 default `masks/` and 404 for relocated layouts.
      const masksPath = deriveMasksPathFromImages(layout.imagesPath);
      if (masksPath && masksPath !== result.masksPath) {
        deps.log?.(`[URL Loader] Using masks directory alongside images: ${masksPath}`);
        result = { ...result, masksPath };
      }
    }
    if (layout.imageNameToPath && Object.keys(layout.imageNameToPath).length > 0) {
      deps.log?.(
        `[URL Loader] Discovered per-image path mapping for ${Object.keys(layout.imageNameToPath).length} images`
      );
      result = { ...result, imageNameToPath: layout.imageNameToPath };
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.log?.(`[URL Loader] COLMAP layout discovery skipped: ${message}`);
  }

  return manifest;
}

async function getRemoteFileContentLength(url: string, fetchImpl: FetchUrl): Promise<number | null> {
  let response: Response;
  try {
    response = await fetchImpl(url, { method: 'HEAD' });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const contentLength = response.headers.get('content-length');
  if (!contentLength) {
    return null;
  }

  const size = Number(contentLength);
  return Number.isFinite(size) && size >= 0 ? size : null;
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
        const size = await getRemoteFileContentLength(link.url, fetchImpl);
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

export async function discoverDirectoryListingSplatPath(
  baseUrl: string,
  deps: DiscoverDirectoryListingSplatDeps = {}
): Promise<RemoteSplatCandidate | null> {
  return (await discoverDirectoryListingSplatPaths(baseUrl, deps))[0] ?? null;
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

function getOversizedSplatSkipLogMessage(
  candidate: RemoteSplatCandidate,
  budgetBytes: number
): string {
  const sizeMb = Math.round(candidate.size / 1_000_000);
  const budgetMb = Math.round(budgetBytes / 1_000_000);
  return `[URL Loader] Splat ${candidate.path} (${sizeMb} MB) exceeds the ${budgetMb} MB auto-load limit; select it from the splat picker to download`;
}

function applyDiscoveredSplats(
  manifest: ColmapManifest,
  candidates: readonly RemoteSplatCandidate[],
  source: 'Hugging Face' | 'directory',
  deps: Pick<FetchManifestColmapFilesDeps, 'log' | 'onRemoteSplatCatalog' | 'isTouchDevice'>
): ColmapManifest {
  deps.log?.(getDiscoveredSplatLogMessage(source, candidates));
  // Surface the full catalog so the loader can list every tile as a lazy,
  // on-demand source. Anything not auto-loaded here is fetched when the user
  // selects it, which keeps large tiled datasets (tens of GB) from downloading
  // everything up front.
  deps.onRemoteSplatCatalog?.([...candidates]);
  // A single splat auto-loads only within the size budget (a lone multi-GB
  // tile would otherwise download unprompted — on phones that OOM-crashes the
  // tab into a reload loop). With multiple, don't auto-download any; the user
  // picks one from the catalog, or stays on the COLMAP scene.
  const decision = getSplatAutoLoadDecision(candidates, {
    isTouchDevice: deps.isTouchDevice ?? detectTouchDevice(),
  });
  if (decision.autoLoad) {
    return { ...manifest, splats: [candidates[0].path] };
  }
  if (decision.oversizedCandidate) {
    deps.log?.(getOversizedSplatSkipLogMessage(decision.oversizedCandidate, decision.budgetBytes));
  } else {
    deps.log?.(
      `[URL Loader] ${candidates.length} splats found; none auto-loaded - select one to display`
    );
  }
  return { ...manifest, splats: [] };
}

async function withDiscoveredRemoteSplats(
  manifest: ColmapManifest,
  deps: Pick<FetchManifestColmapFilesDeps, 'fetchImpl' | 'log' | 'onRemoteSplatCatalog' | 'classifySplatUrl' | 'isTouchDevice'>
): Promise<ColmapManifest> {
  if (manifest.splats?.length) {
    return manifest;
  }

  try {
    const candidates = await discoverHuggingFaceSplatPaths(manifest.baseUrl, {
      fetchImpl: deps.fetchImpl,
      classifySplatUrl: deps.classifySplatUrl,
    });
    if (candidates.length > 0) {
      return applyDiscoveredSplats(manifest, candidates, 'Hugging Face', deps);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.log?.(`[URL Loader] Hugging Face splat discovery skipped: ${message}`);
  }

  try {
    const candidates = await discoverDirectoryListingSplatPaths(manifest.baseUrl, {
      fetchImpl: deps.fetchImpl,
    });
    if (candidates.length > 0) {
      return applyDiscoveredSplats(manifest, candidates, 'directory', deps);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.log?.(`[URL Loader] Directory splat discovery skipped: ${message}`);
  }

  return manifest;
}

export async function fetchUrlManifest(
  manifestUrl: string,
  deps: FetchUrlManifestDeps
): Promise<ColmapManifest> {
  const fetchImpl = deps.fetchImpl ?? defaultFetchUrl;
  deps.setUrlProgress({ percent: 2, message: 'Fetching manifest...' });

  const response = await fetchImpl(manifestUrl);

  if (!response.ok) {
    const errorType: UrlLoadErrorType = response.status === 404 ? 'not_found' : 'network';
    const error: UrlLoadError = {
      type: errorType,
      message: `Failed to fetch manifest (${response.status})`,
      details: response.statusText,
      failedFile: manifestUrl,
    };
    throw error;
  }

  const data = await response.json();
  const result = validateColmapManifest(data);
  if (!result.success) {
    const error: UrlLoadError = {
      type: 'invalid_manifest',
      message: 'Invalid manifest format',
      details: result.details,
      failedFile: manifestUrl,
    };
    throw error;
  }

  deps.setUrlProgress({ percent: 5, message: 'Manifest loaded' });
  return result.manifest;
}

export async function fetchManifestFile(
  baseUrl: string,
  relativePath: string,
  options: FetchManifestFileOptions = {}
): Promise<File> {
  const fetchImpl = options.fetchImpl ?? defaultFetchUrl;
  const fullUrl = joinManifestUrlPath(baseUrl, relativePath);
  const response = await fetchImpl(fullUrl);

  if (!response.ok) {
    const errorType: UrlLoadErrorType = response.status === 404 ? 'not_found' : 'network';
    const error: UrlLoadError = {
      type: errorType,
      message: `Failed to fetch file (${response.status})`,
      details: `${relativePath}: ${response.statusText}`,
      failedFile: fullUrl,
    };
    throw error;
  }

  const blob = await readResponseToBlob(response, options.onProgress);
  const filename = getFilenameFromUrl(fullUrl);
  return blobToFile(blob, filename);
}

export async function fetchManifestColmapFiles(
  manifest: ColmapManifest,
  deps: FetchManifestColmapFilesDeps
): Promise<Map<string, File>> {
  const files = new Map<string, File>();
  const fetchFile = deps.fetchFile
    ?? ((baseUrl, relativePath, onProgress) =>
      fetchManifestFile(baseUrl, relativePath, { fetchImpl: deps.fetchImpl, onProgress }));
  const log = deps.log ?? appLogger.info;
  const manifestWithDiscoveredSplats = await withDiscoveredRemoteSplats(manifest, {
    fetchImpl: deps.fetchImpl,
    log,
    onRemoteSplatCatalog: deps.onRemoteSplatCatalog,
    classifySplatUrl: deps.classifySplatUrl,
    isTouchDevice: deps.isTouchDevice,
  });
  const { baseUrl } = manifestWithDiscoveredSplats;
  const { requiredFiles, optionalFiles } = getManifestColmapFileEntries(manifestWithDiscoveredSplats);

  const totalFiles = requiredFiles.length;
  let downloadedCount = 0;
  const optionalSplatFileTotal = optionalFiles.filter(({ path }) => isSplatFilePath(path)).length;
  let optionalSplatDownloadedCount = 0;

  // Aggregate byte progress across the (parallel) required COLMAP downloads so the
  // loading overlay can show "X MB / Y MB" like splats. Bytes are only surfaced
  // once every required file's size is known (Content-Length); otherwise we fall
  // back to file-count progress so an unsized response can't skew the total.
  const requiredBytesLoaded: Record<string, number> = {};
  const requiredBytesTotal: Record<string, number> = {};
  const reportRequiredProgress = (currentFile: string) => {
    let bytesLoaded = 0;
    let bytesTotal = 0;
    let allTotalsKnown = true;
    for (const { path } of requiredFiles) {
      bytesLoaded += requiredBytesLoaded[path] ?? 0;
      const total = requiredBytesTotal[path];
      if (total === undefined) {
        allTotalsKnown = false;
      } else {
        bytesTotal += total;
      }
    }
    const showBytes = allTotalsKnown && bytesTotal > 0;
    // Clamp loaded to total: Content-Length is the compressed size for gzip/br
    // responses while the stream yields decompressed bytes, so loaded can exceed
    // total — never overshoot the bar or show "X / Y" with X > Y.
    const reportedLoaded = showBytes ? Math.min(bytesLoaded, bytesTotal) : bytesLoaded;
    const percent = showBytes
      ? 5 + Math.round((reportedLoaded / bytesTotal) * 25)
      : 5 + Math.round((downloadedCount / totalFiles) * 25);
    deps.setUrlProgress({
      percent,
      message: 'Downloading COLMAP files...',
      currentFile,
      filesDownloaded: downloadedCount,
      totalFiles,
      ...(showBytes ? { bytesLoaded: reportedLoaded, bytesTotal } : {}),
    });
  };

  deps.setUrlProgress({
    percent: 5,
    message: 'Downloading COLMAP files...',
    filesDownloaded: 0,
    totalFiles,
  });

  const requiredResults = await Promise.all(
    requiredFiles.map(async ({ key, path }) => {
      try {
        const file = await fetchFile(baseUrl, path, (loaded, total) => {
          requiredBytesLoaded[path] = loaded;
          if (total > 0) {
            requiredBytesTotal[path] = total;
          }
          reportRequiredProgress(path);
        });
        downloadedCount++;
        reportRequiredProgress(path);

        return { key, file };
      } catch (err) {
        if (isUrlLoadError(err)) {
          throw err;
        }
        throw classifyFetchError(err, `${baseUrl}/${path}`);
      }
    })
  );

  for (const { key, file } of requiredResults) {
    files.set(key, file);
  }

  if (optionalFiles.length > 0) {
    // Aggregate byte progress across the (parallel) eager manifest-splat downloads
    // the same way the required phase does, so this phase also shows "X MB / Y MB"
    // when every splat size is known. rigs/frames are tiny non-splat metadata and
    // keep the simple blob() path (no progress phase of their own).
    const optionalSplatPaths = optionalFiles.filter(({ path }) => isSplatFilePath(path)).map(({ path }) => path);
    const optionalSplatBytesLoaded: Record<string, number> = {};
    const optionalSplatBytesTotal: Record<string, number> = {};
    const reportOptionalSplatProgress = (currentFile: string) => {
      let bytesLoaded = 0;
      let bytesTotal = 0;
      let allTotalsKnown = true;
      for (const path of optionalSplatPaths) {
        bytesLoaded += optionalSplatBytesLoaded[path] ?? 0;
        const total = optionalSplatBytesTotal[path];
        if (total === undefined) {
          allTotalsKnown = false;
        } else {
          bytesTotal += total;
        }
      }
      const showBytes = allTotalsKnown && bytesTotal > 0;
      // Clamp loaded to total (compressed Content-Length vs decompressed stream).
      const reportedLoaded = showBytes ? Math.min(bytesLoaded, bytesTotal) : bytesLoaded;
      const percent = showBytes
        ? 30 + Math.round((reportedLoaded / bytesTotal) * 50)
        : 30 + Math.round((optionalSplatDownloadedCount / optionalSplatFileTotal) * 50);
      deps.setUrlProgress({
        percent,
        message: 'Downloading splat files...',
        currentFile,
        filesDownloaded: optionalSplatDownloadedCount,
        totalFiles: optionalSplatFileTotal,
        ...(showBytes ? { bytesLoaded: reportedLoaded, bytesTotal } : {}),
      });
    };

    if (optionalSplatFileTotal > 0) {
      deps.setUrlProgress({
        percent: 30,
        message: 'Downloading splat files...',
        filesDownloaded: 0,
        totalFiles: optionalSplatFileTotal,
      });
    }

    const optionalResults = await Promise.all(
      optionalFiles.map(async ({ key, path }) => {
        const isSplatFile = isSplatFilePath(path);
        try {
          const file = await fetchFile(
            baseUrl,
            path,
            isSplatFile
              ? (loaded, total) => {
                  optionalSplatBytesLoaded[path] = loaded;
                  if (total > 0) {
                    optionalSplatBytesTotal[path] = total;
                  }
                  reportOptionalSplatProgress(path);
                }
              : undefined
          );
          log(`[URL Loader] Optional file loaded: ${path}`);
          return { key, file };
        } catch {
          log(`[URL Loader] Optional file not found: ${path}`);
          return null;
        } finally {
          if (isSplatFile) {
            optionalSplatDownloadedCount += 1;
            reportOptionalSplatProgress(path);
          }
        }
      })
    );

    for (const result of optionalResults) {
      if (result) {
        files.set(result.key, result.file);
      }
    }
  }

  return files;
}
