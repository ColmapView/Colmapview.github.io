import { getHuggingFaceDatasetTreeRequest, getRelativeHuggingFaceTreePaths, type HuggingFaceDatasetTreeEntry } from './urlLoaderPolicy';
import { fetchDatasetResource } from '../utils/fetchDatasetResource';
import { readBoundedResponseBytes } from '../dataset/importers/sourceAccess';
import { MAX_CAMERA_METADATA_BYTES } from '../dataset/importers/types';
import { normalizeSourcePath } from '../dataset/importers/sourcePaths';

const HUGGINGFACE_TREE_MAX_PAGES = 50;

/** Only a complete, scene-scoped listing can replace per-photo extension probes or establish array order. */
export async function getHuggingFaceUrlFilePaths(baseUrl: string, signal?: AbortSignal,
  fetchImpl = fetchDatasetResource): Promise<readonly string[] | undefined> {
  const request = getHuggingFaceDatasetTreeRequest(baseUrl);
  if (!request) return undefined;
  const api = new URL(request.apiUrl), visited = new Set<string>(), entries = new Map<string,HuggingFaceDatasetTreeEntry>();
  let next: string | null = request.apiUrl;
  try {
    while (next) {
      if (visited.has(next) || visited.size >= HUGGINGFACE_TREE_MAX_PAGES) return undefined;
      visited.add(next);
      const url = new URL(next);
      if (url.origin !== api.origin || url.pathname !== api.pathname) return undefined;
      const response = await fetchImpl(next, undefined, {signal});
      if (!response.ok) { await response.body?.cancel().catch(() => {}); return undefined; }
      const chunks = await readBoundedResponseBytes(response,'Hugging Face file listing',MAX_CAMERA_METADATA_BYTES,signal);
      const decoder = new TextDecoder();
      const page: unknown = JSON.parse(chunks.map(chunk=>decoder.decode(chunk,{stream:true})).join('')+decoder.decode());
      if (!Array.isArray(page)) return undefined;
      for (const entry of page as HuggingFaceDatasetTreeEntry[]) if (entry && typeof entry.path === 'string') {
        entries.set(entry.path,entry);
        if (entries.size > 100_000) return undefined;
      }
      next = parseHuggingFaceNextLink(response.headers.get('Link'));
    }
    const paths=getRelativeHuggingFaceTreePaths([...entries.values()],request.treePath).map(normalizeSourcePath);
    return new Set(paths).size===paths.length ? paths : undefined;
  } catch {
    signal?.throwIfAborted();
    return undefined;
  }
}

type FetchUrl = (url: string, init?: RequestInit) => Promise<Response>;

function safeUrlOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function parseHuggingFaceNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel\s*=\s*"?next"?/i);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Best-effort model/splat discovery follows pagination and retains partial
 * results on a repeated cursor or page cap. Only getHuggingFaceUrlFilePaths
 * establishes a complete, scene-scoped listing suitable for photo ordering.
 */
export async function fetchHuggingFaceTreeEntries(
  apiUrl: string,
  fetchImpl: FetchUrl
): Promise<HuggingFaceDatasetTreeEntry[]> {
  const entries: HuggingFaceDatasetTreeEntry[] = [];
  const seenPaths = new Set<string>();
  const visitedUrls = new Set<string>();
  const apiOrigin = safeUrlOrigin(apiUrl);
  let nextUrl: string | null = apiUrl;
  let pages = 0;

  while (nextUrl && pages < HUGGINGFACE_TREE_MAX_PAGES) {
    // Break a cyclic/repeated pagination cursor instead of re-fetching forever.
    if (visitedUrls.has(nextUrl)) {
      break;
    }
    visitedUrls.add(nextUrl);
    pages += 1;
    const response = await fetchImpl(nextUrl);
    if (!response.ok) {
      throw new Error(`Hugging Face tree request failed (${response.status})`);
    }
    const page: unknown = await response.json();
    if (Array.isArray(page)) {
      // De-duplicate by path so a repeated entry can't make a single splat look
      // like several (which would suppress auto-load and force the picker).
      for (const entry of page as HuggingFaceDatasetTreeEntry[]) {
        if (entry && typeof entry.path === 'string' && !seenPaths.has(entry.path)) {
          seenPaths.add(entry.path);
          entries.push(entry);
        }
      }
    }
    const candidateNext = parseHuggingFaceNextLink(
      response.headers.get('Link') ?? response.headers.get('link')
    );
    // Only follow pagination that stays on the original origin (defense against a
    // tampered/compromised Link header redirecting the crawl off-site).
    nextUrl = candidateNext && safeUrlOrigin(candidateNext) === apiOrigin ? candidateNext : null;
  }

  return entries;
}
