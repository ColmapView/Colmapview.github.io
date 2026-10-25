import { prepareCameraDataset } from '../dataset/importers/prepareCameraDataset';
import { readCameraSourceFile } from '../dataset/importers/sourceAccess';
import { MAX_CAMERA_METADATA_BYTES } from '../dataset/importers/types';
import type { LoadZipUrlSourceDeps } from './urlLoaderZipSource';
import { getHuggingFaceUrlFilePaths } from './urlLoaderHuggingFaceListing';
import type { CameraDatasetManifest } from '../types/cameraDatasetManifest';
import type { LoadManifestSourceDeps } from './urlLoaderManifestSource';
import { discoverManifestSplatCatalog } from './urlLoaderSplatDiscovery';
import { fetchPublishedViewerState } from './urlLoaderViewerState';
import { getSplatAutoLoadDecision } from '../splat/loadingPolicy';
import { detectTouchDevice } from './useIsTouchDevice';
import { fetchDatasetResource } from '../utils/fetchDatasetResource';

type CameraSourceDeps = Pick<LoadZipUrlSourceDeps,
  'signal' | 'assertCurrent' | 'processFiles' | 'setSourceInfo' | 'setUrlProgress' | 'beforeSceneCommit'>
  & Pick<LoadManifestSourceDeps, 'fetchImpl' | 'isTouchDevice' | 'onRemoteSplatCatalog' | 'onViewerState' | 'onAutoSplatSource'>;

export async function loadCameraUrlSource(url: string, deps: CameraSourceDeps,
  metadataFile?: File, manifest?: CameraDatasetManifest, sourceUrl = url): Promise<boolean> {
  const originalUrl = new URL(url);
  deps.setUrlProgress({ percent: 10, message: 'Importing posed photos...' });
  const source={kind:'url' as const,baseUrl:new URL('.',originalUrl).href};
  const originalMetadata=metadataFile ?? await readCameraSourceFile(source,originalUrl.href,deps.signal,MAX_CAMERA_METADATA_BYTES);
  if (!originalMetadata) throw new Error('Camera metadata is unavailable.');
  const filePaths = await getHuggingFaceUrlFilePaths(source.baseUrl,deps.signal);
  const prepared = await prepareCameraDataset(filePaths ? {...source,filePaths} : source, {
    metadataPath: decodeURIComponent(originalUrl.pathname.split('/').pop()!), metadataFile:originalMetadata, signal: deps.signal,
    ...(manifest && {pointCloud: manifest.pointCloud, tracksUrl: manifest.tracksUrl, frameIndices: manifest.frameIndices}),
  });
  deps.signal?.throwIfAborted(); deps.assertCurrent?.();
  if (!prepared) throw new Error('Unsupported camera dataset.');
  const fetchImpl = (target: string, init?: RequestInit) => deps.fetchImpl
    ? deps.fetchImpl(target, { ...init, signal: deps.signal })
    : fetchDatasetResource(target, undefined, { ...init, signal: deps.signal });
  const companions = manifest?.version === 2 ? manifest : undefined;
  const [catalog, viewerState] = await Promise.all([
    companions ? discoverManifestSplatCatalog({ baseUrl: source.baseUrl, splats: companions.splats }, { fetchImpl }) : Promise.resolve([]),
    companions?.viewerStatePath === undefined ? Promise.resolve(null)
      : fetchPublishedViewerState({ baseUrl: new URL('.', sourceUrl).href, viewerStatePath: companions.viewerStatePath }, fetchImpl),
  ]);
  deps.signal?.throwIfAborted(); deps.assertCurrent?.();
  if (companions && !catalog.length) throw new Error('The declared Gaussian sources are unavailable or unsupported.');
  const result = await deps.processFiles(prepared.files, { start: 20, end: 100 }, {
    throwOnError: true, signal: deps.signal, beforeSceneCommit: deps.beforeSceneCommit,
    onSceneReplaced: () => { deps.signal?.throwIfAborted(); deps.assertCurrent?.(); deps.setSourceInfo('url', sourceUrl); },
  });
  deps.signal?.throwIfAborted(); deps.assertCurrent?.();
  if (result !== false && companions) {
    deps.onRemoteSplatCatalog?.(catalog);
    if (viewerState) await deps.onViewerState?.(viewerState);
    deps.signal?.throwIfAborted(); deps.assertCurrent?.();
    if (getSplatAutoLoadDecision(catalog, { isTouchDevice: deps.isTouchDevice ?? detectTouchDevice() }).autoLoad) {
      deps.onAutoSplatSource?.(catalog[0].path);
    }
  }
  return result !== false;
}
