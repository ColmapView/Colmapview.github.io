import { useCallback } from 'react';
import type { ColmapManifest } from '../types/manifest';
import { useFileDropzone } from './useFileDropzone';
import { useReconstructionStore } from '../store';
import { isSplatDownloadPending } from '../store/reconstructionStore';
import { useNotificationStore } from '../store/stores/notificationStore';
import { isManifestUrl } from '../utils/urlUtils';
import { fetchDatasetResource } from '../utils/fetchDatasetResource';
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
import { applySavedViewerState, decodeSharedViewerOverrides, resolveRestoredSplatSourceId,
  type SharedViewerOverrides } from './useUrlState';
import type { PublishedViewerState } from '../utils/publishedViewerState';
import { startOptionalDatasetViewerSettings, type OptionalViewerSettingsRequest } from './urlLoaderViewerState';
import { dismissDatasetTimeoutWarnings, optionalSettingsTimeoutWarning, splatListTimeoutWarning } from './datasetTimeoutWarnings';
import { findDatasetViewerSettingsEntry } from '../utils/datasetViewerSettings';
import { parseGoogleDriveFileUrl } from '../utils/googleDriveUrl';
import { resolveGoogleDriveArchive } from '../features/googleDrive/api';
import { assertGoogleDriveHostAllowed } from '../features/googleDrive/config';
import { huggingFaceDatasetInfoUrl } from '../utils/huggingFaceUrl';
import { checkHuggingFaceDatasetAccess } from '../features/huggingface/datasetAccess';
import { anySignal } from '../utils/abortSignals';

export interface UseUrlLoaderDeps {
  logger?: Pick<AppLogger, 'error' | 'info'>;
  /** Only startup loads should inherit settings from the current viewer URL. */
  applyUrlOverrides?: boolean;
}

export interface UrlLoadOptions {
  /** Preserve choices made while an outer UI job reads a manifest or yields to paint. */
  initialSplatSelectionRevision?: number;
}

type ReconstructionState = ReturnType<typeof useReconstructionStore.getState>;

interface UrlLoadContext {
  onViewerState: (state: PublishedViewerState) => Promise<void>;
  onOptionalSettingsTimeout: () => void;
  onSplatListTimeout: () => void;
  onRemoteSplatCatalog: (catalog: RemoteSplatCandidate[], baseUrl?: string) => void;
  onAutoSplatSource: (sourceId: string) => void;
  signal: AbortSignal;
  assertCurrent: () => void;
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  processFiles: ReturnType<typeof useFileDropzone>['processFiles'];
  setSourceInfo: ReconstructionState['setSourceInfo'];
  setUrlProgress: ReconstructionState['setUrlProgress'];
  hasEmbeddedViewerSettings: boolean;
  remoteCatalogMerged: boolean;
  /** This load committed its own file map (not a splat merged into the open scene). */
  sceneReplaced: boolean;
}

/** Settings beside a directly loaded file or archive; a timeout keeps defaults and says so. */
async function applyOptionalSettingsBeside(request: OptionalViewerSettingsRequest, load: UrlLoadContext): Promise<void> {
  const settings = await request.settle();
  if (settings.timedOut) load.onOptionalSettingsTimeout();
  if (settings.state) await load.onViewerState(settings.state);
}

/**
 * The settings beside `url`, read once. `start` asks for them as soon as the load knows it needs them
 * (the load's end aborts a request it never used). Their deadline starts when the load needs them: just
 * before its scene appears, so the restore lands with the scene, and again afterwards for a load that
 * merged rather than replaced.
 */
function settingsBesideOnce(url: string, load: UrlLoadContext) {
  let request: OptionalViewerSettingsRequest | undefined;
  const start = () => request ??= startOptionalDatasetViewerSettings(url, load.fetchImpl, true, load.signal);
  let settled: Promise<void> | undefined;
  const settle = () => settled ??= applyOptionalSettingsBeside(start(), load);
  return {
    start,
    beforeSceneCommit: () => {
      load.setUrlProgress({ percent: 90, message: 'Loading saved view settings...' });
      return settle();
    },
    settle,
  };
}

/**
 * A load starts with only its own splat request: the viewer URL's choice, None included, which its
 * commit applies. One left by the previous dataset would otherwise pick a same-named splat here. With
 * a scene open the request would apply to that scene, so the restore applies the URL's choice instead.
 */
