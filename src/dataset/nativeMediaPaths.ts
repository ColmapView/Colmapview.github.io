import { getBasename, getParentDir, nativeSceneRoot, nativePhotoVariantMatchesModel } from '../utils/colmapPathResolver';
import { isAuxiliaryImagePath, isImageFile, isDatasetMaskImagePath, normalizeImagePath, getPathSuffixes } from '../utils/imageFileLookupPolicy';

export interface NativePathMatch { status: 'resolved' | 'missing' | 'ambiguous'; path?: string; candidates?: string[] }
export interface NativeMaskMatch extends NativePathMatch { role?: 'validity' | 'unknown' }

const below = (path: string, root: string) => !root || path === root || path.startsWith(root + '/');
const common = (a: string, b: string) => {
  const left = a.split('/').filter(Boolean), right = b.split('/').filter(Boolean);
  let count = 0; while (count < left.length && count < right.length && left[count] === right[count]) count++;
  return count;
};
const maskPath = isDatasetMaskImagePath;
const clean = (path: string) => normalizeImagePath(path).replace(/^(?:\.\/)+/, '');
const unique = (paths: readonly string[]) => [...new Set(paths)];
// RFC 3986: normalize escape hex case and unreserved characters, retaining encoded delimiters.
const urlSegmentKey = (part: string) => part.replace(/%[0-9a-f]{2}/gi, escape => {
  const character = String.fromCharCode(parseInt(escape.slice(1), 16));
  return /^[a-z0-9._~-]$/i.test(character) ? character : escape.toUpperCase();
});
const nativeImageExtension = /\.(?:jpe?g|png|gif|bmp|webp|tiff?|fits?|exr)$/i;
// A timestamp such as 1697287.12345 is an extensionless name, not a .12345 format.
export const nativeImageStem = (path: string): string => path.replace(nativeImageExtension, '').toLowerCase();

/** Immutable physical-path index. Colliding aliases retain all candidates instead of first-file wins. */
export class NativeMediaPathIndex {
  private readonly exact = new Set<string>();
  private readonly folded = new Map<string, string[]>();
  private readonly identities = new Map<string, string[]>();
  private readonly identityFolded = new Map<string, string[]>();
  private readonly photos = new Map<string, string[]>();
  private readonly photoFolded = new Map<string, string[]>();
  private readonly photoStems = new Map<string, string[]>();
  private readonly masks = new Map<string, string[]>();
  private readonly maskFolded = new Map<string, string[]>();
  private readonly maskFiles = new Set<string>();
  private readonly foreignRoots: string[];
  private readonly declaredRole?: 'photo' | 'mask';
  private readonly baseUrl?: URL;
  private readonly basePath?: readonly string[];
  private readonly photoModelDir: string;
  private mappingAliases?: { exact: Map<string, string[]>; folded: Map<string, string[]> };
  readonly sceneRoot: string;
  readonly modelDir: string;

