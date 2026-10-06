import { hfAuth, type HfAuthState } from './auth';
import { HfError } from './http';
import { huggingFaceDatasetReadRepoId } from '../../utils/huggingFaceUrl';

// A connection's known private repos avoid an anonymous failure for every lazy image.
// Weak keys discard this routing hint on disconnect/reconnect; no token is retained here.
const privateRepos = new WeakMap<HfAuthState, Set<string>>();
const discard = (response: Response) => { void response.body?.cancel().catch(() => {}); };

/** Public reads stay anonymous. Private reads use only the tab's current OAuth session. */
export async function fetchHuggingFaceDatasetRequest(url: string, init: RequestInit = {}): Promise<Response> {
  init.signal?.throwIfAborted();
  const repo = huggingFaceDatasetReadRepoId(url);
  if (!repo || !['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase())) return fetch(url, init);
  const request = { ...init, credentials: 'omit' as const };
  if (new Headers(init.headers).has('Authorization')) return fetch(url, request);

  const authenticated = async (token: string) => {
    const connection = hfAuth.getSnapshot();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    // Browser fetch strips Authorization when Hub storage redirects to another origin.
    const response = await fetch(url, { ...request, headers, cache: 'no-store' });
    init.signal?.throwIfAborted();
    if (response.status === 401) {
      discard(response);
      if (hfAuth.getSnapshot() === connection && hfAuth.getReadAccessToken() === token) hfAuth.expire();
      throw new HfError('Your Hugging Face connection expired. Sign in again to open private datasets.', 401);
    }
    if (response.status === 403) {
      discard(response);
      throw new HfError('This Hugging Face account cannot read the dataset. Check repository and organization permissions.', 403);
    }
    if (response.ok && hfAuth.getSnapshot() === connection) {
      const repos = privateRepos.get(connection) ?? new Set<string>();
      repos.add(repo);
      privateRepos.set(connection, repos);
    }
    return response;
  };

  const token = privateRepos.get(hfAuth.getSnapshot())?.has(repo) ? hfAuth.getReadAccessToken() : null;
  if (token) return authenticated(token);
  const response = await fetch(url, request);
  init.signal?.throwIfAborted();
  if (![401, 403, 404].includes(response.status)) return response;
  const retryToken = hfAuth.getReadAccessToken();
  if (retryToken) {
    discard(response);
    return authenticated(retryToken);
  }
  if (response.status !== 404) {
    discard(response);
    throw new HfError('Sign in with Hugging Face to open private datasets, then retry the URL.', response.status);
  }
  return response;
}

/** Fail before replacing the current scene, including Hub's deliberately ambiguous private 404s. */
export async function checkHuggingFaceDatasetAccess(infoUrl: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>): Promise<void> {
  // Only the status is needed. Avoid generating the repo's complete sibling listing.
  const accessUrl = new URL(infoUrl);
  accessUrl.searchParams.delete('expand[]');
  accessUrl.searchParams.set('expand', 'private');
  const response = await fetchImpl(accessUrl.href);
  discard(response);
  if (response.ok) return;
  if (response.status === 404) throw new HfError(hfAuth.getReadAccessToken()
    ? 'Hugging Face dataset not found or unavailable to this account. Check the URL and repository permissions.'
    : 'Hugging Face dataset not found or private. Sign in with Hugging Face and check the URL.', 404);
  throw new HfError(`Could not check Hugging Face dataset access (${response.status}). Please retry.`, response.status);
}
