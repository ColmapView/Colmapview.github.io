import type { ColmapManifest } from '../types/manifest';
import {
  getPreferredSplatCandidate,
  getSplatFileExtension,
  isSplatFilePath,
  sortSplatCandidatesByPreference,
  type SplatFileExtension,
} from '../utils/splatFilePolicy';
import { resolveColmapPaths, resolveImagesDir } from '../utils/colmapPathResolver';
import {
  encodeUrlPath,
  normalizeCloudStorageUrl,
  normalizeGitHostingUrl,
} from '../utils/urlUtils';

export interface UrlLoaderFileEntry {
  key: string;
  path: string;
}

export interface HuggingFaceDatasetTreeRequest {
  apiUrl: string;
  treePath: string;
}

export interface HuggingFaceDatasetTreeEntry {
  type?: unknown;
  path?: unknown;
  size?: unknown;
}

export interface DirectoryListingLink {
  url: string;
  relativePath: string;
  isDirectory: boolean;
  isSplat: boolean;
}

export interface RemoteSplatCandidate {
  path: string;
  size: number;
  /** PLY vertex count captured during classification; absent/null = unknown. */
  splatCount?: number | null;
}

export type HuggingFaceSplatCandidate = RemoteSplatCandidate;

export interface ManifestColmapFileEntries {
  requiredFiles: UrlLoaderFileEntry[];
  optionalFiles: UrlLoaderFileEntry[];
}

export interface ManifestLazySourceBases {
  imageUrlBase: string;
  maskUrlBase: string;
  /**
   * Absolute, already-encoded per-image URLs (COLMAP image name -> URL) for
   * datasets that ship an explicit mapping. Each value is a finished URL and
   * must be used verbatim — never re-encoded or passed through buildImageUrl.
   */
  imageNameToUrl?: Record<string, string>;
}

export type ManifestLoadSource =
  | { type: 'url'; sourceUrl?: string }
  | { type: 'manifest' };

export interface ManifestLoadSourceInfo extends ManifestLazySourceBases {
  sourceType: ManifestLoadSource['type'];
  sourceUrl: string | null;
  sourceManifest: ColmapManifest | null;
  successLabel: string;
}

export type UrlNormalizationKind = 'cloud' | 'git';

export interface UrlNormalizationStep {
  kind: UrlNormalizationKind;
  from: string;
  to: string;
}

export interface UrlNormalizationResult {
  url: string;
  steps: UrlNormalizationStep[];
}

export function joinManifestUrlPath(baseUrl: string, relativePath: string): string {
  const encodedPath = encodeUrlPath(relativePath);
  return baseUrl.endsWith('/')
    ? `${baseUrl}${encodedPath}`
    : `${baseUrl}/${encodedPath}`;
}

export function createDefaultManifest(baseUrl: string): ColmapManifest {
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  return {
    version: 1,
    baseUrl: cleanBaseUrl,
    files: {
      cameras: 'sparse/0/cameras.bin',
      images: 'sparse/0/images.bin',
      points3D: 'sparse/0/points3D.bin',
      rigs: 'sparse/0/rigs.bin',
      frames: 'sparse/0/frames.bin',
    },
    imagesPath: 'images/',
    masksPath: 'masks/',
  };
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function encodePathSegments(segments: readonly string[]): string {
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

function normalizePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '');
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function ensureTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}

