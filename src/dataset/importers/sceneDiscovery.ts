import { resolveColmapPaths, nativeSceneRoot } from '../../utils/colmapPathResolver';
import { isCameraMetadataPath, parentPath,cameraMetadataSceneRoot } from './sourcePaths';
import { requestCameraDatasetSelection, type SelectCameraDataset } from './selection';

/** Choose between distinct native/JSON scene roots; complete native data wins in its own root. */
export interface MixedCameraScene { root: string; metadataPath?: string; excludedRoots?: readonly string[] }
export const colmapSceneRoot = nativeSceneRoot;
export function isPathInCameraScene(path: string, scene: MixedCameraScene): boolean {
  return (!scene.root || path.startsWith(scene.root+'/'))
    && !scene.excludedRoots?.some(root=>path.startsWith(root+'/'));
}
export async function chooseMixedCameraScene(paths: readonly string[], signal?: AbortSignal, select: SelectCameraDataset = requestCameraDatasetSelection): Promise<MixedCameraScene | null> {
  const metadata = paths.filter(isCameraMetadataPath);
  if (!metadata.length) return null;
  const directories = [...new Set(paths.filter(path => /(?:^|\/)(?:cameras|images|points3D)\.(?:bin|txt)$/i.test(path)).map(parentPath))];
  const native = directories.flatMap(dir => {
    const model = resolveColmapPaths(paths.filter(path => parentPath(path) === dir), { requirePoints3D: false });
    if (!model) return [];
    const root = colmapSceneRoot(dir);
    return [{ root, model }];
  });
  if (!native.length) return null;
  const nativeRoots=[...new Set(native.map(item=>item.root))];
  const candidates = [
    ...nativeRoots.map(root => {
      const members=native.filter(item=>item.root===root);
      const memberPaths=members.flatMap(item=>paths.filter(path=>parentPath(path)===item.model.dir));
      const model=resolveColmapPaths(memberPaths) ?? resolveColmapPaths(memberPaths, { requirePoints3D: false })!;
      return { path:model.cameras!,sceneRoot:root,label:`${root || '(dataset root)'} — COLMAP` };
    }),
    ...metadata.filter(path => !native.some(item => item.root === cameraMetadataSceneRoot(path)))
      .map(path => ({ path, sceneRoot: cameraMetadataSceneRoot(path), label: path })),
  ];
  if (new Set(candidates.map(candidate => candidate.sceneRoot)).size <= 1) return null;
  const selected = await select(candidates, signal);
  signal?.throwIfAborted();
  if (!selected) throw new DOMException('Scene selection cancelled.', 'AbortError');
  if (isCameraMetadataPath(selected.path)) return { root:selected.sceneRoot,metadataPath:selected.path };
  return { root:selected.sceneRoot,excludedRoots:[...new Set(candidates.map(candidate=>candidate.sceneRoot))]
    .filter(root=>root && root!==selected.sceneRoot && (!selected.sceneRoot || root.startsWith(selected.sceneRoot+'/'))) };
}
