import type { Image } from '../../types/colmap';
import { publicationPath } from './publicationPaths';

/** Keep existing JPEG names; allocate unique JPEG names without merging different source images. */
export function publicationJpegNames(images: ReadonlyMap<number, Image>): Map<number, string> {
  const names = [...new Set([...images.values()].map(image => image.name))];
  const key = (name: string) => name.normalize('NFC').toLowerCase();
  const occupied = new Set(names.map(name => key(publicationPath(name))));
  const renamed = new Map<string, string>();
  for (const name of names) {
    const source = publicationPath(name);
    if (/\.jpe?g$/i.test(source)) { renamed.set(name, source); continue; }
    const base = source.replace(/\.[^./]+$/, '');
    let candidate = `${base}.jpg`;
    if (occupied.has(key(candidate))) candidate = `${source}.jpg`;
    for (let suffix = 2; occupied.has(key(candidate)); suffix++) candidate = `${source}-${suffix}.jpg`;
    publicationPath(candidate);
    occupied.add(key(candidate)); renamed.set(name, candidate);
  }
  return new Map([...images].map(([id, image]) => [id, renamed.get(image.name)!]));
}
