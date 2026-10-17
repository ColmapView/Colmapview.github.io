import { importError } from './types';
import { isCameraImagePath, leafPath } from './sourcePaths';

/** IDR mask and image stems may use different zero padding, e.g. 000000.png / 000.png. */
export function indexDtuMasks(paths: Iterable<string>, root: string): (imagePath: string) => string | undefined {
  const prefix = (root ? root + '/' : '') + 'mask/';
  const key = (name: string) => {
    const stem = leafPath(name).replace(/\.[^/.]+$/, '');
    return /^\d+$/.test(stem) && Number.isSafeInteger(Number(stem)) ? `number:${Number(stem)}` : `name:${stem}`;
  };
  const masks = new Map<string, string[]>();
  for (const path of paths) {
    if (!path.startsWith(prefix) || path.slice(prefix.length).includes('/') || !isCameraImagePath(path)) continue;
    const stem = key(path);
    masks.set(stem, [...masks.get(stem) ?? [], root ? path.slice(root.length + 1) : path]);
  }
  return imagePath => {
    const matches = masks.get(key(imagePath)) ?? [];
    if (matches.length > 1) return importError('AMBIGUOUS_IMAGE_PATH', `Multiple DTU masks match ${imagePath}.`);
    return matches[0];
  };
}
