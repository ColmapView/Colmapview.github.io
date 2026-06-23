import type { ColmapManifest, UrlLoadProgress } from '../types/manifest';
import { findSplatFileSources } from '../utils/fileClassification';
import { appLogger } from '../utils/logger';
import {
  getManifestLoadSourceInfo,
  type ManifestLoadSource,
  type RemoteSplatCandidate,
} from './urlLoaderPolicy';
import { fetchManifestColmapFiles } from './urlLoaderManifestFetch';

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
  manifest?: ColmapManifest | null
) => void;
type SetUrlProgress = (progress: UrlLoadProgress | null) => void;
type Log = (...args: unknown[]) => void;

export interface LoadManifestSourceDeps {
  fetchColmapFiles?: FetchColmapFiles;
  log?: Log;
  processFiles: ProcessFiles;
  setSourceInfo: SetSourceInfo;
  setUrlProgress: SetUrlProgress;
  /** Receives the full discovered remote splat catalog for lazy on-demand loading. */
  onRemoteSplatCatalog?: (catalog: RemoteSplatCandidate[]) => void;
}

export async function loadManifestSource(
  manifest: ColmapManifest,
  source: ManifestLoadSource,
  deps: LoadManifestSourceDeps
): Promise<boolean> {
  const log = deps.log ?? appLogger.info;
  const fetchColmapFiles = deps.fetchColmapFiles
    ?? ((targetManifest: ColmapManifest) => fetchManifestColmapFiles(targetManifest, {
      log: (message) => log(message),
      setUrlProgress: deps.setUrlProgress,
      onRemoteSplatCatalog: deps.onRemoteSplatCatalog,
    }));

  const files = await fetchColmapFiles(manifest);
  log(`[URL Loader] Downloaded ${files.size} COLMAP files:`, Array.from(files.keys()));

  log('[URL Loader] Skipping image download (images will be loaded lazily)');

  deps.setUrlProgress({ percent: 80, message: 'Parsing reconstruction...' });

  const sourceInfo = getManifestLoadSourceInfo(manifest, source);
  deps.setSourceInfo(
    sourceInfo.sourceType,
    sourceInfo.sourceUrl,
    sourceInfo.imageUrlBase,
    sourceInfo.maskUrlBase,
    sourceInfo.sourceManifest
  );
  log(`[URL Loader] Image URL base for lazy loading: ${sourceInfo.imageUrlBase}`);
  log(`[URL Loader] Mask URL base for lazy loading: ${sourceInfo.maskUrlBase}`);

  log('[URL Loader] Calling processFiles...');
  await deps.processFiles(files, { start: 80, end: 100 }, { throwOnError: true });

  if (findSplatFileSources(files).length === 0) {
    deps.setUrlProgress({ percent: 100, message: 'Complete' });
  }
  log(`[URL Loader] Successfully loaded ${files.size} files from ${sourceInfo.successLabel}`);

  return true;
}