  constructor(paths: Iterable<string>, modelDir: string, options: { role?: 'photo' | 'mask'; layoutPaths?: Iterable<string>; baseUrl?: string } = {}) {
    this.declaredRole = options.role;
    this.baseUrl = options.baseUrl ? new URL('.', options.baseUrl) : undefined;
    this.basePath = this.baseUrl?.pathname.split('/').slice(0, -1).map(urlSegmentKey);
    this.modelDir = this.ownershipPath(clean(modelDir));
    modelDir = this.modelDir;
    // A URL scoped inside calibration has no container in its relative model path.
    this.photoModelDir = /(?:^|\/)dslr_calibration_(?:jpg|undistorted)(?:\/|$)/i.test(modelDir)
      ? modelDir : [this.baseUrl?.pathname ?? '', modelDir].join('/');
    this.sceneRoot = nativeSceneRoot(modelDir);
    const all = [...paths].map(clean), groups = new Map<string, Set<string>>();
    // A declared media list still belongs to the scenes in the complete physical listing.
    for (const entry of options.layoutPaths ? [...options.layoutPaths].map(clean) : all) {
      const path = this.ownershipPath(entry);
      if (/^(?:cameras|images)\.(?:bin|txt)$/i.test(getBasename(path))) {
        const dir = getParentDir(path), roles = groups.get(dir) ?? new Set<string>();
        roles.add(getBasename(path).split('.')[0].toLowerCase()); groups.set(dir, roles);
      }
    }
    const peerRoot = (dir: string) => {
      const conventional = nativeSceneRoot(dir);
      if (conventional !== dir || this.sceneRoot !== modelDir || dir === modelDir) return conventional;
      // Repeated custom containers (scene-a/reference, scene-b/reference) also have distinct owners.
      const left = modelDir.split('/'), right = dir.split('/');
      let suffix = 0;
      while (suffix < Math.min(left.length, right.length) - 1 && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix++;
      return right.slice(0, right.length - suffix).join('/');
    };
    this.foreignRoots = unique([...groups].filter(([, roles]) => roles.size === 2).map(([dir]) => peerRoot(dir)))
      .filter(root => root && root !== this.sceneRoot && !below(this.sceneRoot, root));
    const add = (index: Map<string, string[]>, key: string, path: string) => {
      const values = index.get(key);
      if (values) values.push(path); else index.set(key, [path]);
    };
    for (const path of all) {
      const lookupPath = this.lookupPath(path);
      if (lookupPath === undefined) continue;
      if (!isImageFile(lookupPath)) continue;
      this.exact.add(path); add(this.folded, path.toLowerCase(), path);
      const identity = this.identity(path);
      add(this.identities, identity, path); add(this.identityFolded, identity.toLowerCase(), path);
      const isMask = this.declaredRole === 'mask' || this.declaredRole === undefined && maskPath(lookupPath);
      // Keep masks for photos deliberately mapped into a shared scene. Lookup checks their owner.
      if (!isMask && !this.allowed(path)) continue;
      if (!this.declaredRole && !isMask && isAuxiliaryImagePath(lookupPath)) continue;
      if (!this.declaredRole && isMask && /(?:^|\/)(?:visualizations?|previews?)(?:\/|$)/i.test(lookupPath)) continue;
      if (isMask) this.maskFiles.add(path);
      for (const suffix of getPathSuffixes(lookupPath)) {
        add(isMask ? this.masks : this.photos, suffix, path);
        add(isMask ? this.maskFolded : this.photoFolded, suffix.toLowerCase(), path);
        if (!isMask) add(this.photoStems, nativeImageStem(suffix), path);
      }
    }
  }
  private lookupPath(path: string): string | undefined {
    const owned = this.ownershipPath(path);
    if (owned !== path) return owned;
    if (!/^https?:\/\//i.test(path)) return path;
    try { return new URL(path).pathname.split('/').map(segment => decodeURIComponent(segment)).join('/').replace(/^\/+/, ''); }
    catch { return undefined; }
  }
  /** Compare URLs inside this source with its relative listing without changing fetch URLs. */
  private ownershipPath(path: string): string {
    if (this.baseUrl && /^https?:\/\//i.test(path)) {
      try {
        const url = new URL(path);
        const parts = url.pathname.split('/'), prefix = this.basePath!;
        if (url.origin === this.baseUrl.origin && parts.length > prefix.length
          && prefix.every((part, index) => part === urlSegmentKey(parts[index]))) {
          return parts.slice(prefix.length).map(segment => decodeURIComponent(segment)).join('/');
        }
      } catch { /* Invalid resource URLs cannot acquire a relative owner. */ }
    }
    return path;
  }
  /** Physical resource identity excludes URL signatures but retains its source origin. */
  private identity(path: string): string {
    const owned = this.ownershipPath(path);
    if (owned !== path || !/^https?:\/\//i.test(path)) return owned;
    try { return new URL(path).origin + '/' + this.lookupPath(path); }
    catch { return path; }
  }
  /** Logical comparison key for source metadata; never use it as a replacement fetch URL. */
  resourceIdentity(path: string): string {
    return this.identity(clean(path));
  }
  private physicalPaths(path: string): string[] {
    if (this.exact.has(path)) return [path];
    const identity = this.identity(path);
    return this.identities.get(identity) ?? this.folded.get(path.toLowerCase()) ?? this.identityFolded.get(identity.toLowerCase()) ?? [];
  }
  private allowed(path: string): boolean {
    const owned = this.ownershipPath(path);
    return nativePhotoVariantMatchesModel(owned, this.photoModelDir) && !this.foreignRoots.some(root => below(owned, root));
  }
  isPhotoPath(path: string): boolean {
    const lookup = this.lookupPath(clean(path));
    return lookup !== undefined && nativePhotoVariantMatchesModel(lookup, this.photoModelDir)
      && this.declaredRole !== 'mask' && (this.declaredRole === 'photo' || !isAuxiliaryImagePath(lookup));
  }
  isScenePhoto(path: string): boolean {
    return this.allowed(clean(path)) && this.isPhotoPath(path);
  }
  isSceneRootPhoto(path: string): boolean {
    return this.isScenePhoto(path) && getParentDir(this.identity(clean(path))) === this.sceneRoot;
  }
  /** Exact physical lookup for a declared prefix; never infer an unlisted file. */
  file(path: string): NativePathMatch {
    path = clean(path);
    const matches = unique(this.physicalPaths(path));
    return matches.length === 1 ? { status: 'resolved', path: matches[0] }
      : matches.length ? { status: 'ambiguous', candidates: matches } : { status: 'missing' };
  }
  private ranked(paths: readonly string[], name: string, canonicalRoot: string, explicit = false): NativePathMatch {
    const candidates = unique(paths).filter(path => explicit || this.allowed(path));
    if (!candidates.length) return { status: 'missing' };
    // A registered name may itself contain a real images/ subdirectory.
    const relative = canonicalRoot + '/' + name;
    const canonical = (this.sceneRoot ? this.sceneRoot + '/' : '') + relative;
    const score = (path: string) => {
      path = this.ownershipPath(path);
      const parent = getParentDir(path);
      return (path.toLowerCase() === canonical.toLowerCase() ? 1000000 : 0) + common(parent, this.modelDir) * 1000
        + (path.toLowerCase().endsWith('/' + relative.toLowerCase()) || path.toLowerCase() === relative.toLowerCase() ? 100 : 0);
    };
    const best = candidates.reduce((maximum, path) => Math.max(maximum, score(path)), -Infinity);
    const matches = candidates.filter(path => score(path) === best);
    return matches.length === 1 ? { status: 'resolved', path: matches[0] } : { status: 'ambiguous', candidates: matches };
  }
  /** Build qualified physical aliases only when a relative explicit mapping needs them. */
  private mappedPaths(path: string): string[] {
    if (!this.mappingAliases) {
      const exact = new Map<string, string[]>(), folded = new Map<string, string[]>();
      const add = (index: Map<string, string[]>, key: string, physical: string) => {
        const paths = index.get(key);
        if (paths) paths.push(physical); else index.set(key, [physical]);
      };
      for (const physical of this.exact) {
        const lookup = this.lookupPath(physical);
        if (lookup === undefined) continue;
        for (const suffix of getPathSuffixes(lookup)) {
          add(exact, suffix, physical); add(folded, suffix.toLowerCase(), physical);
        }
      }
      this.mappingAliases = { exact, folded };
    }
    return this.mappingAliases.exact.get(path) ?? this.mappingAliases.folded.get(path.toLowerCase()) ?? [];
  }
  image(name: string, override?: string): NativePathMatch {
    name = clean(name);
    if (override !== undefined) {
      const path = clean(override);
      const physical = this.physicalPaths(path);
      // Mapping paths may be relative to a scene inside a dropped outer folder or repository.
      const matches = physical.length ? physical : path.includes('/') ? this.mappedPaths(path)
        : this.photos.get(path) ?? this.photoFolded.get(path.toLowerCase()) ?? [];
      // Qualified mappings declare photo roles; only complete physical paths can cross known scene owners.
      return this.ranked(matches, name, 'images', physical.length > 0);
    }
    const keys = unique(['images/' + name, name]);
    const exact = unique(keys.flatMap(key => this.photos.get(key) ?? []));
    const folded = exact.length ? exact : keys.flatMap(key => this.photoFolded.get(key.toLowerCase()) ?? []);
    const matches = folded.length ? folded : keys.flatMap(key => this.photoStems.get(nativeImageStem(key)) ?? []);
    return this.ranked(matches, name, 'images');
  }
  private maskRole(path: string, name: string, imagePath?: string): 'validity' | 'unknown' {
    const lookup = this.lookupPath(path)?.toLowerCase(), relative = 'masks/' + name.toLowerCase() + '.png';
    if (lookup === relative || lookup?.endsWith('/' + relative)) return 'validity';
    if (imagePath !== undefined) {
      const photo = this.identity(imagePath), sibling = photo.replace(/(^|\/)images(?=\/)/i, '$1masks');
      if (sibling !== photo && this.identity(path).toLowerCase() === (sibling + '.png').toLowerCase()) return 'validity';
    }
    return 'unknown';
  }
  /** Only a resolved photo path can authorize a mask associated with a known peer scene. */
  mask(name: string, imagePath?: string): NativeMaskMatch {
    if (!this.masks.size) return { status: 'missing' };
    name = clean(name);
    const source = this.identity(clean(imagePath ?? name)), root = source.endsWith(name) ? source.slice(0, -name.length).replace(/\/$/, '') : getParentDir(source);
    const photoOwner = imagePath === undefined ? undefined : this.foreignRoots.filter(owner => below(this.ownershipPath(imagePath), owner))
      .sort((left, right) => right.length - left.length)[0];
    const allowedMask = (path: string) => photoOwner ? below(this.ownershipPath(path), photoOwner) : this.allowed(path)
      || imagePath !== undefined && common(getParentDir(this.identity(path)), getParentDir(source))
        > common(getParentDir(this.identity(path)), this.modelDir);
    const relative = source.endsWith(name) ? name : getBasename(source);
    const forms = (value: string) => {
      const stem = value.replace(nativeImageExtension, '');
      return unique([value + '.png', value, ...(stem !== value ? [stem + '.png', stem + '_mask.png'] : [])]);
    };
    const preferred: string[] = [];
    const replaced = source.replace(/(^|\/)images(?=\/)/i, '$1masks');
    if (replaced !== source) preferred.push(...forms(replaced));
    const parent = getParentDir(root);
    for (const folder of ['masks', 'mask', 'fg_masks', 'obj_masks', 'com_masks']) {
      preferred.push(...forms((parent ? parent + '/' : '') + folder + '/' + relative));
      preferred.push(...forms((this.sceneRoot ? this.sceneRoot + '/' : '') + folder + '/' + name));
    }
    for (const candidate of unique(preferred)) {
      const matches = unique(this.physicalPaths(candidate)).filter(path => this.maskFiles.has(path) && allowedMask(path));
      if (matches.length) {
        const match = matches.length === 1 ? { status: 'resolved' as const, path: matches[0] } : { status: 'ambiguous' as const, candidates: matches };
        return { ...match, role: match.path ? this.maskRole(match.path, name, imagePath) : 'unknown' };
      }
    }
    const keys = forms(name), matches = unique(keys.flatMap(key => this.masks.get(key) ?? this.maskFolded.get(key.toLowerCase()) ?? []));
    const match = this.ranked(matches.filter(allowedMask), name, 'masks', true);
    return { ...match, role: match.path ? this.maskRole(match.path, name, imagePath) : 'unknown' };
  }
}
