import { type ColmapManifest, type UrlLoadError, type UrlLoadErrorType, type UrlLoadProgress } from '../types/manifest';
import { validateColmapManifest } from '../utils/manifestValidation';
import { blobToFile, classifyFetchError, getFilenameFromUrl, readResponseToBlob, type DownloadProgressCallback } from '../utils/urlUtils';
import { appLogger } from '../utils/logger';
import { getManifestColmapFileEntries, joinManifestUrlPath } from './urlLoaderPolicy';
import { isUrlLoadError } from './urlLoaderErrorHandling';
import { fetchDatasetResource } from '../utils/fetchDatasetResource';
import { assertStorageReadAccess } from '../features/storageAccess';
import { readBoundedResponseBytes } from '../dataset/importers/sourceAccess';
import { isNerfTransforms } from '../dataset/importers/nerfTransforms';
import { isOpenSfm, isOpenMvg } from '../dataset/importers/sfmFormats';
import { isGaussianCameraJson } from '../dataset/importers/gaussianCameraJson';
import { MAX_CAMERA_METADATA_BYTES } from '../dataset/importers/types';
import { rememberNativeMediaSource } from '../dataset/nativeMedia';
import { openManifestMediaArchives, rememberManifestMediaArchives } from './urlLoaderMediaArchives';
import { getDiscoveredManifestMedia } from './urlLoaderColmapDiscovery';

// Keep the loader's existing entry point stable while discovery owns its implementations.
export {
  deriveMasksPathFromImages, discoverHuggingFaceColmapPaths, discoverHuggingFaceLayout,
  withDiscoveredColmapPaths, type DiscoverColmapDeps, type HuggingFaceLayout,
} from './urlLoaderColmapDiscovery';
export {
  discoverDirectoryListingSplatPath, discoverDirectoryListingSplatPaths,
  discoverHuggingFaceSplatPath, discoverHuggingFaceSplatPaths, discoverManifestSplatCatalog,
  type DiscoverManifestSplatDeps, type DiscoverDirectoryListingSplatDeps,
  type DiscoverHuggingFaceSplatDeps, type ClassifySplatUrl, type SplatUrlClassification,
} from './urlLoaderSplatDiscovery';

type FetchUrl = (url: string, init?: RequestInit) => Promise<Response>;

type FetchManifestFile = (
  baseUrl: string,
  relativePath: string,
  onProgress?: DownloadProgressCallback
) => Promise<File>;

type SetUrlProgress = (progress: UrlLoadProgress | null) => void;

export interface FetchUrlManifestDeps {
  fetchImpl?: FetchUrl;
  setUrlProgress: SetUrlProgress;
}

export interface FetchManifestFileOptions {
  fetchImpl?: FetchUrl;
  onProgress?: DownloadProgressCallback;
}

export interface FetchManifestColmapFilesDeps {
  signal?: AbortSignal;
  fetchImpl?: FetchUrl;
  /** Lazy archive reads must outlive the initial model load's fetch guard. */
  mediaFetchImpl?: FetchUrl;
  fetchFile?: FetchManifestFile;
  log?: (message: string) => void;
  setUrlProgress: SetUrlProgress;
}

function defaultFetchUrl(url: string, init?: RequestInit): Promise<Response> {
  return fetchDatasetResource(url, undefined, init);
}

function dirnameOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash >= 0 ? path.slice(0, slash) : '';
}

export interface CameraDatasetDocument { kind: 'camera-dataset'; metadataFile: File }

