import type { ColmapManifest, UrlLoadProgress } from '../types/manifest';
import { findSplatFileSources } from '../utils/fileClassification';
import { appLogger } from '../utils/logger';
import {
  getManifestLoadSourceInfo,
  getSplatAutoLoadDecision,
  type ManifestLoadSource,
  type RemoteSplatCandidate,
} from './urlLoaderPolicy';
import { discoverManifestSplatCatalog, fetchManifestColmapFiles } from './urlLoaderManifestFetch';
import { fetchPublishedViewerState, startOptionalDatasetViewerSettings } from './urlLoaderViewerState';
import type { PublishedViewerState } from '../utils/publishedViewerState';
import { fetchDatasetResource } from '../utils/fetchDatasetResource';
import { FETCH_TIMEOUT } from '../utils/fetchWithTimeout';
import { detectTouchDevice } from './useIsTouchDevice';
import { anySignal } from '../utils/abortSignals';

export { OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS } from './urlLoaderViewerState';

/**
 * How long the parsed scene waits for a splat listing that is still running. Discovery starts with
 * the downloads, so a listing unfinished this long after parsing is stalled; the scene then appears
 * without it, as when discovery fails.
 */
export const SPLAT_DISCOVERY_TIMEOUT_MS = FETCH_TIMEOUT;

const RESTORE_INPUTS_PROGRESS = { percent: 90, message: 'Looking for splats and saved settings...' };

type ProcessFiles = (
  files: Map<string, File>,
  progressRange?: { start: number; end: number },
  options?: { throwOnError?: boolean; signal?: AbortSignal; onSceneReplaced?: () => void;
    beforeSceneCommit?: () => Promise<void> }
) => Promise<void | boolean>;
type FetchColmapFiles = (manifest: ColmapManifest) => Promise<Map<string, File>>;
type SetSourceInfo = (
  type: ManifestLoadSource['type'],
  url?: string | null,
  imageUrlBase?: string | null,
  maskUrlBase?: string | null,
  manifest?: ColmapManifest | null,
  imageNameToUrl?: Record<string, string> | null
) => void;
type SetUrlProgress = (progress: UrlLoadProgress | null) => void;
type Log = (...args: unknown[]) => void;

export interface LoadManifestSourceDeps {
  signal?: AbortSignal;
  assertCurrent?: () => void;
  isTouchDevice?: boolean;
  onViewerState?: (state: PublishedViewerState) => void | Promise<void>;
  /** Optional dataset settings did not arrive in time; defaults stay in effect. */
  onOptionalSettingsTimeout?: () => void;
  /** The splat listing outlasted SPLAT_DISCOVERY_TIMEOUT_MS; the scene appears without its splats. */
  onSplatListTimeout?: () => void;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  fetchColmapFiles?: FetchColmapFiles;
  discoverSplatCatalog?: (manifest: ColmapManifest) => Promise<RemoteSplatCandidate[]>;
  log?: Log;
  processFiles: ProcessFiles;
  setSourceInfo: SetSourceInfo;
  setUrlProgress: SetUrlProgress;
  /** Installs discovered sources after parsing, before restoring viewer settings. */
  onRemoteSplatCatalog?: (catalog: RemoteSplatCandidate[]) => void;
  /** Legacy single-tile autoload is decided only after saved/shared settings are known. */
  onAutoSplatSource?: (sourceId: string) => void;
}

/** Waits up to `ms` for work already running; the load's own cancellation still rejects. */
async function settleWithin<T>(task: Promise<T>, ms: number, signal?: AbortSignal): Promise<{ value: T } | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const deadline = new Promise<null>((resolve, reject) => {
    cancel = () => reject(signal?.reason ?? new DOMException('Dataset load cancelled', 'AbortError'));
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([task.then(value => ({ value })), deadline]);
  } finally {
    clearTimeout(timer);
    if (cancel) signal?.removeEventListener('abort', cancel);
  }
}

