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
} from '../utils/urlUtils';
import { appLogger } from '../utils/logger';
import {
  getDirectoryListingLinks,
  getDirectoryListingRootUrl,
  getHuggingFaceDatasetTreeRequest,
  getLargestRemoteSplatCandidate,
  getLargestHuggingFacePlyPath,
  getManifestColmapFileEntries,
  joinManifestUrlPath,
  type RemoteSplatCandidate,
} from './urlLoaderPolicy';
import { isUrlLoadError } from './urlLoaderErrorHandling';

type FetchUrl = (url: string, init?: RequestInit) => Promise<Response>;
type FetchManifestFile = (baseUrl: string, relativePath: string) => Promise<File>;
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
}

export interface FetchManifestColmapFilesDeps {
  fetchImpl?: FetchUrl;
  fetchFile?: FetchManifestFile;
  log?: (message: string) => void;
  setUrlProgress: SetUrlProgress;
}

export interface DiscoverHuggingFaceSplatDeps {
  fetchImpl?: FetchUrl;
}

export interface DiscoverDirectoryListingSplatDeps {
  fetchImpl?: FetchUrl;
  maxCandidates?: number;
  maxDepth?: number;
  maxDirectories?: number;
}

export async function discoverHuggingFaceSplatPath(
  baseUrl: string,
  deps: DiscoverHuggingFaceSplatDeps = {}
): Promise<RemoteSplatCandidate | null> {
  const request = getHuggingFaceDatasetTreeRequest(baseUrl);
  if (!request) {
    return null;
  }

  const fetchImpl = deps.fetchImpl ?? defaultFetchUrl;
  const response = await fetchImpl(request.apiUrl);
  if (!response.ok) {
    throw new Error(`Hugging Face tree request failed (${response.status})`);
  }

  const entries: unknown = await response.json();
  if (!Array.isArray(entries)) {
    return null;
  }

  return getLargestHuggingFacePlyPath(entries, request.treePath);
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

export async function discoverDirectoryListingSplatPath(
  baseUrl: string,
  deps: DiscoverDirectoryListingSplatDeps = {}
): Promise<RemoteSplatCandidate | null> {
  const rootUrl = getDirectoryListingRootUrl(baseUrl);
  if (!rootUrl) {
    return null;
  }

  const fetchImpl = deps.fetchImpl ?? defaultFetchUrl;
  const maxCandidates = deps.maxCandidates ?? DIRECTORY_LISTING_DISCOVERY_MAX_CANDIDATES;
  const maxDepth = deps.maxDepth ?? DIRECTORY_LISTING_DISCOVERY_MAX_DEPTH;
  const maxDirectories = deps.maxDirectories ?? DIRECTORY_LISTING_DISCOVERY_MAX_DIRECTORIES;
  const queue: Array<{ url: string; depth: number }> = [{ url: rootUrl, depth: 0 }];
  const visitedDirectories = new Set<string>();
  let checkedCandidates = 0;
  let largest: RemoteSplatCandidate | null = null;

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
      if (link.isPly) {
        if (checkedCandidates >= maxCandidates) {
          continue;
        }

        checkedCandidates++;
        const size = await getRemoteFileContentLength(link.url, fetchImpl);
        if (size === null) {
          continue;
        }

        largest = getLargestRemoteSplatCandidate(largest, {
          path: link.relativePath,
          size,
        });
        continue;
      }

      if (link.isDirectory && current.depth < maxDepth && !visitedDirectories.has(link.url)) {
        queue.push({ url: link.url, depth: current.depth + 1 });
      }
    }
  }

  return largest;
}

async function withDiscoveredRemoteSplats(
  manifest: ColmapManifest,
  deps: Pick<FetchManifestColmapFilesDeps, 'fetchImpl' | 'log'>
): Promise<ColmapManifest> {
  if (manifest.splats?.length) {
    return manifest;
  }

  try {
    const candidate = await discoverHuggingFaceSplatPath(manifest.baseUrl, {
      fetchImpl: deps.fetchImpl,
    });
    if (candidate) {
      deps.log?.(`[URL Loader] Discovered Hugging Face splat file: ${candidate.path} (${candidate.size} bytes)`);
      return {
        ...manifest,
        splats: [candidate.path],
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.log?.(`[URL Loader] Hugging Face splat discovery skipped: ${message}`);
  }

  try {
    const candidate = await discoverDirectoryListingSplatPath(manifest.baseUrl, {
      fetchImpl: deps.fetchImpl,
    });
    if (candidate) {
      deps.log?.(`[URL Loader] Discovered directory splat file: ${candidate.path} (${candidate.size} bytes)`);
      return {
        ...manifest,
        splats: [candidate.path],
      };
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

  const blob = await response.blob();
  const filename = getFilenameFromUrl(fullUrl);
  return blobToFile(blob, filename);
}

export async function fetchManifestColmapFiles(
  manifest: ColmapManifest,
  deps: FetchManifestColmapFilesDeps
): Promise<Map<string, File>> {
  const files = new Map<string, File>();
  const fetchFile = deps.fetchFile
    ?? ((baseUrl, relativePath) => fetchManifestFile(baseUrl, relativePath, { fetchImpl: deps.fetchImpl }));
  const log = deps.log ?? appLogger.info;
  const manifestWithDiscoveredSplats = await withDiscoveredRemoteSplats(manifest, {
    fetchImpl: deps.fetchImpl,
    log,
  });
  const { baseUrl } = manifestWithDiscoveredSplats;
  const { requiredFiles, optionalFiles } = getManifestColmapFileEntries(manifestWithDiscoveredSplats);

  const totalFiles = requiredFiles.length;
  let downloadedCount = 0;

  deps.setUrlProgress({
    percent: 5,
    message: 'Downloading COLMAP files...',
    filesDownloaded: 0,
    totalFiles,
  });

  const requiredResults = await Promise.all(
    requiredFiles.map(async ({ key, path }) => {
      try {
        const file = await fetchFile(baseUrl, path);
        downloadedCount++;

        const percent = 5 + Math.round((downloadedCount / totalFiles) * 25);
        deps.setUrlProgress({
          percent,
          message: 'Downloading COLMAP files...',
          currentFile: path,
          filesDownloaded: downloadedCount,
          totalFiles,
        });

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
    const optionalResults = await Promise.all(
      optionalFiles.map(async ({ key, path }) => {
        try {
          const file = await fetchFile(baseUrl, path);
          log(`[URL Loader] Optional file loaded: ${path}`);
          return { key, file };
        } catch {
          log(`[URL Loader] Optional file not found: ${path}`);
          return null;
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
