import type { ReconstructionSourceType } from '../store/reconstructionStore';
import type { UrlLoadError, UrlLoadProgress } from '../types/manifest';
import { appLogger } from '../utils/logger';
import { isSplatFilePath } from '../utils/splatFilePolicy';
import {
  blobToFile,
  classifyFetchError,
  getFilenameFromUrl,
} from '../utils/urlUtils';
import { isUrlLoadError } from './urlLoaderErrorHandling';
import { fetchDatasetResource } from '../utils/fetchDatasetResource';

type FetchUrl = (url: string) => Promise<Response>;
type ProcessFiles = (
  files: Map<string, File>,
  progressRange?: { start: number; end: number },
  options?: { replaceSplatScene?: boolean; throwOnError?: boolean; signal?: AbortSignal; onSceneReplaced?: () => void }
) => Promise<void | boolean>;
type SetSourceInfo = (
  type: ReconstructionSourceType,
  url?: string | null,
  imageUrlBase?: string | null,
  maskUrlBase?: string | null
) => void;
type SetUrlProgress = (progress: UrlLoadProgress | null) => void;

export interface LoadSplatUrlSourceDeps {
  signal?: AbortSignal;
  assertCurrent?: () => void;
  fetchImpl?: FetchUrl;
  fetchSplatFile?: (url: string) => Promise<File>;
  log?: (message: string) => void;
  onSplatFileFetched?: (file: File) => void;
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
  fetchImpl: FetchUrl = fetchDatasetResource
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
  const fetchSplatFile = deps.fetchSplatFile ?? ((targetUrl: string) => fetchSplatUrlFile(targetUrl, deps.fetchImpl));

  log(`[URL Loader] Loading splat or point cloud from URL: ${url}`);
  deps.setUrlProgress({ percent: 5, message: 'Downloading 3D file...' });

  const splatFile = await fetchSplatFile(url);
  deps.signal?.throwIfAborted();
  deps.assertCurrent?.();
  deps.onSplatFileFetched?.(splatFile);
  const files = new Map([[splatFile.name, splatFile]]);

  deps.setUrlProgress({
    percent: 80,
    message: 'Parsing 3D scene...',
    currentFile: splatFile.name,
  });
  let committed = false;
  const commitSource = () => {
    deps.signal?.throwIfAborted();
    deps.assertCurrent?.();
    if (committed) return;
    deps.setSourceInfo('url', url, null, null);
    committed = true;
  };

  const processed = await deps.processFiles(files, { start: 80, end: 100 }, {
    replaceSplatScene: true,
    throwOnError: true,
    signal: deps.signal,
    onSceneReplaced: commitSource,
  });
  deps.signal?.throwIfAborted();
  deps.assertCurrent?.();
  if (processed === false) return false;
  commitSource();

  log(`[URL Loader] Successfully loaded 3D file from URL: ${splatFile.name}`);

  return true;
}
