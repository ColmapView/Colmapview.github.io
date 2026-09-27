import { useCallback } from 'react';
import type { ColmapManifest } from '../types/manifest';
import { useFileDropzone } from './useFileDropzone';
import { useReconstructionStore } from '../store';
import { useNotificationStore } from '../store/stores/notificationStore';
import { fetchWithTimeout, isManifestUrl } from '../utils/urlUtils';
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
import { fetchUrlManifest, withDiscoveredColmapPaths } from './urlLoaderManifestFetch';
import { handleUrlLoadFailure } from './urlLoaderErrorHandling';
import { loadZipUrlSource } from './urlLoaderZipSource';
import { loadManifestSource } from './urlLoaderManifestSource';
import { isSplatUrl, loadSplatUrlSource } from './urlLoaderSplatSource';

export interface UseUrlLoaderDeps {
  logger?: Pick<AppLogger, 'error' | 'info'>;
}

type ReconstructionState = ReturnType<typeof useReconstructionStore.getState>;

interface UrlLoadContext {
  signal: AbortSignal;
  assertCurrent: () => void;
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  processFiles: ReturnType<typeof useFileDropzone>['processFiles'];
  setSourceInfo: ReconstructionState['setSourceInfo'];
  setUrlProgress: ReconstructionState['setUrlProgress'];
  clearCachesOnFailure: boolean;
}

