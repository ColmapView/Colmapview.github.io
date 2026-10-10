import type { ColmapManifest } from '../../types/manifest';
import { resolveColmapPaths } from '../../utils/colmapPathResolver';
import { resolveImageSource } from '../../utils/imageSourceResolution';
import { IMAGE_SOURCE_STRATEGIES } from '../../utils/imageSourceStrategies';
import { isSplatFilePath } from '../../utils/splatFilePolicy';
import { bucketConnection } from './connection';
import { listBucketPage } from './client';
import { bucketKeyFromUrl, bucketObjectUrl, normalizeBucketRoot } from './paths';
import { BucketError } from './types';

/** Discover a selected folder without downloading media or walking unrelated bucket prefixes. */
export async function discoverBucketManifest(baseUrl: string,
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>): Promise<ColmapManifest | null> {
  const session = bucketConnection.getSession();
  if (!session) return null;
  // The shared loader strips the trailing slash from default manifest bases.
  const folderUrl = normalizeBucketRoot(baseUrl);
  const prefix = bucketKeyFromUrl(session.config.baseUrl, folderUrl);
  if (prefix === null) return null;
  const source = fetchImpl ? { ...session, request: fetchImpl } : session;
  const paths: string[] = [];
  const tokens = new Set<string>();
  let token: string | undefined;
  do {
    const page = await listBucketPage(source, prefix, session.signal, { recursive: true, token });
    paths.push(...page.objects.filter(object => !object.key.endsWith('/')).map(object => object.key.slice(prefix.length)));
    if (paths.length > 100_000 || tokens.size >= 100) throw new BucketError('This folder has too many objects to discover. Open its manifest URL or select a smaller folder.');
    token = page.nextToken ?? undefined;
    if (token) {
      if (tokens.has(token)) throw new BucketError('The bucket repeated a listing page. Select a smaller folder.');
      tokens.add(token);
    }
  } while (token);
  const model = resolveColmapPaths(paths);
  if (!model?.cameras || !model.images || !model.points3D) return null;
  const imageSource = await resolveImageSource({ filePaths: paths, modelDir: model.dir,
    fetchText: async path => {
      const response = await source.request(bucketObjectUrl(folderUrl, path));
      return response.ok ? response.text() : null;
    },
  }, IMAGE_SOURCE_STRATEGIES);
  const imagesPath = imageSource?.imagesDir === undefined ? 'images/' : `${imageSource.imagesDir}${imageSource.imagesDir ? '/' : ''}`;
  const masksPath = imagesPath.replace(/(^|\/)images\/$/i, '$1masks/');
  return {
    version: 1, baseUrl: folderUrl,
    files: { cameras: model.cameras, images: model.images, points3D: model.points3D,
      ...(model.rigs ? { rigs: model.rigs } : {}), ...(model.frames ? { frames: model.frames } : {}) },
    imagesPath, masksPath: masksPath === imagesPath ? 'masks/' : masksPath,
    ...(imageSource?.imageNameToPath ? { imageNameToPath: imageSource.imageNameToPath } : {}),
    splats: paths.filter(isSplatFilePath),
  };
}