export function fetchUrlManifest(manifestUrl: string, deps: FetchUrlManifestDeps): Promise<ColmapManifest>;
export function fetchUrlManifest(manifestUrl: string, deps: FetchUrlManifestDeps, allowCamera: true): Promise<ColmapManifest | CameraDatasetDocument>;
export async function fetchUrlManifest(
  manifestUrl: string,
  deps: FetchUrlManifestDeps,
  allowCamera = false,
): Promise<ColmapManifest | CameraDatasetDocument> {
  const fetchImpl = deps.fetchImpl ?? defaultFetchUrl;
  deps.setUrlProgress({ percent: 2, message: 'Fetching manifest...' });

  const response = await fetchImpl(manifestUrl);

  if (!response.ok) {
    assertStorageReadAccess(response, manifestUrl);
    const errorType: UrlLoadErrorType = response.status === 404 ? 'not_found' : 'network';
    const error: UrlLoadError = {
      type: errorType,
      message: `Failed to fetch manifest (${response.status})`,
      details: response.statusText,
      failedFile: manifestUrl,
    };
    throw error;
  }

  const chunks = allowCamera ? await readBoundedResponseBytes(response, getFilenameFromUrl(manifestUrl), MAX_CAMERA_METADATA_BYTES) : null;
  const metadataFile = chunks ? new File(chunks, getFilenameFromUrl(manifestUrl)) : null;
  const decoder = new TextDecoder();
  const data: unknown = chunks ? JSON.parse((chunks.map(chunk => decoder.decode(chunk, { stream: true })).join('') + decoder.decode()).replace(/^\uFEFF/, '')) : await response.json();
  // A manifest-shaped document must pass manifest validation, even if it also contains frames.
  if (metadataFile && !(data && typeof data === 'object' && 'files' in data)
    && (isNerfTransforms(data) || isOpenSfm(data) || isOpenMvg(data) || isGaussianCameraJson(data))) {
    return { kind: 'camera-dataset', metadataFile };
  }
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
    assertStorageReadAccess(response, fullUrl);
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
  // The caller discovers and activates splats after viewer settings settle.
  const { baseUrl } = manifest;
  const { requiredFiles, optionalFiles } = getManifestColmapFileEntries(manifest);

  const totalFiles = requiredFiles.length;
  let downloadedCount = 0;

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
    // Only rigs/frames remain here; splats are activated after saved settings settle.
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

  const media = getDiscoveredManifestMedia(manifest);
  // Explicit manifest lists and overrides retain their original URL scope when
  // inferred sibling media uses the broader scene as its source.
  const mediaPath = (path: string) => media && media.baseUrl !== manifest.baseUrl
    ? joinManifestUrlPath(manifest.baseUrl, path) : path;
  const manifestOverrides = manifest.imageNameToPath && Object.fromEntries(Object.entries(manifest.imageNameToPath)
    .map(([name, path]) => [name, mediaPath(path)]));
  deps.signal?.throwIfAborted();
  const archives = await openManifestMediaArchives(manifest, { signal: deps.signal, fetchImpl: deps.mediaFetchImpl ?? deps.fetchImpl });
  const imagePaths = archives ? [...archives.imagePaths, ...(manifest.images?.map(mediaPath) ?? [])] : manifest.images?.map(mediaPath);
  const maskPaths = archives ? [...archives.maskPaths, ...(manifest.masks?.map(mediaPath) ?? [])] : manifest.masks?.map(mediaPath);
  if (archives) rememberManifestMediaArchives(files, archives);
  if (!manifest.skipImages) rememberNativeMediaSource(files, {
    source: { kind: 'url', baseUrl: joinManifestUrlPath(media?.baseUrl ?? manifest.baseUrl, ''),
      ...(archives && { archiveEntries: archives.entries }) },
    paths: archives ? [...(media?.paths ?? []), ...imagePaths!, ...maskPaths!] : media?.paths,
    imagePaths, modelDir: media?.modelDir ?? dirnameOf(manifest.files.cameras),
    // Keep inferred relative mappings relative so the native index still checks
    // their physical existence; absolutizing them would bypass that check.
    overrides: media?.overrides ?? manifestOverrides,
    declaredImageRoot: joinManifestUrlPath(manifest.baseUrl, manifest.imagesPath ?? 'images/').replace(/\/?$/, '/'),
    // A discovered sibling prefix is inference; the full listing must bind masks to the resolved photos.
    declaredMaskRoot: media || manifest.masksPath === undefined ? undefined : joinManifestUrlPath(manifest.baseUrl, manifest.masksPath).replace(/\/?$/, '/'),
    maskOverrides: manifest.maskNameToPath && Object.fromEntries(Object.entries(manifest.maskNameToPath)
      .map(([name, path]) => [name, joinManifestUrlPath(manifest.baseUrl, path)])),
    maskRole: manifest.maskRole,
    maskPaths,
  });
  return files;
}