/** Owns URL discovery, downloading, and the handoff to reconstruction parsing. */
export function useUrlLoader({ logger = appLogger }: UseUrlLoaderDeps = {}) {
  const { processFiles } = useFileDropzone();
  const logError = logger.error;
  const logInfo = logger.info;
  const setError = useReconstructionStore((s) => s.setError);
  const setSourceInfo = useReconstructionStore((s) => s.setSourceInfo);
  const mergeRemoteSplatCatalog = useReconstructionStore((s) => s.mergeRemoteSplatCatalog);
  const urlLoading = useReconstructionStore((s) => s.urlLoading);
  const urlProgress = useReconstructionStore((s) => s.urlProgress);
  const urlError = useReconstructionStore((s) => s.urlError);
  const setUrlLoading = useReconstructionStore((s) => s.setUrlLoading);
  const setUrlProgress = useReconstructionStore((s) => s.setUrlProgress);
  const setUrlError = useReconstructionStore((s) => s.setUrlError);
  const tryStartUrlLoad = useReconstructionStore((s) => s.tryStartUrlLoad);
  const finishUrlLoad = useReconstructionStore((s) => s.finishUrlLoad);

  const runLoad = useCallback(async (
    contextUrl: string,
    work: (load: UrlLoadContext) => Promise<boolean>
  ): Promise<boolean> => {
    const signal = tryStartUrlLoad();
    if (!signal) {
      logInfo(URL_LOAD_GUARD_MESSAGE);
      return false;
    }
    const isCurrent = () => !signal.aborted
      && useReconstructionStore.getState().urlLoadController?.signal === signal;
    const assertCurrent = () => {
      if (!isCurrent()) throw new DOMException('Dataset load cancelled', 'AbortError');
    };
    // Guard every state publication, including callbacks from parallel downloads.
    const guard = <Args extends unknown[], Result>(callback: (...args: Args) => Result) =>
      (...args: Args): Result => {
        assertCurrent();
        return callback(...args);
      };
    const load: UrlLoadContext = {
      signal,
      assertCurrent,
      fetchImpl: guard((url, init) => fetchWithTimeout(url, undefined, { ...init, signal })),
      processFiles: guard(processFiles),
      setSourceInfo: guard(setSourceInfo),
      setUrlProgress: guard(setUrlProgress),
      clearCachesOnFailure: true,
    };
    setUrlLoading(true);
    setUrlError(null);
    setUrlProgress({ percent: 0, message: 'Starting...' });

    try {
      const loaded = await work(load);
      assertCurrent();
      return loaded;
    } catch (error) {
      if (isCurrent()) {
        handleUrlLoadFailure(error, {
          clearCaches: load.clearCachesOnFailure ? clearAllCaches : () => undefined,
          contextUrl,
          errorLog: logError,
          setError,
          setUrlError,
        });
      }
      return false;
    } finally {
      // An old task must not finish a newer task's guard or loading indicator.
      if (isCurrent()) {
        finishUrlLoad(signal);
        const state = useReconstructionStore.getState();
        if (!isSplatLoadingProgressForFile(state.urlProgress, state.loadedFiles?.splatFile)) {
          setUrlLoading(false);
        }
      }
    }
  }, [tryStartUrlLoad, logInfo, processFiles, setSourceInfo, setUrlProgress, setUrlLoading,
    setUrlError, logError, setError, finishUrlLoad]);

  const loadFromUrl = useCallback((url: string): Promise<boolean> => runLoad(url, async (load) => {
    const normalized = normalizeLoadUrl(url);
    const normalizedUrl = normalized.url;
    for (const step of normalized.steps) logInfo(getUrlNormalizationLogMessage(step));

    if (isSplatUrl(normalizedUrl)) {
      load.clearCachesOnFailure = false;
      return loadSplatUrlSource(normalizedUrl, {
        ...load,
        log: logInfo,
        onSplatFileFetched: () => {
          load.assertCurrent();
          clearAllCaches();
          load.clearCachesOnFailure = true;
        },
      });
    }

    clearAllCaches();
    if (isArchiveUrl(normalizedUrl)) {
      logInfo(getArchiveUrlDetectedLogMessage(normalizedUrl));
      return loadZipUrlSource(normalizedUrl, { ...load, log: logInfo });
    }

    let manifest: ColmapManifest;
    if (isManifestUrl(normalizedUrl)) {
      manifest = await fetchUrlManifest(normalizedUrl, load);
      logInfo(getManifestLoadedLogMessage(manifest));
    } else {
      manifest = await withDiscoveredColmapPaths(createDefaultManifest(normalizedUrl), {
        fetchImpl: load.fetchImpl,
        log: logInfo,
        onLargeDatasetWarning: (message) => {
          load.assertCurrent();
          useNotificationStore.getState().addNotification('warning', message, 8000);
        },
      });
      logInfo(getDefaultUrlManifestLogMessage(normalizedUrl));
    }
    load.assertCurrent();

    const catalog: { path: string; size: number; splatCount: number | null }[] = [];
    const loaded = await loadManifestSource(manifest, { type: 'url', sourceUrl: normalizedUrl }, {
      ...load,
      log: logInfo,
      onRemoteSplatCatalog: (candidates) => {
        load.assertCurrent();
        catalog.push(...candidates.map((candidate) => ({
          path: candidate.path, size: candidate.size, splatCount: candidate.splatCount ?? null,
        })));
      },
    });
    load.assertCurrent();
    if (loaded && catalog.length > 0 && !useReconstructionStore.getState().loadedFiles?.splatFile) {
      mergeRemoteSplatCatalog(catalog, manifest.baseUrl);
    }
    return loaded;
  }), [runLoad, logInfo, mergeRemoteSplatCatalog]);

  const loadFromManifest = useCallback((manifest: ColmapManifest): Promise<boolean> =>
    runLoad(manifest.baseUrl, async (load) => {
      clearAllCaches();
      logInfo(getInlineManifestLoadLogMessage(manifest));
      return loadManifestSource(manifest, { type: 'manifest' }, { ...load, log: logInfo });
    }), [runLoad, logInfo]);

  const clearUrlError = useCallback(() => setUrlError(null), [setUrlError]);
  return { loadFromUrl, loadFromManifest, urlLoading, urlProgress, urlError,
    clearUrlError, setUrlLoading, setUrlProgress };
}
