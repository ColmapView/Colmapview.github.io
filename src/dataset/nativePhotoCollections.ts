import { getBasename, getParentDir } from '../utils/colmapPathResolver';
import { getPathSuffixes, isAuxiliaryImagePath, isImageFile, normalizeImagePath } from '../utils/imageFileLookupPolicy';
import { nativeImageStem as stem } from './nativeMediaPaths';

export interface NativePhotoCollection {
  root: string;
  flattened: boolean;
  bindings: ReadonlyMap<string, string>;
}

const clean = (path: string) => normalizeImagePath(path).replace(/^(?:\.\/)+/, '');
const flatPhotoRoot = /^(?:images?(?:_\d+)?|rgb|rgba|color|colou?r|photos?|frames?|dslr_images)$/i;
const MAX_COLLECTIONS = 256;

/** Infer a consistent photo collection from the registered set, never a per-camera basename guess.
 * Flattening requires unique stems across ALL registered names and files directly in a photo root,
 * the selected scene root, or a manifest's explicitly declared photo collection.
 * Foreign scenes and alternate modalities remain candidates for explicit selection only.
 */
export function findNativePhotoCollections(paths: readonly string[], registeredNames: readonly string[], preferPath?: (path: string) => boolean,
  options: { declaredPhotos?: boolean; isSceneRootPhoto?: (path: string) => boolean; isPhotoPath?: (path: string) => boolean } = {}): NativePhotoCollection[] {
  const names = [...new Set(registeredNames)];
  const byStem = new Map<string, string[]>();
  const byRelativeStem = new Map<string, string[]>();
  for (const name of names) {
    const key = stem(getBasename(clean(name))), values = byStem.get(key) ?? [];
    values.push(name); byStem.set(key, values);
    const relativeKey = stem(clean(name)), relative = byRelativeStem.get(relativeKey) ?? [];
    relative.push(name); byRelativeStem.set(relativeKey, relative);
  }
  const collections = new Map<string, { root: string; flattened: boolean; candidates: Map<string, string[]> }>();
  const lookupPaths = new Map<string, string>();
  const add = (root: string, flattened: boolean, name: string, path: string) => {
    const key = root;
    let collection = collections.get(key);
    if (!collection) {
      if (collections.size >= MAX_COLLECTIONS) return;
      collection = { root, flattened, candidates: new Map() }; collections.set(key, collection);
    }
    collection.flattened ||= flattened;
    const values = collection.candidates.get(name) ?? [];
    values.push(path); collection.candidates.set(name, values);
  };
  // Reserve the bounded candidate budget for the selected scene before scanning
  // similarly named frames in other scenes of a large repository.
  const preferred: string[] = [], other: string[] = [];
  for (const path of new Set(paths)) (preferPath?.(path) === false ? other : preferred).push(path);
  for (const rawPath of preferred.concat(other)) {
    const path = clean(rawPath);
    let lookup = path, resource: URL | undefined;
    if (/^https?:\/\//i.test(path)) {
      try {
        resource = new URL(path);
        lookup = resource.pathname.split('/').map(segment => decodeURIComponent(segment)).join('/').replace(/^\/+/, '');
      } catch { continue; }
    }
    const photoRole = options.isPhotoPath?.(path) ?? (options.declaredPhotos || !isAuxiliaryImagePath(lookup));
    if (!isImageFile(lookup) || !photoRole) continue;
    const matches = byStem.get(stem(getBasename(lookup)));
    if (!matches) continue;
    lookupPaths.set(path, lookup);
    const directory = getParentDir(lookup);
    // URL roots identify collections; bindings retain the exact original URL and query.
    const collectionRoot = (root: string) => resource ? resource.origin + (root ? '/' + root : '') : root;
    for (const suffix of getPathSuffixes(lookup)) {
      const qualified = byRelativeStem.get(stem(suffix));
      if (!qualified) continue;
      for (const name of qualified) {
        const relative = clean(name);
        const root = directory.slice(0, Math.max(0, directory.length - getParentDir(relative).length)).replace(/\/$/, '');
        add(collectionRoot(root), false, name, path);
      }
    }
    if (matches.length === 1 && clean(matches[0]).includes('/')
      && (options.declaredPhotos || flatPhotoRoot.test(getBasename(directory)) || options.isSceneRootPhoto?.(path))
      && !stem(lookup).endsWith('/' + stem(clean(matches[0])))) add(collectionRoot(directory), true, matches[0], path);
  }
  return [...collections.values()].map(collection => {
    const bindings = new Map<string, string>();
    for (const [name, candidates] of collection.candidates) {
      const exact = candidates.filter(path => getBasename(lookupPaths.get(path)!) === getBasename(clean(name)));
      const folded = candidates.filter(path => getBasename(lookupPaths.get(path)!).toLowerCase() === getBasename(clean(name)).toLowerCase());
      const preferred = [...new Set(exact.length ? exact : folded.length ? folded : candidates)];
      if (preferred.length === 1) bindings.set(name, preferred[0]);
    }
    const owners = new Map<string, string[]>();
    for (const [name, path] of bindings) { const existing = owners.get(path) ?? []; existing.push(name); owners.set(path, existing); }
    for (const names of owners.values()) if (names.length > 1) for (const name of names) bindings.delete(name);
    return { root: collection.root, flattened: collection.flattened, bindings };
  }).filter(collection => collection.bindings.size > 0)
    .sort((a, b) => b.bindings.size - a.bindings.size || Number(a.flattened) - Number(b.flattened) || a.root.localeCompare(b.root));
}