function getDirectoryRootUrl(baseUrl: string): URL | null {
  try {
    const url = new URL(baseUrl);
    url.pathname = ensureTrailingSlash(url.pathname);
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function getRelativeUrlPath(rootUrl: URL, targetUrl: URL): string | null {
  if (targetUrl.origin !== rootUrl.origin) {
    return null;
  }

  const rootPath = ensureTrailingSlash(rootUrl.pathname);
  if (!targetUrl.pathname.startsWith(rootPath)) {
    return null;
  }

  const relativePath = targetUrl.pathname.slice(rootPath.length);
  if (!relativePath) {
    return null;
  }

  // URL.pathname keeps segments percent-encoded; decode them so the stored
  // relative path matches the decoded form HuggingFace paths use. Callers
  // re-encode exactly once (encodeUrlPath/joinManifestUrlPath); leaving it
  // encoded here would double-encode tiles with '#'/spaces (e.g. 5x5#-5.ply)
  // and 404 the fetch.
  return normalizePath(relativePath)
    .split('/')
    .map(decodePathSegment)
    .join('/');
}

function shouldSkipDirectoryHref(href: string): boolean {
  const lower = href.trim().toLowerCase();
  return (
    lower.length === 0 ||
    lower.startsWith('#') ||
    lower.startsWith('?') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('mailto:')
  );
}

export function getDirectoryListingRootUrl(baseUrl: string): string | null {
  return getDirectoryRootUrl(baseUrl)?.toString() ?? null;
}

export function getDirectoryListingLinks(
  listingUrl: string,
  rootUrl: string,
  html: string
): DirectoryListingLink[] {
  const root = getDirectoryRootUrl(rootUrl);
  if (!root) {
    return [];
  }

  let current: URL;
  try {
    current = new URL(listingUrl);
  } catch {
    return [];
  }

  const links: DirectoryListingLink[] = [];
  const seen = new Set<string>();
  const hrefPattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

  for (const match of html.matchAll(hrefPattern)) {
    const rawHref = match[1] ?? match[2] ?? match[3] ?? '';
    const href = decodeHtmlAttribute(rawHref.trim());
    if (shouldSkipDirectoryHref(href)) {
      continue;
    }

    let target: URL;
    try {
      target = new URL(href, current);
    } catch {
      continue;
    }

    target.hash = '';
    if (target.toString() === current.toString()) {
      continue;
    }

    const relativePath = getRelativeUrlPath(root, target);
    if (!relativePath) {
      continue;
    }

    const isDirectory = href.endsWith('/') || target.pathname.endsWith('/');
    const isSplat = isSplatFilePath(target.pathname);
    if (!isDirectory && !isSplat) {
      continue;
    }

    const key = target.toString();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    links.push({
      url: target.toString(),
      relativePath,
      isDirectory,
      isSplat,
    });
  }

  return links;
}

export function getHuggingFaceDatasetTreeRequest(baseUrl: string): HuggingFaceDatasetTreeRequest | null {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }

  if (url.hostname !== 'huggingface.co') {
    return null;
  }

  const segments = url.pathname
    .split('/')
    .filter(Boolean)
    .map(decodePathSegment);

  if (segments[0] !== 'datasets') {
    return null;
  }

  const resolveIndex = segments.indexOf('resolve');
  if (resolveIndex <= 1 || resolveIndex + 1 >= segments.length) {
    return null;
  }

  const repoSegments = segments.slice(1, resolveIndex);
  const revision = segments[resolveIndex + 1];
  const treeSegments = segments.slice(resolveIndex + 2);
  if (repoSegments.length === 0 || revision.length === 0) {
    return null;
  }

  const repoPath = encodePathSegments(repoSegments);
  const treePath = encodePathSegments(treeSegments);
  const treeSuffix = treePath ? `/${treePath}` : '';

  return {
    apiUrl: `${url.origin}/api/datasets/${repoPath}/tree/${encodeURIComponent(revision)}${treeSuffix}?recursive=true`,
    treePath: treeSegments.join('/'),
  };
}

export function getRelativeHuggingFaceTreePath(entryPath: string, treePath: string): string | null {
  const normalizedEntryPath = normalizePath(entryPath);
  const normalizedTreePath = normalizePath(treePath);

  if (!normalizedTreePath) {
    return normalizedEntryPath || null;
  }

  if (!normalizedEntryPath.startsWith(`${normalizedTreePath}/`)) {
    return null;
  }

  const relativePath = normalizedEntryPath.slice(normalizedTreePath.length + 1);
  return relativePath || null;
}

/**
 * Collect each file entry's path from a HuggingFace tree listing as paths
 * relative to the tree root (skipping directories and malformed entries).
 */
export function getRelativeHuggingFaceTreePaths(
  entries: readonly HuggingFaceDatasetTreeEntry[],
  treePath: string
): string[] {
  const relativePaths: string[] = [];
  for (const entry of entries) {
    if (entry.type !== 'file' || typeof entry.path !== 'string') {
      continue;
    }
    const relativePath = getRelativeHuggingFaceTreePath(entry.path, treePath);
    if (relativePath) {
      relativePaths.push(relativePath);
    }
  }
  return relativePaths;
}

export interface HuggingFaceColmapPaths {
  cameras: string;
  images: string;
  points3D: string;
  rigs?: string;
  frames?: string;
}

/**
 * Locate a complete COLMAP model within a HuggingFace dataset tree, returning
 * the file paths relative to the tree root. Uses the shared path resolver, so
 * it finds the model wherever it lives (colmap/, sparse/0/, the root, ...),
 * not just the conventional sparse/0 location.
 */
export function getHuggingFaceColmapPaths(
  entries: readonly HuggingFaceDatasetTreeEntry[],
  treePath: string
): HuggingFaceColmapPaths | null {
  const relativePaths = getRelativeHuggingFaceTreePaths(entries, treePath);
  const selection = resolveColmapPaths(relativePaths, { requirePoints3D: true });
  if (!selection || !selection.cameras || !selection.images || !selection.points3D) {
    return null;
  }

  return {
    cameras: selection.cameras,
    images: selection.images,
    points3D: selection.points3D,
    rigs: selection.rigs,
    frames: selection.frames,
  };
}

export const LARGE_COLMAP_TOUCH_WARNING_BYTES = 150_000_000;

export function getHuggingFaceColmapTotalBytes(
  entries: readonly HuggingFaceDatasetTreeEntry[],
  treePath: string,
  colmap: Pick<HuggingFaceColmapPaths, 'cameras' | 'images' | 'points3D'>
): number | null {
  const sizeByRelativePath = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type !== 'file' || typeof entry.path !== 'string' || typeof entry.size !== 'number') continue;
    const relativePath = getRelativeHuggingFaceTreePath(entry.path, treePath);
    if (relativePath) sizeByRelativePath.set(relativePath, entry.size);
  }

  let total = 0;
  for (const path of [colmap.cameras, colmap.images, colmap.points3D]) {
    const size = sizeByRelativePath.get(path);
    if (size === undefined) return null;
    total += size;
  }
  return total;
}

