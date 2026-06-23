/**
 * Pure path-resolution for locating a COLMAP model within an arbitrary set of
 * relative paths. Shared by local file classification (drag/drop) and remote
 * discovery (HuggingFace tree / directory listings) so both find the model the
 * same way, regardless of whether it lives in `sparse/0/`, `colmap/`, the
 * dataset root, or some other subdirectory.
 */

export interface ColmapPathSelection {
  /** Parent directory of the selected model ('' for the dataset root). */
  dir: string;
  cameras?: string;
  images?: string;
  points3D?: string;
  database?: string;
  rigs?: string;
  frames?: string;
}

type ColmapRole = 'cameras' | 'images' | 'points3D' | 'database' | 'rigs' | 'frames';

type ColmapDirectory = Partial<Record<ColmapRole, string>>;

function getParentDir(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.substring(0, lastSlash) : '';
}

function getBasename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.substring(lastSlash + 1) : normalized;
}

/** Map a filename to the COLMAP role it fills, or null if it is not a COLMAP file. */
function getColmapRole(filename: string): ColmapRole | null {
  switch (filename.toLowerCase()) {
    case 'cameras.bin':
    case 'cameras.txt':
      return 'cameras';
    case 'images.bin':
    case 'images.txt':
      return 'images';
    case 'points3d.bin':
    case 'points3d.txt':
      return 'points3D';
    case 'database.db':
    case 'colmap.db':
      return 'database';
    case 'rigs.bin':
    case 'rigs.txt':
      return 'rigs';
    case 'frames.bin':
    case 'frames.txt':
      return 'frames';
    default:
      return null;
  }
}

/** Within a role, prefer a binary file over a text file (database has no .txt form). */
function choosePreferredPath(current: string | undefined, candidate: string): string {
  if (!current) {
    return candidate;
  }
  const candidateIsBinary = candidate.toLowerCase().endsWith('.bin');
  const currentIsBinary = current.toLowerCase().endsWith('.bin');
  if (candidateIsBinary || !currentIsBinary) {
    return candidate;
  }
  return current;
}

/**
 * Lower score = more likely to be the intended COLMAP model directory.
 * Recognises the conventional COLMAP layouts (`sparse/N`, `sparse`, `colmap`)
 * and falls back to a depth/length heuristic for anything else.
 */
export function getColmapDirectoryScore(dir: string): number {
  const lower = dir.toLowerCase();

  if (/(^|\/)sparse\/\d+$/.test(lower)) return 0; // sparse/0, sparse/1, a/b/sparse/0
  if (/(^|\/)sparse$/.test(lower)) return 1;
  if (/(^|\/)colmap\/\d+$/.test(lower)) return 1; // colmap/0
  if (/(^|\/)colmap$/.test(lower)) return 2;
  if (lower.includes('/sparse/') || lower.startsWith('sparse/')) return 3;
  if (lower.includes('/colmap/') || lower.startsWith('colmap/')) return 4;

  return 5 + dir.length;
}

export interface ResolveColmapPathsOptions {
  /** When true (default) a model must include a points3D file to be selected. */
  requirePoints3D?: boolean;
}

/**
 * Find the best COLMAP model directory within a set of relative paths.
 * Returns the chosen directory and the resolved path for each role, or null
 * when no complete model is present.
 */
