import { HfError } from '../huggingface/http';
import { hasControlCharacters } from '../../utils/controlCharacters';

export function publicationPath(input: string): string {
  const path = input.replace(/\\/g, '/');
  if (!path || path.length > 4096 || path.startsWith('/') || /^[a-zA-Z]:/.test(path)
    || hasControlCharacters(path)
    || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new HfError('An asset has an unsafe or unsupported relative filename.', undefined, true);
  }
  return path;
}

export function encodePublicationPath(path: string): string {
  return publicationPath(path).split('/').map(encodeURIComponent).join('/');
}

export function validateRepositoryName(name: string): string {
  const value = name.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,94}[a-zA-Z0-9]$/.test(value) && !/^[a-zA-Z0-9]$/.test(value)) {
    throw new HfError('Use 1–96 letters, numbers, dots, hyphens or underscores; start and end with a letter or number.');
  }
  if (value.includes('--') || value.includes('..') || /\.(git|ipynb)$/i.test(value)) throw new HfError('Choose a repository name without consecutive dots/hyphens or a reserved extension.');
  return value;
}

export function datasetFileUrl(repoId: string, revision: string, path: string): string {
  return `https://huggingface.co/datasets/${repoId}/resolve/${encodeURIComponent(revision)}/${encodePublicationPath(path)}`;
}

/** `path` is the decoded repository path after the revision (no trailing slash). */
export function parseHfAssetUrl(value: string): { repoId: string; revision: string; path: string; url: URL } {
  // A malformed URL comes from the captured dataset, so it fails the same way on every retry.
  let url: URL;
  try { url = new URL(value); } catch { throw new HfError('The dataset has an invalid remote file URL.', undefined, true); }
  const match = /^\/datasets\/([a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+)\/resolve\/([^/]+)\//.exec(url.pathname);
  if (url.origin !== 'https://huggingface.co' || url.username || url.password || url.hash || url.search || !match) {
    throw new HfError('Copy these remote assets locally before publishing. Only public Hugging Face asset URLs can be pinned.', undefined, true);
  }
  try {
    const path = url.pathname.slice(match[0].length).split('/').filter(Boolean).map(decodeURIComponent).join('/');
    return { repoId: match[1], revision: decodeURIComponent(match[2]), path, url };
  } catch { throw new HfError('The dataset has an invalid Hugging Face file URL.', undefined, true); }
}

/** The Hub file URL with its revision replaced by the commit it resolves to. */
export async function pinHfAssetUrl(value: string, resolveRevision: (repoId: string, revision: string) => Promise<string>): Promise<string> {
  const parsed = parseHfAssetUrl(value);
  const sha = await resolveRevision(parsed.repoId, parsed.revision);
  parsed.url.pathname = parsed.url.pathname.replace(/(\/resolve\/)[^/]+\//, `$1${sha}/`);
  return parsed.url.href;
}