/** Non-blocking heads-up before a phone downloads a quarter-gigabyte of bins. */
export function getLargeColmapDatasetWarning(
  totalBytes: number | null,
  isTouchDevice: boolean
): string | null {
  if (!isTouchDevice || totalBytes === null || totalBytes <= LARGE_COLMAP_TOUCH_WARNING_BYTES) {
    return null;
  }
  return `Large dataset (${Math.round(totalBytes / 1_000_000)} MB of COLMAP data) - may exceed this device's memory`;
}

/**
 * Locate the images directory within a HuggingFace dataset tree, relative to the
 * tree root and with a trailing slash (e.g. 'corrected/images/'). `modelDir` is
 * the relative directory of the COLMAP model, used to prefer a nearby images
 * folder. Returns null when no images are present.
 */
export function getHuggingFaceImagesPath(
  entries: readonly HuggingFaceDatasetTreeEntry[],
  treePath: string,
  modelDir?: string
): string | null {
  const relativePaths = getRelativeHuggingFaceTreePaths(entries, treePath);
  const dir = resolveImagesDir(relativePaths, { modelDir });
  if (dir === null) {
    return null;
  }
  return dir === '' ? '' : `${dir}/`;
}

export function getHuggingFaceSplatPaths(
  entries: readonly HuggingFaceDatasetTreeEntry[],
  treePath: string
): RemoteSplatCandidate[] {
  const candidates: RemoteSplatCandidate[] = [];

  for (const entry of entries) {
    if (entry.type !== 'file' || typeof entry.path !== 'string' || typeof entry.size !== 'number') {
      continue;
    }

    const relativePath = getRelativeHuggingFaceTreePath(entry.path, treePath);
    if (!relativePath || !isSplatFilePath(relativePath)) {
      continue;
    }

    if (!Number.isFinite(entry.size) || entry.size < 0) {
      continue;
    }

    candidates.push({ path: relativePath, size: entry.size });
  }

  return sortRemoteSplatCandidates(candidates);
}

