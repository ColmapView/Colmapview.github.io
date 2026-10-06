/** Normalize dataset pages, revision trees and files without changing their revision. */
export function normalizeHuggingFaceDatasetUrl(value: string): string | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.origin !== 'https://huggingface.co' || url.username || url.password) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'datasets' || parts.length < 3) return null;
  if (parts.length === 3) {
    url.pathname = `/${parts.join('/')}/resolve/main/`;
  } else if (['tree', 'blob', 'resolve'].includes(parts[3]) && parts[4]) {
    url.pathname = url.pathname.replace(/^\/datasets\/([^/]+\/[^/]+)\/(tree|blob)\//, '/datasets/$1/resolve/');
  } else return null;
  return url.href;
}

function datasetRepoId(url: URL, api = false): string | null {
  const prefix = api ? '/api/datasets/' : '/datasets/';
  if (!url.pathname.startsWith(prefix)) return null;
  const [owner, name] = url.pathname.slice(prefix.length).split('/');
  if (!owner || !name) return null;
  try {
    const parts = [owner, name].map(part => decodeURIComponent(part));
    return parts.every(part => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part)) ? parts.join('/') : null;
  } catch { return null; }
}

/** Only the exact Hub origin and dataset metadata/tree/resolve endpoints can receive a token. */
export function huggingFaceDatasetReadRepoId(value: string): string | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.origin !== 'https://huggingface.co' || url.username || url.password) return null;
  if (/^\/datasets\/[^/]+\/[^/]+\/resolve\/[^/]+(?:\/|$)/.test(url.pathname)) return datasetRepoId(url);
  if (/^\/api\/datasets\/[^/]+\/[^/]+\/?$/.test(url.pathname)
    || /^\/api\/datasets\/[^/]+\/[^/]+\/revision\/[^/]+\/?$/.test(url.pathname)
    || /^\/api\/datasets\/[^/]+\/[^/]+\/tree\/[^/]+(?:\/|$)/.test(url.pathname)) return datasetRepoId(url, true);
  return null;
}

/** Permission check for a pasted dataset, folder, manifest or file URL. */
export function huggingFaceDatasetInfoUrl(value: string): string | null {
  const normalized = normalizeHuggingFaceDatasetUrl(value);
  if (!normalized) return null;
  const repo = datasetRepoId(new URL(normalized));
  return repo ? `https://huggingface.co/api/datasets/${repo}` : null;
}

/** Look beside the supplied project/file, then its ancestors through the repo root. */
export function huggingFaceSettingsUrls(value: string, filename: string, isFile = false): string[] {
  const normalized = normalizeHuggingFaceDatasetUrl(value);
  if (!normalized) return [];
  const url = new URL(normalized);
  const parts = url.pathname.split('/').filter(Boolean);
  const root = `${url.origin}/${parts.slice(0, 5).join('/')}/`;
  const directory = parts.slice(5);
  if (isFile) directory.pop();
  const candidates: string[] = [];
  // Bound optional probes even for an excessively deep user-provided path.
  for (let depth = directory.length; depth > 0 && candidates.length < 7; depth--) {
    candidates.push(root + directory.slice(0, depth).join('/') + '/' + filename);
  }
  return [...candidates, root + filename];
}
