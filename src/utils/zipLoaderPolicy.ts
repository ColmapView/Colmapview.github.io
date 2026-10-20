import {
  compareSplatCandidates,
  isSplatFilePath,
  type SplatCandidate,
} from './splatFilePolicy';
import {
  getImagePathLookupSuffixes,
} from './imageFileLookupPolicy';
import { resolveColmapPaths } from './colmapPathResolver';

/** Archive extensions handled by libarchive.js. */
export const ARCHIVE_EXTENSIONS = [
  '.zip',
  '.tar.gz', '.tgz',
  '.tar.bz2', '.tbz2', '.tbz',
  '.tar.xz', '.txz',
  '.tar',
  '.7z',
] as const;

export const ARCHIVE_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/zip',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
  'application/x-bzip2',
  'application/x-xz',
  'application/x-7z-compressed',
]);

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif'];

const COLMAP_FILENAMES = new Set([
  'cameras.bin',
  'cameras.txt',
  'images.bin',
  'images.txt',
  'points3d.bin',
  'points3d.txt',
  'rigs.bin',
  'rigs.txt',
  'frames.bin',
  'frames.txt',
]);

export function hasArchiveExtension(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return ARCHIVE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/** A file name without its archive extension; null when nothing is left. */
export function stripArchiveExtension(name: string): string | null {
  const lower = name.toLowerCase();
  const extension = ARCHIVE_EXTENSIONS.find(ext => lower.endsWith(ext));
  return (extension ? name.slice(0, -extension.length) : name) || null;
}

export function isArchiveMimeType(type: string): boolean {
  return ARCHIVE_MIME_TYPES.has(type);
}

export function isArchiveImagePath(path: string): boolean {
  const lower = path.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

export function isArchiveColmapPath(path: string): boolean {
  const filename = path.split('/').pop()?.toLowerCase() ?? '';
  return COLMAP_FILENAMES.has(filename);
}

export function isArchiveSplatPath(path: string): boolean {
  return isSplatFilePath(path);
}

export type ArchiveSplatCandidate = SplatCandidate;

export function sortArchiveSplatCandidatesByPreference<TCandidate extends ArchiveSplatCandidate>(
  candidates: readonly TCandidate[]
): TCandidate[] {
  return candidates
    .filter((candidate) => isArchiveSplatPath(candidate.path))
    .sort((a, b) => compareSplatCandidates(b, a));
}

export function buildArchiveEntryPath(entryPath: string | undefined, fileName: string): string {
  if (!entryPath) {
    return fileName;
  }

  const dir = entryPath.endsWith('/') ? entryPath : `${entryPath}/`;
  return `${dir}${fileName}`;
}

export function getArchiveImageLookupKeys(fullPath: string): string[] {
  return getImagePathLookupSuffixes(fullPath);
}

/** Retain physical paths and only aliases that identify one archive entry. */
export function buildArchiveImageIndex<T>(entries: ReadonlyMap<string, T>): Map<string, T> {
  const index = new Map<string, T>(), ambiguous = new Set<string>();
  for (const [path, entry] of entries) {
    for (const key of getArchiveImageLookupKeys(path)) {
      if (ambiguous.has(key)) continue;
      if (index.has(key) && index.get(key) !== entry) {
        index.delete(key);
        ambiguous.add(key);
      } else index.set(key, entry);
    }
  }
  // A real file at this complete path wins over aliases from nested files.
  for (const [path, entry] of entries) index.set(path, entry);
  return index;
}

export function getColmapArchiveKey(entryPath: string): string {
  const filename = entryPath.split('/').pop() ?? entryPath;

  if (!entryPath.includes('sparse/')) {
    return `sparse/0/${filename}`;
  }

  const match = entryPath.match(/(sparse\/\d+\/[^/]+)$/);
  return match ? match[1] : `sparse/0/${filename}`;
}

export function hasRequiredColmapArchiveFiles(keys: Iterable<string>, options: { requirePoints3D?: boolean } = {}): boolean {
  return resolveColmapPaths(keys, options) !== null;
}

export function getZipEntryLookupCandidates(imageName: string): string[] {
  const normalized = imageName.replace(/\\/g, '/');
  // A missing mask must never fall back to the original image's basename.
  if (normalized.toLowerCase().startsWith('masks/')) return [normalized, `sparse/0/${normalized}`];
  const filename = normalized.split('/').pop() ?? normalized;
  const candidates = [
    normalized,
    filename,
    `images/${normalized}`,
    `sparse/0/${normalized}`,
  ];

  return Array.from(new Set(candidates));
}
