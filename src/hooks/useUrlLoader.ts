import { useCallback } from 'react';
import { ColmapManifestSchema, type ColmapManifest, type UrlLoadError, type UrlLoadErrorType } from '../types/manifest';
import { useFileDropzone } from './useFileDropzone';
import { useReconstructionStore } from '../store';
import {
  fetchWithTimeout,
  classifyFetchError,
  classifyFetchErrorWithCloudContext,
  blobToFile,
  getFilenameFromUrl,
  normalizeGitHostingUrl,
  normalizeCloudStorageUrl,
  isManifestUrl,
} from '../utils/urlUtils';
import {
  isZipUrl,
  loadZipFromUrl,
  setActiveZipArchive,
  type ZipProgress,
} from '../utils/zipLoader';
import { clearAllCaches } from '../cache';

// Module-level flag for synchronous load guard (prevents race conditions)
let isLoadInProgress = false;

/**
 * Create a default manifest from a base URL.
 * Assumes standard COLMAP directory structure:
 * - sparse/0/cameras.bin
 * - sparse/0/images.bin
 * - sparse/0/points3D.bin
 * - images/ (for source images)
 * - masks/ (for masks)
 */
function createDefaultManifest(baseUrl: string): ColmapManifest {
  // Remove trailing slash if present
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  return {
    version: 1,
    baseUrl: cleanBaseUrl,
    files: {
      cameras: 'sparse/0/cameras.bin',
      images: 'sparse/0/images.bin',
      points3D: 'sparse/0/points3D.bin',
      rigs: 'sparse/0/rigs.bin',
      frames: 'sparse/0/frames.bin',
    },
    imagesPath: 'images/',
    masksPath: 'masks/',
  };
}

/**
 * Hook for loading COLMAP reconstructions from URLs
 */
