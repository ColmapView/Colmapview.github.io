import type { ColmapManifest } from '../types/manifest';
import {
  getPreferredSplatCandidate,
  isSplatFilePath,
  sortSplatCandidatesByPreference,
} from '../utils/splatFilePolicy';
import {
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
}

export type HuggingFaceSplatCandidate = RemoteSplatCandidate;

export interface ManifestColmapFileEntries {
  requiredFiles: UrlLoaderFileEntry[];
  optionalFiles: UrlLoaderFileEntry[];
}

export interface ManifestLazySourceBases {
  imageUrlBase: string;
  maskUrlBase: string;
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
  return baseUrl.endsWith('/')
    ? `${baseUrl}${relativePath}`
    : `${baseUrl}/${relativePath}`;
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

  return normalizePath(relativePath);
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

  return {
    imageUrlBase: joinManifestUrlPath(manifest.baseUrl, imagesPath),
    maskUrlBase: joinManifestUrlPath(manifest.baseUrl, masksPath),
  };
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
