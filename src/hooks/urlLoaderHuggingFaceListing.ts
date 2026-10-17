import { getHuggingFaceDatasetTreeRequest, getRelativeHuggingFaceTreePaths, type HuggingFaceDatasetTreeEntry } from './urlLoaderPolicy';
import { fetchDatasetResource } from '../utils/fetchDatasetResource';
import { readBoundedResponseBytes } from '../dataset/importers/sourceAccess';
import { MAX_CAMERA_METADATA_BYTES } from '../dataset/importers/types';
import { normalizeSourcePath } from '../dataset/importers/sourcePaths';

/** Only a complete, scene-scoped listing can replace per-photo extension probes or establish array order. */
export async function getHuggingFaceUrlFilePaths(baseUrl: string, signal?: AbortSignal,
  fetchImpl = fetchDatasetResource): Promise<readonly string[] | undefined> {
  const request = getHuggingFaceDatasetTreeRequest(baseUrl);
  if (!request) return undefined;
  const api = new URL(request.apiUrl), visited = new Set<string>(), entries = new Map<string,HuggingFaceDatasetTreeEntry>();
  let next: string | null = request.apiUrl;
  try {
    while (next) {
      if (visited.has(next) || visited.size >= 50) return undefined;
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
      const link = response.headers.get('Link');
      const match = link?.split(',').map(part=>/<([^>]+)>\s*;\s*rel\s*=\s*"?next"?/i.exec(part)).find(Boolean);
      next = match?.[1] ?? null;
    }
    const paths=getRelativeHuggingFaceTreePaths([...entries.values()],request.treePath).map(normalizeSourcePath);
    return new Set(paths).size===paths.length ? paths : undefined;
  } catch {
    signal?.throwIfAborted();
    return undefined;
  }
}
