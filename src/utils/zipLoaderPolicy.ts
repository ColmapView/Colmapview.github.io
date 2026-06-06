import {
  compareSplatCandidates,
  getPreferredSplatCandidate,
  isSplatFilePath,
  type SplatCandidate,
} from './splatFilePolicy';

/** Archive extensions handled by libarchive.js. */
export const ARCHIVE_EXTENSIONS = [
  '.zip',
  '.tar.gz', '.tgz',
  '.tar.bz2', '.tbz2', '.tbz',
  '.tar.xz', '.txz',
  '.tar',
  '.7z',
] as const;

const ARCHIVE_MIME_TYPES = new Set([
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

export function isArchivePlyPath(path: string): boolean {
  return path.toLowerCase().endsWith('.ply');
}

export function isArchiveSplatPath(path: string): boolean {
  return isSplatFilePath(path);
}

export interface ArchivePlyCandidate {
  path: string;
  size: number;
}

export type ArchiveSplatCandidate = SplatCandidate;

export function findLargestArchivePlyCandidate<TCandidate extends ArchivePlyCandidate>(
  candidates: readonly TCandidate[]
): TCandidate | undefined {
  let largest: TCandidate | undefined;

  for (const candidate of candidates) {
    if (!isArchivePlyPath(candidate.path)) {
      continue;
    }

    if (!largest || candidate.size > largest.size) {
      largest = candidate;
    }
  }

  return largest;
}

export function findPreferredArchiveSplatCandidate<TCandidate extends ArchiveSplatCandidate>(
  candidates: readonly TCandidate[]
): TCandidate | undefined {
  let preferred: TCandidate | null = null;

  for (const candidate of candidates) {
    if (!isArchiveSplatPath(candidate.path)) {
      continue;
    }

    preferred = getPreferredSplatCandidate(preferred, candidate);
  }

  return preferred ?? undefined;
}

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
  const filename = fullPath.split('/').pop() ?? fullPath;
  return filename === fullPath ? [fullPath] : [fullPath, filename];
}

export function getColmapArchiveKey(entryPath: string): string {
  const filename = entryPath.split('/').pop() ?? entryPath;

  if (!entryPath.includes('sparse/')) {
    return `sparse/0/${filename}`;
  }

  const match = entryPath.match(/(sparse\/\d+\/[^/]+)$/);
  return match ? match[1] : `sparse/0/${filename}`;
}

export function hasRequiredColmapArchiveFiles(keys: Iterable<string>): boolean {
  let foundCameras = false;
  let foundImages = false;
  let foundPoints = false;

  for (const key of keys) {
    const filename = key.split('/').pop()?.toLowerCase() ?? key.toLowerCase();
    if (filename === 'cameras.bin' || filename === 'cameras.txt') foundCameras = true;
    if (filename === 'images.bin' || filename === 'images.txt') foundImages = true;
    if (filename === 'points3d.bin' || filename === 'points3d.txt') foundPoints = true;
  }

  return foundCameras && foundImages && foundPoints;
}

export function getZipEntryLookupCandidates(imageName: string): string[] {
  const normalized = imageName.replace(/\\/g, '/');
  const filename = normalized.split('/').pop() ?? normalized;
  const candidates = [
    normalized,
    filename,
    `images/${normalized}`,
    `sparse/0/${normalized}`,
  ];

  return Array.from(new Set(candidates));
}
