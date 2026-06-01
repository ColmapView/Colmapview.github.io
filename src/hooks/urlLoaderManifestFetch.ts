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
  getManifestColmapFileEntries,
  joinManifestUrlPath,
} from './urlLoaderPolicy';
import { isUrlLoadError } from './urlLoaderErrorHandling';

type FetchUrl = (url: string) => Promise<Response>;
type FetchManifestFile = (baseUrl: string, relativePath: string) => Promise<File>;
type SetUrlProgress = (progress: UrlLoadProgress | null) => void;

export interface FetchUrlManifestDeps {
  fetchImpl?: FetchUrl;
  setUrlProgress: SetUrlProgress;
}

export interface FetchManifestFileOptions {
  fetchImpl?: FetchUrl;
}

export interface FetchManifestColmapFilesDeps {
  fetchFile?: FetchManifestFile;
  log?: (message: string) => void;
  setUrlProgress: SetUrlProgress;
}

export async function fetchUrlManifest(
  manifestUrl: string,
  deps: FetchUrlManifestDeps
): Promise<ColmapManifest> {
  const fetchImpl = deps.fetchImpl ?? fetchWithTimeout;
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
  const fetchImpl = options.fetchImpl ?? fetchWithTimeout;
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
  const { baseUrl } = manifest;
  const { requiredFiles, optionalFiles } = getManifestColmapFileEntries(manifest);
  const fetchFile = deps.fetchFile ?? fetchManifestFile;
  const log = deps.log ?? appLogger.info;

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