export function getPreferredHuggingFaceSplatPath(
  entries: readonly HuggingFaceDatasetTreeEntry[],
  treePath: string
): RemoteSplatCandidate | null {
  return getHuggingFaceSplatPaths(entries, treePath)[0] ?? null;
}

export const getLargestHuggingFacePlyPath = getPreferredHuggingFaceSplatPath;

export function getLargestRemoteSplatCandidate(
  current: RemoteSplatCandidate | null,
  candidate: RemoteSplatCandidate
): RemoteSplatCandidate {
  return getPreferredSplatCandidate(current, candidate);
}

export function sortRemoteSplatCandidates(
  candidates: readonly RemoteSplatCandidate[]
): RemoteSplatCandidate[] {
  return sortSplatCandidatesByPreference(candidates);
}

/**
 * Auto-load byte budget for a lone discovered splat. A single candidate used to
 * auto-download unconditionally, which for large tiles meant an unprompted
 * multi-GB fetch — on phones that OOM-crashes the tab into a reload loop.
 * Over-budget candidates stay in the catalog for explicit selection instead.
 */
export const SPLAT_AUTO_LOAD_MAX_BYTES = 150_000_000;
/** Stricter budget on touch devices: phone tabs get roughly a 1 GB memory cap. */
export const SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH = 50_000_000;

export interface SplatAutoLoadDecision {
  autoLoad: boolean;
  budgetBytes: number;
  /** The lone candidate that exceeded the budget (drives the skip log), or null. */
  oversizedCandidate: RemoteSplatCandidate | null;
}

export function getSplatAutoLoadDecision(
  candidates: readonly RemoteSplatCandidate[],
  { isTouchDevice }: { isTouchDevice: boolean }
): SplatAutoLoadDecision {
  const budgetBytes = isTouchDevice ? SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH : SPLAT_AUTO_LOAD_MAX_BYTES;
  if (candidates.length !== 1) {
    return { autoLoad: false, budgetBytes, oversizedCandidate: null };
  }

  const candidate = candidates[0];
  // Size 0 means unknown (e.g. HEAD blocked on a static host); keep the legacy
  // auto-load for those rather than silently hiding the only splat.
  if (candidate.size > budgetBytes) {
    return { autoLoad: false, budgetBytes, oversizedCandidate: candidate };
  }

  return { autoLoad: true, budgetBytes, oversizedCandidate: null };
}

/**
 * Bytes-per-splat by format, for estimating the GPU-relevant splat count when
 * the exact header count is unknown. PLY: SH1 gaussian layout (26 float32 =
 * 104 B; denser SH3 files over-estimate the count, which only makes the gate
 * stricter). SPZ: compressed, ~16 B/splat.
 */
export const SPLAT_BYTES_PER_SPLAT_ESTIMATE: Record<SplatFileExtension, number> = {
  '.ply': 104,
  '.spz': 16,
};

/**
 * Phone GPUs in a browser tab render roughly 1-3M gaussians; above ~3M the
 * outcome is a context loss or OOM kill, so the picker disables the row
 * instead of offering a crash. Task 7's byte-less loader raises this to 4M.
 */
export const TOUCH_SPLAT_DISABLE_MIN_SPLATS = 3_000_000;

export function getEstimatedSplatCount(
  source: { path: string; size?: number; splatCount?: number | null }
): number | null {
  if (typeof source.splatCount === 'number' && source.splatCount > 0) {
    return source.splatCount;
  }
  const extension = getSplatFileExtension(source.path);
  if (!extension || !source.size || source.size <= 0) {
    return null;
  }
  return Math.floor(source.size / SPLAT_BYTES_PER_SPLAT_ESTIMATE[extension]);
}

export type SplatDeviceTier = 'ok' | 'hint' | 'disabled';

export function getSplatDeviceTier(
  source: { path: string; size?: number; splatCount?: number | null },
  { isTouchDevice }: { isTouchDevice: boolean }
): SplatDeviceTier {
  if (!isTouchDevice) return 'ok';

  const estimated = getEstimatedSplatCount(source);
  if (estimated !== null && estimated > TOUCH_SPLAT_DISABLE_MIN_SPLATS) {
    return 'disabled';
  }
  return (source.size ?? 0) > SPLAT_AUTO_LOAD_MAX_BYTES_TOUCH ? 'hint' : 'ok';
}

