import type { ReconstructionSourceType } from '../store/reconstructionStore';
import type { UrlLoadError, UrlLoadProgress } from '../types/manifest';
import { appLogger } from '../utils/logger';
import { isSplatFilePath } from '../utils/splatFilePolicy';
import {
  blobToFile,
  classifyFetchError,
  fetchWithTimeout,
  getFilenameFromUrl,
} from '../utils/urlUtils';
import { isUrlLoadError } from './urlLoaderErrorHandling';

type FetchUrl = (url: string) => Promise<Response>;
type ProcessFiles = (
  files: Map<string, File>,
  progressRange?: { start: number; end: number },
  options?: { throwOnError?: boolean }
) => Promise<void>;
type SetSourceInfo = (
  type: ReconstructionSourceType,
  url?: string | null,
  imageUrlBase?: string | null,
  maskUrlBase?: string | null
) => void;
type SetUrlProgress = (progress: UrlLoadProgress | null) => void;

export interface LoadSplatUrlSourceDeps {
  fetchSplatFile?: (url: string) => Promise<File>;
  log?: (message: string) => void;
  processFiles: ProcessFiles;
  setSourceInfo: SetSourceInfo;
  setUrlProgress: SetUrlProgress;
}

export function isSplatUrl(url: string): boolean {
  try {
    return isSplatFilePath(new URL(url).pathname);
  } catch {
    return isSplatFilePath(url.split(/[?#]/, 1)[0]);
  }
}

export async function fetchSplatUrlFile(
  url: string,
  fetchImpl: FetchUrl = fetchWithTimeout
): Promise<File> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      const error: UrlLoadError = {
        type: response.status === 404 ? 'not_found' : 'network',
        message: `Failed to fetch splat (${response.status})`,
        details: response.statusText,
        failedFile: url,
      };
      throw error;
    }

    const blob = await response.blob();
    return blobToFile(blob, getFilenameFromUrl(url));
  } catch (error) {
    if (isUrlLoadError(error)) {
      throw error;
    }
    throw classifyFetchError(error, url);
  }
}

export async function loadSplatUrlSource(
  url: string,
  deps: LoadSplatUrlSourceDeps
): Promise<boolean> {
  const log = deps.log ?? appLogger.info;
  const fetchSplatFile = deps.fetchSplatFile ?? fetchSplatUrlFile;

  log(`[URL Loader] Loading splat from URL: ${url}`);
  deps.setUrlProgress({ percent: 5, message: 'Downloading splat file...' });

  const splatFile = await fetchSplatFile(url);
  const files = new Map([[splatFile.name, splatFile]]);

  deps.setUrlProgress({
    percent: 80,
    message: 'Parsing splat scene...',
    currentFile: splatFile.name,
  });
  deps.setSourceInfo('url', url, null, null);

  await deps.processFiles(files, { start: 80, end: 100 }, { throwOnError: true });

  log(`[URL Loader] Successfully loaded splat from URL: ${splatFile.name}`);

  return true;
}