export function resolveColmapPaths(
  paths: Iterable<string>,
  options: ResolveColmapPathsOptions = {}
): ColmapPathSelection | null {
  const requirePoints3D = options.requirePoints3D ?? true;
  const directories = new Map<string, ColmapDirectory>();

  for (const rawPath of paths) {
    const role = getColmapRole(getBasename(rawPath));
    if (!role) {
      continue;
    }
    const dir = getParentDir(rawPath);
    const entry = directories.get(dir) ?? {};
    entry[role] = role === 'database'
      ? (entry[role] ?? rawPath)
      : choosePreferredPath(entry[role], rawPath);
    directories.set(dir, entry);
  }

  const candidates: { dir: string; entry: ColmapDirectory }[] = [];
  for (const [dir, entry] of directories) {
    if (entry.cameras && entry.images && (entry.points3D || !requirePoints3D)) {
      candidates.push({ dir, entry });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    const scoreDelta = getColmapDirectoryScore(a.dir) - getColmapDirectoryScore(b.dir);
    return scoreDelta !== 0 ? scoreDelta : a.dir.localeCompare(b.dir);
  });

  const best = candidates[0];
  return {
    dir: best.dir,
    cameras: best.entry.cameras,
    images: best.entry.images,
    points3D: best.entry.points3D,
    database: best.entry.database,
    rigs: best.entry.rigs,
    frames: best.entry.frames,
  };
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif'];

function isImageFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isImagesNamedDir(dir: string): boolean {
  const lower = dir.toLowerCase();
  return lower === 'images' || lower.endsWith('/images');
}

/**
 * Prefer directories canonically named `images`, and among those the one
 * nearest the COLMAP model directory (images may sit beside the bins). Falls
 * back to the directory holding the most images for non-conventional layouts.
 */
function getImagesDirScore(dir: string, modelDir?: string): number {
  let score = 0;
  if (isImagesNamedDir(dir)) {
    score += 1000;
  }
  if (modelDir !== undefined) {
    const parent = getParentDir(dir);
    if (dir === modelDir) {
      score += 200; // images sit in the same directory as the bins
    } else if (parent === modelDir) {
      score += 300; // an images/ directory directly under the model dir
    } else if (modelDir !== '' && dir.startsWith(`${modelDir}/`)) {
      score += 250; // nested somewhere under the model dir
    } else {
      const modelParent = getParentDir(modelDir);
      if (modelParent !== '' && (dir === modelParent || dir.startsWith(`${modelParent}/`))) {
        score += 150; // a sibling subtree of the model dir (e.g. corrected/images vs colmap/)
      }
    }
  }
  return score;
}

export interface ResolveImagesDirOptions {
  /** Directory of the COLMAP model, used to prefer a nearby images directory. */
  modelDir?: string;
}

/**
 * Find the directory that holds the reconstruction's images. Images are
 * canonically under an `images` folder, but not necessarily at the dataset
 * root - it may be a sibling of the bins (e.g. `corrected/images`) or directly
 * under the model dir. Returns the directory (no trailing slash) or null.
 */
/**
 * The canonical `images` root ancestor of an image path, if any. Images are
 * often nested in per-camera subdirectories (e.g. `images/cam_1/00.png`), so
 * the images directory is the `images` ancestor, not the file's immediate
 * parent. Returns null when no `images` segment is an ancestor.
 */
function findImagesRootDir(path: string): string | null {
  const segments = path.replace(/\\/g, '/').split('/');
  // Skip the filename (last segment); search ancestor directory segments.
  for (let i = segments.length - 2; i >= 0; i -= 1) {
    if (segments[i].toLowerCase() === 'images') {
      return segments.slice(0, i + 1).join('/');
    }
  }
  return null;
}

export function resolveImagesDir(
  paths: Iterable<string>,
  options: ResolveImagesDirOptions = {}
): string | null {
  const counts = new Map<string, number>();
  for (const rawPath of paths) {
    if (!isImageFilename(getBasename(rawPath))) {
      continue;
    }
    // Prefer the canonical `images` root (images may be nested in per-camera
    // subdirs); fall back to the immediate parent for non-conventional layouts.
    const dir = findImagesRootDir(rawPath) ?? getParentDir(rawPath);
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return null;
  }

  let best: { dir: string; count: number; score: number } | null = null;
  for (const [dir, count] of counts) {
    const score = getImagesDirScore(dir, options.modelDir);
    const better =
      !best ||
      score > best.score ||
      (score === best.score && count > best.count) ||
      (score === best.score && count === best.count && dir.localeCompare(best.dir) < 0);
    if (better) {
      best = { dir, count, score };
    }
  }

  return best?.dir ?? null;
}
