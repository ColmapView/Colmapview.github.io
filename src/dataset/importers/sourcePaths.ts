import { encodeUrlPath } from '../../utils/urlUtils';
import { importError } from './types';

export const CAMERA_IMAGE_EXTENSIONS = ['.png','.jpg','.jpeg','.webp','.bmp','.tif','.tiff'];
export const parentPath = (path: string) => path.includes('/') ? path.slice(0,path.lastIndexOf('/')) : '';
export const leafPath = (path: string) => path.slice(path.lastIndexOf('/')+1);
export const isCameraMetadataPath = (path: string) => /(?:^|\/)(?:transforms(?:_[^/]*)?\.json|reconstruction(?:_example)?\.json|sfm_data\.json|cameras\.json|poses_bounds\.npy|cameras(?:_sphere|_normalized)?\.npz|bundle\.out)$/i.test(path);
export const isCameraImagePath = (path: string) => CAMERA_IMAGE_EXTENSIONS.some(ext => path.toLowerCase().endsWith(ext));
export const isAbsoluteResourceUrl = (path: string) => /^https?:\/\//i.test(path);
const metadataDirectory = /^(?:calibration|metadata|cameras|poses)$/i;
export function cameraMetadataSceneRoot(path: string): string {
  let root=parentPath(path);
  while (metadataDirectory.test(leafPath(root))) root=parentPath(root);
  return root;
}

export function commonSourceRoot(left: string, right: string): string {
  const a=left.split('/').filter(Boolean),b=right.split('/').filter(Boolean);
  let count=0;
  while (count<a.length && count<b.length && a[count]===b[count]) count++;
  return a.slice(0,count).join('/');
}

/** Parent references stay in the selected source branch and cannot enter another named scene. */
export function cameraSourceSceneScope(metadataRoot: string, paths: Iterable<string>): string {
  const peers=new Set<string>();
  for (const path of paths) {
    if (isCameraMetadataPath(path)) peers.add(cameraMetadataSceneRoot(path));
    else if (/(?:^|\/)(?:cameras|images|points3D)\.(?:bin|txt)$/i.test(path)) {
      peers.add(parentPath(path).replace(/(?:^|\/)(?:sparse(?:\/\d+)?|colmap)$/i,''));
    }
  }
  peers.delete(cameraMetadataSceneRoot(metadataRoot+'/transforms.json'));
  let scope=metadataRoot;
  while (scope.includes('/') || metadataDirectory.test(scope)) {
    const parent=parentPath(scope);
    if ([...peers].some(peer=>peer===parent || ((!parent || peer.startsWith(parent+'/')) && peer!==scope && !peer.startsWith(scope+'/')))) break;
    scope=parent;
  }
  return scope;
}

export function normalizeSourcePath(value: string): string {
  if (/[\0\r\n]/.test(value) || value.startsWith('/') || value.startsWith('\\') || /^[a-z]:/i.test(value)) return importError('INVALID_IMAGE_PATH', `Unsupported absolute or invalid path: ${value}`);
  const parts: string[] = [];
  for (const part of value.replace(/\\/g,'/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return importError('INVALID_IMAGE_PATH', `Path escapes the selected source: ${value}`);
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}

/** Canonical paths may not silently replace another original source entry. */
export function normalizeSourceIndex<T>(entries: Iterable<readonly [string,T]>): Map<string,T> {
  const normalized=new Map<string,T>();
  for (const [path,entry] of entries) {
    const key=normalizeSourcePath(path);
    if (normalized.has(key)) return importError('AMBIGUOUS_IMAGE_PATH',`Duplicate source path after normalization: ${key}.`);
    normalized.set(key,entry);
  }
  return normalized;
}

export function resolveSourcePath(root: string, reference: unknown, scope = root, allowUrl = false, baseUrl?: string): string {
  if (typeof reference !== 'string' || !reference.trim()) return importError('INVALID_IMAGE_PATH','Image/mask references must be nonempty strings.');
  if (isAbsoluteResourceUrl(reference)) {
    if (!allowUrl) return importError('INVALID_IMAGE_PATH','Absolute image URLs are only supported for URL sources.');
    return new URL(reference).href;
  }
  if (reference.startsWith('/') || reference.startsWith('\\') || /^[a-z]:/i.test(reference)) return importError('INVALID_IMAGE_PATH',`Absolute local path is unsupported: ${reference}`);
  if (/[\0\r\n]/.test(reference)) return importError('INVALID_IMAGE_PATH',`Invalid image/mask path: ${reference}`);
  if (allowUrl && baseUrl && /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(reference)) {
    return imageResourceUrl(baseUrl,(root ? root+'/'+reference : reference).replace(/\\/g,'/'));
  }
  const path = normalizeSourcePath(root ? `${root}/${reference}` : reference);
  if (scope && path !== scope && !path.startsWith(scope+'/')) return importError('INVALID_IMAGE_PATH',`Path leaves the selected scene: ${reference}`);
  return path;
}

export function canonicalImageName(path: string, sceneRoot: string, baseUrl?: string): string {
  let relative: string;
  if (isAbsoluteResourceUrl(path)) {
    const resource=new URL(path),base=baseUrl ? new URL(baseUrl) : undefined;
    const pathname=resource.pathname.replace(/^\//,'');
    const root=base?.origin===resource.origin ? commonSourceRoot(base.pathname.replace(/^\//,'').replace(/\/$/,''),parentPath(pathname)) : '';
    relative=decodeURIComponent(root ? pathname.slice(root.length+1) : pathname);
  } else relative=sceneRoot ? path.slice(sceneRoot.length+1) : path;
  const name = normalizeSourcePath(relative.replace(/^images\//,''));
  if (!name || !isCameraImagePath(name)) return importError('INVALID_IMAGE_PATH',`Unsupported image filename: ${name}`);
  return name;
}

export function imageResourceUrl(baseUrl: string, path: string): string {
  return isAbsoluteResourceUrl(path) ? path : new URL(encodeUrlPath(path),baseUrl).href;
}

export function indexExtensionlessImages(paths: Iterable<string>): ReadonlyMap<string,readonly string[]> {
  const index=new Map<string,string[]>();
  for (const path of paths) {
    if (!isCameraImagePath(path)) continue;
    const stem=path.slice(0,path.lastIndexOf('.'));
    const matches=index.get(stem) ?? [];matches.push(path);index.set(stem,matches);
  }
  return index;
}

export function resolveIndexedImage(path: string, paths: ReadonlySet<string>, index=indexExtensionlessImages(paths)): string | null {
  if (paths.has(path)) return path;
  if (isCameraImagePath(path)) return null;
  const matches = index.get(path) ?? [];
  if (matches.length > 1) return importError('AMBIGUOUS_IMAGE_PATH',`Multiple extensions match ${path}.`);
  return matches[0] ?? null;
}
