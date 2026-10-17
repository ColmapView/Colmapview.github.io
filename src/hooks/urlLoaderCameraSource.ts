import { prepareCameraDataset } from '../dataset/importers/prepareCameraDataset';
import { readCameraSourceFile } from '../dataset/importers/sourceAccess';
import { MAX_CAMERA_METADATA_BYTES } from '../dataset/importers/types';
import type { LoadZipUrlSourceDeps } from './urlLoaderZipSource';
import { getHuggingFaceUrlFilePaths } from './urlLoaderHuggingFaceListing';

export async function loadCameraUrlSource(url: string, deps: Pick<LoadZipUrlSourceDeps,
  'signal' | 'assertCurrent' | 'processFiles' | 'setSourceInfo' | 'setUrlProgress' | 'beforeSceneCommit'>,
  metadataFile?: File): Promise<boolean> {
  const originalUrl = new URL(url);
  deps.setUrlProgress({ percent: 10, message: 'Importing posed photos...' });
  const source={kind:'url' as const,baseUrl:new URL('.',originalUrl).href};
  const originalMetadata=metadataFile ?? await readCameraSourceFile(source,originalUrl.href,deps.signal,MAX_CAMERA_METADATA_BYTES);
  if (!originalMetadata) throw new Error('Camera metadata is unavailable.');
  const filePaths = await getHuggingFaceUrlFilePaths(source.baseUrl,deps.signal);
  const prepared = await prepareCameraDataset(filePaths ? {...source,filePaths} : source, {
    metadataPath: decodeURIComponent(originalUrl.pathname.split('/').pop()!), metadataFile:originalMetadata, signal: deps.signal,
  });
  deps.signal?.throwIfAborted(); deps.assertCurrent?.();
  if (!prepared) throw new Error('Unsupported camera dataset.');
  const result = await deps.processFiles(prepared.files, { start: 20, end: 100 }, {
    throwOnError: true, signal: deps.signal, beforeSceneCommit: deps.beforeSceneCommit,
    onSceneReplaced: () => { deps.signal?.throwIfAborted(); deps.assertCurrent?.(); deps.setSourceInfo('url', url); },
  });
  deps.signal?.throwIfAborted(); deps.assertCurrent?.();
  return result !== false;
}
