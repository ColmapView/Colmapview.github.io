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
  type RemoteSplatCandidate,
} from './urlLoaderPolicy';
import { URL_LOAD_GUARD_MESSAGE } from './urlLoaderLoadGuard';
import { fetchUrlManifest, withDiscoveredColmapPaths } from './urlLoaderManifestFetch';
import { handleUrlLoadFailure } from './urlLoaderErrorHandling';
import { loadZipUrlSource } from './urlLoaderZipSource';
import { loadManifestSource } from './urlLoaderManifestSource';
import { isSplatUrl, loadSplatUrlSource } from './urlLoaderSplatSource';
import { applySavedViewerState, decodeSharedViewerOverrides } from './useUrlState';
import type { PublishedViewerState } from '../utils/publishedViewerState';
import { fetchDatasetViewerSettings } from './urlLoaderViewerState';
import { findDatasetViewerSettingsEntry } from '../utils/datasetViewerSettings';

export interface UseUrlLoaderDeps {
  logger?: Pick<AppLogger, 'error' | 'info'>;
  /** Only startup loads should inherit settings from the current viewer URL. */
  applyUrlOverrides?: boolean;
}

type ReconstructionState = ReturnType<typeof useReconstructionStore.getState>;

interface UrlLoadContext {
  onViewerState: (state: PublishedViewerState) => Promise<void>;
  onRemoteSplatCatalog: (catalog: RemoteSplatCandidate[]) => void;
  signal: AbortSignal;
  assertCurrent: () => void;
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  processFiles: ReturnType<typeof useFileDropzone>['processFiles'];
  setSourceInfo: ReconstructionState['setSourceInfo'];
  setUrlProgress: ReconstructionState['setUrlProgress'];
  clearCachesOnFailure: boolean;
  hasEmbeddedViewerSettings: boolean;
}

/** Owns URL discovery, downloading, and the handoff to reconstruction parsing. */
export function useUrlLoader({ logger = appLogger, applyUrlOverrides = false }: UseUrlLoaderDeps = {}) {
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
    const initialHash = applyUrlOverrides ? window.location.hash : '';
    let savedViewerState: PublishedViewerState | null = null;
    const load: UrlLoadContext = {
      // Recorded here and applied once the load succeeds, together with the URL's own settings.
      onViewerState: async (state) => { savedViewerState = state; },
      onRemoteSplatCatalog: guard(catalog => mergeRemoteSplatCatalog(catalog, contextUrl)),
      signal,
      assertCurrent,
      fetchImpl: guard((url, init) => fetchWithTimeout(url, undefined, { ...init, signal })),
      processFiles: guard((files, range, options) => {
        load.hasEmbeddedViewerSettings = Boolean(findDatasetViewerSettingsEntry(files));
        return processFiles(files, range, { ...options, onViewerState: load.onViewerState });
      }),
      setSourceInfo: guard(setSourceInfo),
      setUrlProgress: guard(setUrlProgress),
      clearCachesOnFailure: true,
      hasEmbeddedViewerSettings: false,
    };
    setUrlLoading(true);
    setUrlError(null);
    setUrlProgress({ percent: 0, message: 'Starting...' });

    try {
      const loaded = await work(load);
      assertCurrent();
      if (loaded) {
        const shared = await decodeSharedViewerOverrides(initialHash);
        assertCurrent();
        await applySavedViewerState(savedViewerState, shared, assertCurrent);
        assertCurrent();
      }
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
    setUrlError, logError, setError, finishUrlLoad, applyUrlOverrides, mergeRemoteSplatCatalog]);

  const loadFromUrl = useCallback((url: string): Promise<boolean> => runLoad(url, async (load) => {
    const normalized = normalizeLoadUrl(url);
    const normalizedUrl = normalized.url;
    for (const step of normalized.steps) logInfo(getUrlNormalizationLogMessage(step));

    if (isSplatUrl(normalizedUrl)) {
      load.clearCachesOnFailure = false;
      const loaded = await loadSplatUrlSource(normalizedUrl, {
        ...load,
        log: logInfo,
        onSplatFileFetched: () => {
          load.assertCurrent();
          clearAllCaches();
          load.clearCachesOnFailure = true;
        },
      });
      if (loaded) {
        const settings = await fetchDatasetViewerSettings(normalizedUrl, load.fetchImpl, true);
        if (settings) await load.onViewerState(settings);
      }
      return loaded;
    }

    clearAllCaches();
    if (isArchiveUrl(normalizedUrl)) {
      logInfo(getArchiveUrlDetectedLogMessage(normalizedUrl));
      const loaded = await loadZipUrlSource(normalizedUrl, { ...load, log: logInfo });
      if (loaded && !load.hasEmbeddedViewerSettings) {
        const settings = await fetchDatasetViewerSettings(normalizedUrl, load.fetchImpl, true);
        if (settings) await load.onViewerState(settings);
      }
      return loaded;
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

    const loaded = await loadManifestSource(manifest, { type: 'url', sourceUrl: normalizedUrl }, {
      ...load,
      log: logInfo,
      onRemoteSplatCatalog: (candidates) => {
        load.assertCurrent();
        mergeRemoteSplatCatalog(candidates, manifest.baseUrl);
      },
    });
    load.assertCurrent();
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
