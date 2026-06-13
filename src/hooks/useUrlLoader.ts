import { useCallback } from 'react';
import type { ColmapManifest } from '../types/manifest';
import { useFileDropzone } from './useFileDropzone';
import { useReconstructionStore } from '../store';
import { isManifestUrl } from '../utils/urlUtils';
import { isArchiveUrl } from '../utils/zipLoader';
import { clearAllCaches } from '../cache';
import { appLogger, type AppLogger } from '../utils/logger';
import { isSplatLoadingProgressForFile } from '../utils/splatLoadingProgressPolicy';
import {
  createDefaultManifest,
  getArchiveUrlDetectedLogMessage,
  getDefaultUrlManifestLogMessage,
  getInlineManifestLoadLogMessage,
  getManifestLoadedLogMessage,
  getUrlNormalizationLogMessage,
  normalizeLoadUrl,
} from './urlLoaderPolicy';
import { URL_LOAD_GUARD_MESSAGE } from './urlLoaderLoadGuard';
import { fetchUrlManifest } from './urlLoaderManifestFetch';
import { handleUrlLoadFailure } from './urlLoaderErrorHandling';
import { loadZipUrlSource } from './urlLoaderZipSource';
import { loadManifestSource } from './urlLoaderManifestSource';
import { isSplatUrl, loadSplatUrlSource } from './urlLoaderSplatSource';

export interface UseUrlLoaderDeps {
  logger?: Pick<AppLogger, 'error' | 'info'>;
}

/**
 * Hook for loading COLMAP reconstructions from URLs
 */
