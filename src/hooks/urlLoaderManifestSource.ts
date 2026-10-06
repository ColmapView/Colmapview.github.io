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
import { fetchOptionalDatasetViewerSettingsResult, fetchPublishedViewerState } from './urlLoaderViewerState';
import type { PublishedViewerState } from '../utils/publishedViewerState';
import { fetchDatasetResource } from '../utils/fetchDatasetResource';
import { detectTouchDevice } from './useIsTouchDevice';

export { OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS } from './urlLoaderViewerState';

type ProcessFiles = (
  files: Map<string, File>,
  progressRange?: { start: number; end: number },
  options?: { throwOnError?: boolean; signal?: AbortSignal; onSceneReplaced?: () => void }
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
  const discover = deps.discoverSplatCatalog ?? ((target: ColmapManifest) => discoverManifestSplatCatalog(target, {
    fetchImpl, log, isTouchDevice: deps.isTouchDevice,
  }));
  // Discovery and optional settings do not gate required file transfer or parsing.
  const catalogTask = discover(manifest).catch(() => [] as RemoteSplatCandidate[]);
  const settingsController = new AbortController();
  const settingsSignal = deps.signal ? AbortSignal.any([deps.signal, settingsController.signal]) : settingsController.signal;
  let optionalSettingsTimedOut = false;
  const settingsTask = (manifest.viewerStatePath === undefined
    ? fetchOptionalDatasetViewerSettingsResult(manifest.baseUrl, fetchImpl, false, settingsSignal).then(result => {
      optionalSettingsTimedOut = result.timedOut;
      return result.state;
    })
    : fetchPublishedViewerState(manifest, (url, init) => fetchImpl(url, { ...init, signal: settingsSignal })))
    .then(state => ({ state }), error => ({ error }));
  const getViewerState = async () => {
    const result = await settingsTask;
    assertCurrent();
    if ('error' in result) throw result.error;
    return result.state;
  };
  try {

  const files = await fetchColmapFiles(manifest);
  assertCurrent();
  // An explicitly referenced state document is required for a correctly aligned publication.
  const explicitViewerState = manifest.viewerStatePath === undefined ? null : await getViewerState();
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
  const processed = await deps.processFiles(files, { start: 80, end: 100 }, {
    throwOnError: true, signal: deps.signal, onSceneReplaced: commitSource,
  });
  assertCurrent();
  if (processed === false) return false;
  commitSource();

  if (findSplatFileSources(files).length === 0) {
    deps.setUrlProgress({ percent: 100, message: 'Complete' });
  }
  const [catalog, viewerState] = await Promise.all([catalogTask,
    manifest.viewerStatePath === undefined ? getViewerState() : explicitViewerState]);
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
    settingsController.abort();
  }
}