export async function loadManifestSource(
  manifest: ColmapManifest,
  source: ManifestLoadSource,
  deps: LoadManifestSourceDeps
): Promise<boolean> {
  const log = deps.log ?? appLogger.info;
  const assertCurrent = () => { deps.signal?.throwIfAborted(); deps.assertCurrent?.(); };
  assertCurrent();
  const fetchColmapFiles = deps.fetchColmapFiles
    ?? ((targetManifest: ColmapManifest) => fetchManifestColmapFiles(targetManifest, {
      fetchImpl: deps.fetchImpl,
      log: (message) => log(message),
      setUrlProgress: deps.setUrlProgress,
      deferSplatDownloads: true,
    }));
  const fetchImpl = deps.fetchImpl ?? ((url, init) => fetchDatasetResource(url, undefined, init));
  const discoveryController = new AbortController();
  const discoverySignal = deps.signal ? anySignal([deps.signal, discoveryController.signal]) : discoveryController.signal;
  const discover = deps.discoverSplatCatalog ?? ((target: ColmapManifest) => discoverManifestSplatCatalog(target, {
    fetchImpl: (url, init) => fetchImpl(url, { ...init, signal: discoverySignal }), log, isTouchDevice: deps.isTouchDevice,
  }));
  // Discovery and optional settings do not gate required file transfer or parsing.
  const catalogTask = discover(manifest).catch(() => [] as RemoteSplatCandidate[]);
  let catalogSettled: Promise<RemoteSplatCandidate[]> | undefined;
  /** The listing, given SPLAT_DISCOVERY_TIMEOUT_MS from the first call; a slower one is dropped like a failed one. */
  const settleCatalog = () => catalogSettled ??= settleWithin(catalogTask, SPLAT_DISCOVERY_TIMEOUT_MS, deps.signal)
    .then(result => {
      if (result) return result.value;
      discoveryController.abort(new DOMException('Splat discovery timed out', 'TimeoutError'));
      log(`[URL Loader] Splat discovery took longer than ${SPLAT_DISCOVERY_TIMEOUT_MS / 1000} s after parsing; no splats are listed`);
      deps.onSplatListTimeout?.();
      return [];
    });
  // The optional request starts with the downloads; its deadline starts once parsing is done.
  const optionalSettings = manifest.viewerStatePath === undefined
    ? startOptionalDatasetViewerSettings(manifest.baseUrl, fetchImpl, false, deps.signal)
    : null;
  // Only an explicitly referenced state document needs a request (and signal) of its own.
  const explicitSettingsController = optionalSettings ? null : new AbortController();
  const explicitSettingsSignal = explicitSettingsController && (deps.signal
    ? anySignal([deps.signal, explicitSettingsController.signal]) : explicitSettingsController.signal);
  const explicitSettingsTask = explicitSettingsSignal
    && fetchPublishedViewerState(manifest, (url, init) => fetchImpl(url, { ...init, signal: explicitSettingsSignal }))
      .then(state => ({ state }), error => ({ error }));
  let optionalSettingsTimedOut = false;
  const getViewerState = async () => {
    if (optionalSettings) {
      const result = await optionalSettings.settle();
      assertCurrent();
      optionalSettingsTimedOut = result.timedOut;
      if (result.timedOut) deps.onOptionalSettingsTimeout?.();
      return result.state;
    }
    const result = await explicitSettingsTask!;
    assertCurrent();
    if ('error' in result) throw result.error;
    return result.state;
  };
  try {

  const files = await fetchColmapFiles(manifest);
  assertCurrent();
  // An explicitly referenced state document is required for a correctly aligned publication.
  const explicitViewerState = manifest.viewerStatePath === undefined ? null : await getViewerState();
  let restoreInputs: Promise<[RemoteSplatCandidate[], PublishedViewerState | null]> | undefined;
  /** What the new scene restores with it; their deadlines start with the first call, after parsing. */
  const settleRestoreInputs = () => restoreInputs ??= Promise.all([settleCatalog(),
    manifest.viewerStatePath === undefined ? getViewerState() : Promise.resolve(explicitViewerState)]);
  log(`[URL Loader] Downloaded ${files.size} COLMAP files:`, Array.from(files.keys()));

  log('[URL Loader] Skipping image download (images will be loaded lazily)');

  deps.setUrlProgress({ percent: 80, message: 'Parsing reconstruction...' });

  const sourceInfo = getManifestLoadSourceInfo(manifest, source);
  let committed = false;
  const commitSource = () => {
    assertCurrent();
    if (committed) return;
    deps.setSourceInfo(sourceInfo.sourceType, sourceInfo.sourceUrl, sourceInfo.imageUrlBase,
      sourceInfo.maskUrlBase, sourceInfo.sourceManifest, sourceInfo.imageNameToUrl ?? null);
    committed = true;
  };
  log(`[URL Loader] Image URL base for lazy loading: ${sourceInfo.imageUrlBase}`);
  log(`[URL Loader] Mask URL base for lazy loading: ${sourceInfo.maskUrlBase}`);
  if (sourceInfo.imageNameToUrl) {
    log(
      `[URL Loader] Per-image URL mapping active for ${Object.keys(sourceInfo.imageNameToUrl).length} images`
    );
  }

  log('[URL Loader] Calling processFiles...');
  // The scene appears with its splat list and saved settings, so its restore lands before anyone
  // can move it; until then the overlay, its Cancel and the old scene stay.
  const processed = await deps.processFiles(files, { start: 80, end: 100 }, {
    throwOnError: true, signal: deps.signal, onSceneReplaced: commitSource,
    beforeSceneCommit: async () => {
      deps.setUrlProgress(RESTORE_INPUTS_PROGRESS);
      await settleRestoreInputs();
    },
  });
  assertCurrent();
  if (processed === false) return false;

  if (findSplatFileSources(files).length === 0) {
    deps.setUrlProgress({ percent: 100, message: 'Complete' });
  }
  const [catalog, viewerState] = await settleRestoreInputs();
  assertCurrent();
  if (catalog.length) deps.onRemoteSplatCatalog?.(catalog);
  if (viewerState) await deps.onViewerState?.(viewerState);
  assertCurrent();
  // A timeout cannot establish whether saved settings chose None. Leave that
  // source lazy instead of starting an irreversible full transfer on a guess.
  if (!optionalSettingsTimedOut
    && getSplatAutoLoadDecision(catalog, { isTouchDevice: deps.isTouchDevice ?? detectTouchDevice() }).autoLoad) {
    deps.onAutoSplatSource?.(catalog[0].path);
  }
  log(`[URL Loader] Successfully loaded ${files.size} files from ${sourceInfo.successLabel}`);

  return true;
  } finally {
    optionalSettings?.cancel();
    explicitSettingsController?.abort();
    discoveryController.abort();
  }
}