export function useUrlLoader({ logger = appLogger }: UseUrlLoaderDeps = {}) {
  const { processFiles } = useFileDropzone();
  const logError = logger.error;
  const logInfo = logger.info;
  const setError = useReconstructionStore((s) => s.setError);
  const setSourceInfo = useReconstructionStore((s) => s.setSourceInfo);

  // Use store state for URL loading (shared across components)
  const urlLoading = useReconstructionStore((s) => s.urlLoading);
  const urlProgress = useReconstructionStore((s) => s.urlProgress);
  const urlError = useReconstructionStore((s) => s.urlError);
  const setUrlLoading = useReconstructionStore((s) => s.setUrlLoading);
  const setUrlProgress = useReconstructionStore((s) => s.setUrlProgress);
  const setUrlError = useReconstructionStore((s) => s.setUrlError);
  const tryStartUrlLoad = useReconstructionStore((s) => s.tryStartUrlLoad);
  const finishUrlLoad = useReconstructionStore((s) => s.finishUrlLoad);
  const shouldKeepUrlLoadingForSplatRenderer = useCallback(() => {
    const state = useReconstructionStore.getState();
    return isSplatLoadingProgressForFile(state.urlProgress, state.loadedFiles?.splatFile);
  }, []);

  /**
   * Fetch and validate the manifest file
   */
  const fetchManifest = useCallback(async (manifestUrl: string): Promise<ColmapManifest> => {
    return fetchUrlManifest(manifestUrl, { setUrlProgress });
  }, [setUrlProgress]);

  /**
   * Load reconstruction from a ZIP URL.
   * Downloads the ZIP, extracts COLMAP files, and sets up lazy image extraction.
   * Note: Caller (loadFromUrl) is responsible for clearing caches before calling this.
   */
  const loadFromZipUrl = useCallback(async (url: string): Promise<boolean> => {
    return loadZipUrlSource(url, {
      log: logInfo,
      processFiles,
      setSourceInfo,
      setUrlProgress,
    });
  }, [logInfo, processFiles, setSourceInfo, setUrlProgress]);

  const loadFromSplatUrl = useCallback(async (
    url: string,
    options: { onSplatFileFetched?: (file: File) => void } = {}
  ): Promise<boolean> => {
    return loadSplatUrlSource(url, {
      log: logInfo,
      onSplatFileFetched: options.onSplatFileFetched,
      processFiles,
      setSourceInfo,
      setUrlProgress,
    });
  }, [logInfo, processFiles, setSourceInfo, setUrlProgress]);

  /**
   * Main entry point: load reconstruction from URL
   * Accepts either:
   * - A ZIP file URL (ends with .zip)
   * - A splat file URL (ends with .spz or .ply)
   * - A manifest JSON URL (ends with .json)
   * - A direct base URL (assumes standard COLMAP directory structure)
   */
  const loadFromUrl = useCallback(async (url: string): Promise<boolean> => {
    if (!tryStartUrlLoad()) {
      logInfo(URL_LOAD_GUARD_MESSAGE);
      return false;
    }

    setUrlLoading(true);
    setUrlError(null);
    setUrlProgress({ percent: 0, message: 'Starting...' });

    const normalized = normalizeLoadUrl(url);
    const normalizedUrl = normalized.url;
    for (const step of normalized.steps) {
      logInfo(getUrlNormalizationLogMessage(step));
    }

    let clearCachesOnFailure = true;
    try {
      if (isSplatUrl(normalizedUrl)) {
        clearCachesOnFailure = false;
        return await loadFromSplatUrl(normalizedUrl, {
          onSplatFileFetched: () => {
            clearAllCaches();
            clearCachesOnFailure = true;
          },
        });
      }

      // Clear any previous ZIP/URL cache state before loading new data
      // This ensures clean state regardless of previous load type
      clearAllCaches();

      // Check if URL points to a ZIP file
      if (isArchiveUrl(normalizedUrl)) {
        logInfo(getArchiveUrlDetectedLogMessage(normalizedUrl));
        return await loadFromZipUrl(normalizedUrl);
      }

      // Determine if URL is a manifest or direct base URL
      let manifest: ColmapManifest;

      if (isManifestUrl(normalizedUrl)) {
        // Fetch and validate manifest JSON
        manifest = await fetchManifest(normalizedUrl);
        logInfo(getManifestLoadedLogMessage(manifest));
      } else {
        // Treat as direct base URL with standard COLMAP structure
        manifest = createDefaultManifest(normalizedUrl);
        logInfo(getDefaultUrlManifestLogMessage(normalizedUrl));
      }

      return await loadManifestSource(manifest, { type: 'url', sourceUrl: normalizedUrl }, {
        log: logInfo,
        processFiles,
        setSourceInfo,
        setUrlProgress,
      });
    } catch (err) {
      handleUrlLoadFailure(err, {
        clearCaches: clearCachesOnFailure ? clearAllCaches : () => undefined,
        contextUrl: normalizedUrl,
        errorLog: logError,
        setError,
        setUrlError,
      });
      return false;
    } finally {
      finishUrlLoad();
      if (!shouldKeepUrlLoadingForSplatRenderer()) {
        setUrlLoading(false);
      }
    }
  }, [
    fetchManifest,
    finishUrlLoad,
    loadFromZipUrl,
    loadFromSplatUrl,
    logError,
    logInfo,
    processFiles,
    setError,
    shouldKeepUrlLoadingForSplatRenderer,
    setSourceInfo,
    setUrlError,
    setUrlLoading,
    setUrlProgress,
    tryStartUrlLoad,
  ]);

  /**
   * Load reconstruction from a pre-parsed manifest object.
   * Used when loading from a local manifest.json file or from an inline manifest in the URL.
   * Sets sourceType to 'manifest' to enable Share/Embed buttons with inline manifest embedding.
   * @param manifest The manifest object to load
   */
  const loadFromManifest = useCallback(async (manifest: ColmapManifest): Promise<boolean> => {
    if (!tryStartUrlLoad()) {
      logInfo(URL_LOAD_GUARD_MESSAGE);
      return false;
    }

    setUrlLoading(true);
    setUrlError(null);
    setUrlProgress({ percent: 0, message: 'Starting...' });

    try {
      // Clear any previous ZIP cache state before loading manifest data
      clearAllCaches();

      logInfo(getInlineManifestLoadLogMessage(manifest));

      return await loadManifestSource(manifest, { type: 'manifest' }, {
        log: logInfo,
        processFiles,
        setSourceInfo,
        setUrlProgress,
      });
    } catch (err) {
      handleUrlLoadFailure(err, {
        clearCaches: clearAllCaches,
        contextUrl: manifest.baseUrl,
        errorLog: logError,
        setError,
        setUrlError,
      });
      return false;
    } finally {
      finishUrlLoad();
      if (!shouldKeepUrlLoadingForSplatRenderer()) {
        setUrlLoading(false);
      }
    }
  }, [
    finishUrlLoad,
    logError,
    logInfo,
    processFiles,
    setError,
    shouldKeepUrlLoadingForSplatRenderer,
    setSourceInfo,
    setUrlError,
    setUrlLoading,
    setUrlProgress,
    tryStartUrlLoad,
  ]);

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