function requestSplatForLoad(shared: SharedViewerOverrides | null): void {
  const store = useReconstructionStore.getState();
  store.setRequestedSplatSourceId(store.loadedFiles ? null : shared?.config?.splat?.activeSourceId ?? null);
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
    work: (load: UrlLoadContext) => Promise<boolean>,
    options: UrlLoadOptions = {}
  ): Promise<boolean> => {
    const signal = tryStartUrlLoad();
    if (!signal) {
      logInfo(URL_LOAD_GUARD_MESSAGE);
      return false;
    }
    // Timeout warnings describe the previous load.
    dismissDatasetTimeoutWarnings();
    const initialSplatSelectionRevision = options.initialSplatSelectionRevision ?? useReconstructionStore.getState().splatSelectionRevision;
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
    let autoSplatSourceId: string | undefined;
    const load: UrlLoadContext = {
      // Recorded here and applied once the load succeeds, together with the URL's own settings.
      onViewerState: async (state) => { assertCurrent(); savedViewerState = state; },
      onOptionalSettingsTimeout: guard(optionalSettingsTimeoutWarning.show),
      onSplatListTimeout: guard(splatListTimeoutWarning.show),
      onRemoteSplatCatalog: guard((catalog: RemoteSplatCandidate[], baseUrl = contextUrl) => {
        mergeRemoteSplatCatalog(catalog, baseUrl);
        load.remoteCatalogMerged = true;
      }),
      onAutoSplatSource: guard(sourceId => { autoSplatSourceId = sourceId; }),
      signal,
      assertCurrent,
      fetchImpl: guard((url, init) => fetchDatasetResource(url, undefined, { ...init,
        signal: init?.signal ? anySignal([signal, init.signal]) : signal })),
      processFiles: guard((files, range, options) => {
        load.hasEmbeddedViewerSettings = Boolean(findDatasetViewerSettingsEntry(files));
        return processFiles(files, range, { ...options, signal, initialSplatSelectionRevision,
          onViewerState: load.onViewerState,
          onSceneReplaced: guard(() => {
            clearAllCaches();
            load.sceneReplaced = true;
            options?.onSceneReplaced?.();
          }),
        });
      }),
      setSourceInfo: guard(setSourceInfo),
      setUrlProgress: guard(setUrlProgress),
      hasEmbeddedViewerSettings: false,
      remoteCatalogMerged: false,
      sceneReplaced: false,
    };
    setUrlLoading(true);
    setUrlError(null);
    setUrlProgress({ percent: 0, message: 'Starting...' });

    try {
      // Decode source choices before any network transfer; an explicit None must
      // never turn into an eager full splat request while URL settings decode.
      const shared = await decodeSharedViewerOverrides(initialHash);
      assertCurrent();
      requestSplatForLoad(shared);
      const loaded = await work(load);
      assertCurrent();
      if (loaded) {
        // Reload re-reads the downloaded files; these settings are not among them. Recorded before
        // restoration so a cancelled splat download still leaves them to Reload. They bind to the
        // current file map, so only a load that committed its own may record them: a splat merged
        // into the open scene must neither take over nor drop that scene's settings.
        if (load.sceneReplaced) useReconstructionStore.getState().setSourceViewerState(savedViewerState);
        await applySavedViewerState(savedViewerState, shared, assertCurrent, initialSplatSelectionRevision, autoSplatSourceId);
        assertCurrent();
        // Ask only once restoration settled: an automatic or saved splat downloads without a
        // picker over it, and an explicit None or a choice made during the load stands.
        if (load.remoteCatalogMerged
          && resolveRestoredSplatSourceId(savedViewerState, shared, autoSplatSourceId) !== ''
          && useReconstructionStore.getState().splatSelectionRevision === initialSplatSelectionRevision) {
          useReconstructionStore.getState().offerSplatPicker();
        }
      }
      return loaded;
    } catch (error) {
      if (isCurrent()) {
        handleUrlLoadFailure(error, {
          clearCaches: load.sceneReplaced ? clearAllCaches : () => undefined,
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
        // A tile download started during the restore, or the renderer's decode, keeps the overlay and its Cancel.
        if (!isSplatDownloadPending() && !isSplatLoadingProgressForFile(state.urlProgress, state.loadedFiles?.splatFile)) {
          setUrlLoading(false);
        }
      }
    }
  }, [tryStartUrlLoad, logInfo, processFiles, setSourceInfo, setUrlProgress, setUrlLoading,
    setUrlError, logError, setError, finishUrlLoad, applyUrlOverrides, mergeRemoteSplatCatalog]);

  const loadFromUrl = useCallback((url: string, options: UrlLoadOptions = {}): Promise<boolean> => runLoad(url, async (load) => {
    const driveFile = parseGoogleDriveFileUrl(url);
    if (driveFile) {
      // Startup/share links use this path without passing through the URL dialog.
      assertGoogleDriveHostAllowed();
      load.setUrlProgress({ percent: 0, message: 'Checking Google Drive file...' });
      const source = await resolveGoogleDriveArchive(driveFile, { signal: load.signal });
      load.assertCurrent();
      return loadZipUrlSource(source.url, { ...load, log: logInfo,
        sourceUrl: driveFile.sourceUrl, archiveOptions: source.options });
    }
    const normalized = normalizeLoadUrl(url);
    const normalizedUrl = normalized.url;
    for (const step of normalized.steps) logInfo(getUrlNormalizationLogMessage(step));

    const hfInfoUrl = huggingFaceDatasetInfoUrl(normalizedUrl);
    if (hfInfoUrl) {
      load.setUrlProgress({ percent: 0, message: 'Checking Hugging Face dataset access...' });
      await checkHuggingFaceDatasetAccess(hfInfoUrl, load.fetchImpl, load.signal);
      load.assertCurrent();
    }

    if (isSplatUrl(normalizedUrl)) {
      load.setUrlProgress({ percent: 0, message: 'Loading 3D file...' });
      const settings = settingsBesideOnce(normalizedUrl, load);
      // A lone file never holds settings of its own: ask for the ones beside it during its download.
      settings.start();
      const loaded = await loadSplatUrlSource(normalizedUrl, {
        ...load,
        log: logInfo,
        beforeSceneCommit: settings.beforeSceneCommit,
      });
      if (loaded) {
        await settings.settle();
      }
      return loaded;
    }

    if (isArchiveUrl(normalizedUrl)) {
      load.setUrlProgress({ percent: 0, message: 'Loading archive...' });
      logInfo(getArchiveUrlDetectedLogMessage(normalizedUrl));
      const settings = settingsBesideOnce(normalizedUrl, load);
      const loaded = await loadZipUrlSource(normalizedUrl, { ...load, log: logInfo,
        // Known once processing starts: settings inside the archive are its own. Only an archive
        // without them asks for the ones beside it, while it parses.
        processFiles: (files, range, options) => {
          const processing = load.processFiles(files, range, options);
          if (!load.hasEmbeddedViewerSettings) settings.start();
          return processing;
        },
        beforeSceneCommit: async () => { if (!load.hasEmbeddedViewerSettings) await settings.beforeSceneCommit(); } });
      if (loaded && !load.hasEmbeddedViewerSettings) {
        await settings.settle();
      }
      return loaded;
    }

    let manifest: ColmapManifest;
    if (isManifestUrl(normalizedUrl)) {
      manifest = await fetchUrlManifest(normalizedUrl, load);
      logInfo(getManifestLoadedLogMessage(manifest));
    } else {
      load.setUrlProgress({ percent: 1, message: 'Discovering dataset files...' });
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
        load.onRemoteSplatCatalog(candidates, manifest.baseUrl);
      },
    });
    load.assertCurrent();
    return loaded;
  }, options), [runLoad, logInfo]);

  const loadFromManifest = useCallback((manifest: ColmapManifest, options: UrlLoadOptions = {}): Promise<boolean> =>
    runLoad(manifest.baseUrl, async (load) => {
      const hfInfoUrl = huggingFaceDatasetInfoUrl(manifest.baseUrl);
      if (hfInfoUrl) {
        load.setUrlProgress({ percent: 0, message: 'Checking Hugging Face dataset access...' });
        await checkHuggingFaceDatasetAccess(hfInfoUrl, load.fetchImpl, load.signal);
        load.assertCurrent();
      }
      load.setUrlProgress({ percent: 1, message: 'Loading dataset files...' });
      logInfo(getInlineManifestLoadLogMessage(manifest));
      return loadManifestSource(manifest, { type: 'manifest' }, { ...load, log: logInfo });
    }, options), [runLoad, logInfo]);

  const clearUrlError = useCallback(() => setUrlError(null), [setUrlError]);
  return { loadFromUrl, loadFromManifest, urlLoading, urlProgress, urlError,
    clearUrlError, setUrlLoading, setUrlProgress };
}