export function useUrlLoader() {
  const { processFiles } = useFileDropzone();
  const setError = useReconstructionStore((s) => s.setError);
  const setSourceInfo = useReconstructionStore((s) => s.setSourceInfo);

  // Use store state for URL loading (shared across components)
  const urlLoading = useReconstructionStore((s) => s.urlLoading);
  const urlProgress = useReconstructionStore((s) => s.urlProgress);
  const urlError = useReconstructionStore((s) => s.urlError);
  const setUrlLoading = useReconstructionStore((s) => s.setUrlLoading);
  const setUrlProgress = useReconstructionStore((s) => s.setUrlProgress);
  const setUrlError = useReconstructionStore((s) => s.setUrlError);

  /**
   * Fetch and validate the manifest file
   */
  const fetchManifest = useCallback(async (manifestUrl: string): Promise<ColmapManifest> => {
    setUrlProgress({ percent: 2, message: 'Fetching manifest...' });

    const response = await fetchWithTimeout(manifestUrl);

    if (!response.ok) {
      const errorType: UrlLoadErrorType = response.status === 404 ? 'not_found' : 'network';
      throw {
        type: errorType,
        message: `Failed to fetch manifest (${response.status})`,
        details: response.statusText,
        failedFile: manifestUrl,
      } as UrlLoadError;
    }

    const data = await response.json();

    // Validate with Zod
    const result = ColmapManifestSchema.safeParse(data);
    if (!result.success) {
      const errors = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      throw {
        type: 'invalid_manifest',
        message: 'Invalid manifest format',
        details: errors,
        failedFile: manifestUrl,
      } as UrlLoadError;
    }

    setUrlProgress({ percent: 5, message: 'Manifest loaded' });
    return result.data;
  }, [setUrlProgress]);

  /**
   * Fetch a single file and return as File object
   */
  const fetchFile = useCallback(async (baseUrl: string, relativePath: string): Promise<File> => {
    // Construct full URL - handle trailing slash in baseUrl
    const fullUrl = baseUrl.endsWith('/')
      ? `${baseUrl}${relativePath}`
      : `${baseUrl}/${relativePath}`;

    const response = await fetchWithTimeout(fullUrl);

    if (!response.ok) {
      const errorType: UrlLoadErrorType = response.status === 404 ? 'not_found' : 'network';
      throw {
        type: errorType,
        message: `Failed to fetch file (${response.status})`,
        details: `${relativePath}: ${response.statusText}`,
        failedFile: fullUrl,
      } as UrlLoadError;
    }

    const blob = await response.blob();
    const filename = getFilenameFromUrl(fullUrl);
    return blobToFile(blob, filename);
  }, []);

  /**
   * Fetch all COLMAP binary files from manifest
   */
  const fetchColmapFiles = useCallback(async (manifest: ColmapManifest): Promise<Map<string, File>> => {
    const files = new Map<string, File>();
    const { baseUrl, files: filePaths } = manifest;

    // Required files - these must succeed
    const requiredFiles = [
      { key: 'sparse/0/cameras.bin', path: filePaths.cameras },
      { key: 'sparse/0/images.bin', path: filePaths.images },
      { key: 'sparse/0/points3D.bin', path: filePaths.points3D },
    ];

    // Optional files - 404s are silently ignored
    const optionalFiles: Array<{ key: string; path: string }> = [];
    if (filePaths.rigs) {
      optionalFiles.push({ key: 'sparse/0/rigs.bin', path: filePaths.rigs });
    }
    if (filePaths.frames) {
      optionalFiles.push({ key: 'sparse/0/frames.bin', path: filePaths.frames });
    }

    const totalFiles = requiredFiles.length;
    let downloadedCount = 0;

    setUrlProgress({
      percent: 5,
      message: 'Downloading COLMAP files...',
      filesDownloaded: 0,
      totalFiles,
    });

    // Download required files in parallel - these must succeed
    const requiredResults = await Promise.all(
      requiredFiles.map(async ({ key, path }) => {
        try {
          const file = await fetchFile(baseUrl, path);
          downloadedCount++;

          // Update progress (5-30% for COLMAP files)
          const percent = 5 + Math.round((downloadedCount / totalFiles) * 25);
          setUrlProgress({
            percent,
            message: 'Downloading COLMAP files...',
            currentFile: path,
            filesDownloaded: downloadedCount,
            totalFiles,
          });

          return { key, file };
        } catch (err) {
          // Re-throw with context for required files
          if ((err as UrlLoadError).type) {
            throw err;
          }
          throw classifyFetchError(err, `${baseUrl}/${path}`);
        }
      })
    );

    // Add required files to map
    for (const { key, file } of requiredResults) {
      files.set(key, file);
    }

    // Download optional files in parallel - failures are silently ignored
    if (optionalFiles.length > 0) {
      const optionalResults = await Promise.all(
        optionalFiles.map(async ({ key, path }) => {
          try {
            const file = await fetchFile(baseUrl, path);
            console.log(`[URL Loader] Optional file loaded: ${path}`);
            return { key, file };
          } catch (err) {
            // Silently ignore optional file failures
            console.log(`[URL Loader] Optional file not found: ${path}`);
            return null;
          }
        })
      );

      // Add successful optional files to map
      for (const result of optionalResults) {
        if (result) {
          files.set(result.key, result.file);
        }
      }
    }

    return files;
  }, [fetchFile, setUrlProgress]);

  /**
   * Core manifest loading logic - shared by loadFromUrl and loadFromManifest
   */
  const loadManifestCore = useCallback(async (manifest: ColmapManifest, sourceUrl?: string): Promise<boolean> => {
    // Fetch COLMAP binary files
    const files = await fetchColmapFiles(manifest);
    console.log(`[URL Loader] Downloaded ${files.size} COLMAP files:`, Array.from(files.keys()));

    // Skip image downloading - images will be lazy loaded when needed
    // The existing frustum texture system will handle on-demand loading
    console.log(`[URL Loader] Skipping image download (images will be loaded lazily)`);

    setUrlProgress({ percent: 80, message: 'Parsing reconstruction...' });

    // Compute image URL base for lazy loading
    const imagesPath = manifest.imagesPath ?? 'images/';
    const imageUrlBase = manifest.baseUrl.endsWith('/')
      ? `${manifest.baseUrl}${imagesPath}`
      : `${manifest.baseUrl}/${imagesPath}`;

    // Compute mask URL base for lazy loading
    const masksPath = manifest.masksPath ?? 'masks/';
    const maskUrlBase = manifest.baseUrl.endsWith('/')
      ? `${manifest.baseUrl}${masksPath}`
      : `${manifest.baseUrl}/${masksPath}`;

    // Store source info before processing (includes imageUrlBase and maskUrlBase for lazy loading)
    if (setSourceInfo) {
      setSourceInfo('url', sourceUrl || manifest.baseUrl, imageUrlBase, maskUrlBase);
    }
    console.log(`[URL Loader] Image URL base for lazy loading: ${imageUrlBase}`);
    console.log(`[URL Loader] Mask URL base for lazy loading: ${maskUrlBase}`);

    // Process files using existing pipeline (scale progress from 80-100%)
    console.log('[URL Loader] Calling processFiles...');
    await processFiles(files, { start: 80, end: 100 });

    setUrlProgress({ percent: 100, message: 'Complete' });
    console.log(`[URL Loader] Successfully loaded ${files.size} files from URL`);

    return true;
  }, [fetchColmapFiles, processFiles, setSourceInfo, setUrlProgress]);

  /**
   * Load reconstruction from a ZIP URL.
   * Downloads the ZIP, extracts COLMAP files, and sets up lazy image extraction.
   * Note: Caller (loadFromUrl) is responsible for clearing caches before calling this.
   */
  const loadFromZipUrl = useCallback(async (url: string): Promise<boolean> => {
    console.log(`[URL Loader] Loading ZIP from URL: ${url}`);

    // Progress adapter from ZipProgress to UrlLoadProgress
    const onZipProgress = (progress: ZipProgress) => {
      setUrlProgress({
        percent: progress.percent,
        message: progress.message,
        filesDownloaded: progress.bytesLoaded,
        totalFiles: progress.bytesTotal,
      });
    };

    // Load the ZIP
    const { colmapFiles, imageIndex, archive, fileSize, imageCount } = await loadZipFromUrl(url, onZipProgress);

    // Set up lazy extraction for images
    setActiveZipArchive(archive, imageIndex, fileSize, imageCount);

    setUrlProgress({ percent: 80, message: 'Parsing reconstruction...' });

    // Store source info - for ZIP loading, we set sourceType to 'zip'
    setSourceInfo('zip', url);
    console.log(`[URL Loader] ZIP contains ${colmapFiles.size} COLMAP files, ${imageCount} indexed images`);

    // Process COLMAP files using existing pipeline (scale progress from 80-100%)
    console.log('[URL Loader] Calling processFiles...');
    await processFiles(colmapFiles, { start: 80, end: 100 });

    setUrlProgress({ percent: 100, message: 'Complete' });
    console.log(`[URL Loader] Successfully loaded reconstruction from ZIP`);

    return true;
  }, [processFiles, setSourceInfo, setUrlProgress]);

  /**
   * Main entry point: load reconstruction from URL
   * Accepts either:
   * - A ZIP file URL (ends with .zip)
   * - A manifest JSON URL (ends with .json)
   * - A direct base URL (assumes standard COLMAP directory structure)
   */
  const loadFromUrl = useCallback(async (url: string): Promise<boolean> => {
    // Prevent duplicate loads from rapid clicking (module-level flag for synchronous check)
    if (isLoadInProgress) {
      console.log('[URL Loader] Already loading (sync guard), ignoring duplicate request');
      return false;
    }
    isLoadInProgress = true;

    setUrlLoading(true);
    setUrlError(null);
    setUrlProgress({ percent: 0, message: 'Starting...' });

    // Normalize cloud storage URLs (s3://, gs://, console URLs) to HTTPS
    let normalizedUrl = normalizeCloudStorageUrl(url);
    if (normalizedUrl !== url) {
      console.log(`[URL Loader] Normalized cloud URL: ${url} -> ${normalizedUrl}`);
    }

    // Normalize Git hosting URLs to use raw file endpoints
    const gitNormalizedUrl = normalizeGitHostingUrl(normalizedUrl);
    if (gitNormalizedUrl !== normalizedUrl) {
      console.log(`[URL Loader] Normalized Git URL: ${normalizedUrl} -> ${gitNormalizedUrl}`);
      normalizedUrl = gitNormalizedUrl;
    }

    try {
      // Clear any previous ZIP/URL cache state before loading new data
      // This ensures clean state regardless of previous load type
      clearAllCaches();

      // Check if URL points to a ZIP file
      if (isZipUrl(normalizedUrl)) {
        console.log(`[URL Loader] Detected ZIP URL: ${normalizedUrl}`);
        return await loadFromZipUrl(normalizedUrl);
      }

      // Determine if URL is a manifest or direct base URL
      let manifest: ColmapManifest;

      if (isManifestUrl(normalizedUrl)) {
        // Fetch and validate manifest JSON
        manifest = await fetchManifest(normalizedUrl);
        console.log(`[URL Loader] Loaded manifest: ${manifest.name || 'unnamed'}`);
      } else {
        // Treat as direct base URL with standard COLMAP structure
        manifest = createDefaultManifest(normalizedUrl);
        console.log(`[URL Loader] Using direct URL with default paths: ${normalizedUrl}`);
      }

      return await loadManifestCore(manifest, normalizedUrl);
    } catch (err) {
      console.error('[URL Loader] Error:', err);

      // Clean up any partial state from failed load
      // This ensures ZIP archive references don't linger after errors
      clearAllCaches();

      // Convert to UrlLoadError if not already, with cloud-specific CORS help
      const urlError = (err as UrlLoadError).type
        ? (err as UrlLoadError)
        : classifyFetchErrorWithCloudContext(err, normalizedUrl);

      setUrlError(urlError);

      // Also set the store error for display
      setError(urlError.message + (urlError.details ? `: ${urlError.details}` : ''));

      return false;
    } finally {
      isLoadInProgress = false;
      setUrlLoading(false);
    }
  }, [fetchManifest, loadFromZipUrl, loadManifestCore, setError, setUrlLoading, setUrlProgress, setUrlError]);

  /**
   * Load reconstruction from a pre-parsed manifest object.
   * Used when loading from a local manifest.json file or from an inline manifest in the URL.
   * Sets sourceType to 'manifest' to enable Share/Embed buttons with inline manifest embedding.
   * @param manifest The manifest object to load
   */
  const loadFromManifest = useCallback(async (manifest: ColmapManifest): Promise<boolean> => {
    // Prevent duplicate loads from rapid clicking (module-level flag for synchronous check)
    if (isLoadInProgress) {
      console.log('[URL Loader] Already loading (sync guard), ignoring duplicate request');
      return false;
    }
    isLoadInProgress = true;

    setUrlLoading(true);
    setUrlError(null);
    setUrlProgress({ percent: 0, message: 'Starting...' });

    try {
      // Clear any previous ZIP cache state before loading manifest data
      clearAllCaches();

      console.log(`[URL Loader] Loading from manifest: ${manifest.name || 'unnamed'}`);

      // Fetch COLMAP binary files
      const files = await fetchColmapFiles(manifest);
      console.log(`[URL Loader] Downloaded ${files.size} COLMAP files:`, Array.from(files.keys()));

      // Skip image downloading - images will be lazy loaded when needed
      console.log(`[URL Loader] Skipping image download (images will be loaded lazily)`);

      setUrlProgress({ percent: 80, message: 'Parsing reconstruction...' });

      // Compute image URL base for lazy loading
      const imagesPath = manifest.imagesPath ?? 'images/';
      const imageUrlBase = manifest.baseUrl.endsWith('/')
        ? `${manifest.baseUrl}${imagesPath}`
        : `${manifest.baseUrl}/${imagesPath}`;

      // Compute mask URL base for lazy loading
      const masksPath = manifest.masksPath ?? 'masks/';
      const maskUrlBase = manifest.baseUrl.endsWith('/')
        ? `${manifest.baseUrl}${masksPath}`
        : `${manifest.baseUrl}/${masksPath}`;

      // Store source info - for manifest loading, store the manifest itself for URL embedding
      setSourceInfo('manifest', null, imageUrlBase, maskUrlBase, manifest);
      console.log(`[URL Loader] Image URL base for lazy loading: ${imageUrlBase}`);
      console.log(`[URL Loader] Mask URL base for lazy loading: ${maskUrlBase}`);

      // Process files using existing pipeline (scale progress from 80-100%)
      console.log('[URL Loader] Calling processFiles...');
      await processFiles(files, { start: 80, end: 100 });

      setUrlProgress({ percent: 100, message: 'Complete' });
      console.log(`[URL Loader] Successfully loaded ${files.size} files from manifest`);

      return true;
    } catch (err) {
      console.error('[URL Loader] Error:', err);

      // Clean up any partial state from failed load
      clearAllCaches();

      // Convert to UrlLoadError if not already, with cloud-specific CORS help
      const urlError = (err as UrlLoadError).type
        ? (err as UrlLoadError)
        : classifyFetchErrorWithCloudContext(err, manifest.baseUrl);

      setUrlError(urlError);

      // Also set the store error for display
      setError(urlError.message + (urlError.details ? `: ${urlError.details}` : ''));

      return false;
    } finally {
      isLoadInProgress = false;
      setUrlLoading(false);
    }
  }, [fetchColmapFiles, processFiles, setError, setSourceInfo, setUrlLoading, setUrlProgress, setUrlError]);

  /**
   * Clear URL loading error
   */
  const clearUrlError = useCallback(() => {
    setUrlError(null);
  }, [setUrlError]);

  return {
    loadFromUrl,
    loadFromManifest,
    urlLoading,
    urlProgress,
    urlError,
    clearUrlError,
    setUrlLoading,
    setUrlProgress,
  };
}
