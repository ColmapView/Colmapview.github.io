/** Nerfstudio's images_N convention; never search by basename or across scenes. */
export function nerfstudioVariantPath(path: string, factor: number, folder = 'images'): string | null {
  const url = /^https?:\/\//i.test(path) ? new URL(path) : null;
  const original = url?.pathname ?? path;
  const replaced = original.replace(new RegExp(`(^|/)${folder}/`), `$1${folder}_${factor}/`);
  if (replaced === original) return null;
  if (!url) return replaced;
  url.pathname = replaced;
  return url.href;
}

export function findNerfstudioImageVariant(path: string, exists: (path: string) => boolean) {
  if (exists(path)) return null;
  for (let factor = 2; factor <= 64; factor *= 2) {
    const candidate = nerfstudioVariantPath(path, factor);
    if (candidate && exists(candidate)) return { path: candidate, factor };
  }
  return null;
}