export function getManifestColmapFileEntries(manifest: ColmapManifest): ManifestColmapFileEntries {
  const { files } = manifest;
  const requiredFiles = [
    { key: 'sparse/0/cameras.bin', path: files.cameras },
    { key: 'sparse/0/images.bin', path: files.images },
    { key: 'sparse/0/points3D.bin', path: files.points3D },
  ];

  const optionalFiles: UrlLoaderFileEntry[] = [];
  if (files.rigs) {
    optionalFiles.push({ key: 'sparse/0/rigs.bin', path: files.rigs });
  }
  if (files.frames) {
    optionalFiles.push({ key: 'sparse/0/frames.bin', path: files.frames });
  }
  for (const path of manifest.splats ?? []) {
    optionalFiles.push({ key: path, path });
  }

  return { requiredFiles, optionalFiles };
}

export function getManifestLazySourceBases(manifest: ColmapManifest): ManifestLazySourceBases {
  const imagesPath = manifest.imagesPath ?? 'images/';
  const masksPath = manifest.masksPath ?? 'masks/';

  const bases: ManifestLazySourceBases = {
    imageUrlBase: joinManifestUrlPath(manifest.baseUrl, imagesPath),
    maskUrlBase: joinManifestUrlPath(manifest.baseUrl, masksPath),
  };

  // joinManifestUrlPath encodes each path exactly once; the resulting URLs are
  // final and used by the adapter verbatim (never re-encoded via buildImageUrl).
  const mappings = Object.entries(manifest.imageNameToPath ?? {});
  if (mappings.length > 0) {
    bases.imageNameToUrl = Object.fromEntries(
      mappings.map(([name, relativePath]) => [name, joinManifestUrlPath(manifest.baseUrl, relativePath)])
    );
  }

  return bases;
}

export function getManifestLoadSourceInfo(
  manifest: ColmapManifest,
  source: ManifestLoadSource
): ManifestLoadSourceInfo {
  const bases = getManifestLazySourceBases(manifest);

  if (source.type === 'manifest') {
    return {
      ...bases,
      sourceType: 'manifest',
      sourceUrl: null,
      sourceManifest: manifest,
      successLabel: 'manifest',
    };
  }

  return {
    ...bases,
    sourceType: 'url',
    sourceUrl: source.sourceUrl ?? manifest.baseUrl,
    sourceManifest: null,
    successLabel: 'URL',
  };
}

export function normalizeLoadUrl(url: string): UrlNormalizationResult {
  const steps: UrlNormalizationStep[] = [];
  let normalizedUrl = normalizeCloudStorageUrl(url);

  if (normalizedUrl !== url) {
    steps.push({ kind: 'cloud', from: url, to: normalizedUrl });
  }

  const gitNormalizedUrl = normalizeGitHostingUrl(normalizedUrl);
  if (gitNormalizedUrl !== normalizedUrl) {
    steps.push({ kind: 'git', from: normalizedUrl, to: gitNormalizedUrl });
    normalizedUrl = gitNormalizedUrl;
  }

  return { url: normalizedUrl, steps };
}

export function getUrlNormalizationLogMessage(step: UrlNormalizationStep): string {
  const label = step.kind === 'cloud' ? 'cloud' : 'Git';
  return `[URL Loader] Normalized ${label} URL: ${step.from} -> ${step.to}`;
}

export function getArchiveUrlDetectedLogMessage(url: string): string {
  return `[URL Loader] Detected archive URL: ${url}`;
}

export function getManifestLoadedLogMessage(manifest: ColmapManifest): string {
  return `[URL Loader] Loaded manifest: ${manifest.name || 'unnamed'}`;
}

export function getDefaultUrlManifestLogMessage(url: string): string {
  return `[URL Loader] Using direct URL with default paths: ${url}`;
}

export function getInlineManifestLoadLogMessage(manifest: ColmapManifest): string {
  return `[URL Loader] Loading from manifest: ${manifest.name || 'unnamed'}`;
}
