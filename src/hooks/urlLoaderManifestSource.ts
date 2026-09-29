import type { ColmapManifest, UrlLoadProgress } from '../types/manifest';
import { findSplatFileSources } from '../utils/fileClassification';
import { appLogger } from '../utils/logger';
import {
  getManifestLoadSourceInfo,
  type ManifestLoadSource,
  type RemoteSplatCandidate,
} from './urlLoaderPolicy';
import { fetchManifestColmapFiles } from './urlLoaderManifestFetch';
import { fetchPublishedViewerState } from './urlLoaderViewerState';
import type { PublishedViewerState } from '../utils/publishedViewerState';

type ProcessFiles = (
  files: Map<string, File>,
  progressRange?: { start: number; end: number },
  options?: { throwOnError?: boolean }
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
  onViewerState?: (state: PublishedViewerState) => void | Promise<void>;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  fetchColmapFiles?: FetchColmapFiles;
  log?: Log;
  processFiles: ProcessFiles;
  setSourceInfo: SetSourceInfo;
  setUrlProgress: SetUrlProgress;
  /** Installs discovered sources after parsing, before restoring viewer settings. */
  onRemoteSplatCatalog?: (catalog: RemoteSplatCandidate[]) => void;
}

export async function loadManifestSource(
  manifest: ColmapManifest,
  source: ManifestLoadSource,
  deps: LoadManifestSourceDeps
): Promise<boolean> {
  const log = deps.log ?? appLogger.info;
  const catalog: RemoteSplatCandidate[] = [];
  const fetchColmapFiles = deps.fetchColmapFiles
    ?? ((targetManifest: ColmapManifest) => fetchManifestColmapFiles(targetManifest, {
      fetchImpl: deps.fetchImpl,
      log: (message) => log(message),
      setUrlProgress: deps.setUrlProgress,
      onRemoteSplatCatalog: candidates => catalog.push(...candidates),
    }));

  // Settings lookup may probe several locations; never make the reconstruction wait on it.
  const [viewerState, files] = await Promise.all([
    fetchPublishedViewerState(manifest, deps.fetchImpl ?? fetch),
    fetchColmapFiles(manifest),
  ]);
  log(`[URL Loader] Downloaded ${files.size} COLMAP files:`, Array.from(files.keys()));

  log('[URL Loader] Skipping image download (images will be loaded lazily)');

  deps.setUrlProgress({ percent: 80, message: 'Parsing reconstruction...' });

  const sourceInfo = getManifestLoadSourceInfo(manifest, source);
  deps.setSourceInfo(
    sourceInfo.sourceType,
    sourceInfo.sourceUrl,
    sourceInfo.imageUrlBase,
    sourceInfo.maskUrlBase,
    sourceInfo.sourceManifest,
    sourceInfo.imageNameToUrl ?? null
  );
  log(`[URL Loader] Image URL base for lazy loading: ${sourceInfo.imageUrlBase}`);
  log(`[URL Loader] Mask URL base for lazy loading: ${sourceInfo.maskUrlBase}`);
  if (sourceInfo.imageNameToUrl) {
    log(
      `[URL Loader] Per-image URL mapping active for ${Object.keys(sourceInfo.imageNameToUrl).length} images`
    );
  }

  log('[URL Loader] Calling processFiles...');
  await deps.processFiles(files, { start: 80, end: 100 }, { throwOnError: true });
  if (catalog.length) deps.onRemoteSplatCatalog?.(catalog);

  if (findSplatFileSources(files).length === 0) {
    deps.setUrlProgress({ percent: 100, message: 'Complete' });
  }
  if (viewerState) await deps.onViewerState?.(viewerState);
  log(`[URL Loader] Successfully loaded ${files.size} files from ${sourceInfo.successLabel}`);

  return true;
}
