import { hfAuth, type HfAuthState } from './auth';
import { HfError } from './http';
import { huggingFaceDatasetReadRepoId } from '../../utils/huggingFaceUrl';
import { appLogger } from '../../utils/logger';

// A connection's known private repos avoid an anonymous failure for every lazy image.
// Weak keys discard this routing hint on disconnect/reconnect; no token is retained here.
const privateRepos = new WeakMap<HfAuthState, Set<string>>();
const discard = (response: Response) => { void response.body?.cancel().catch(() => {}); };

/** The Hub's marks for a missing file or revision in a repo that anonymous readers can see. */
const MISSING_FROM_VISIBLE_REPO = new Set(['EntryNotFound', 'RevisionNotFound']);

/** Private, gated and missing repos all answer anonymous reads with 401; an unmarked 404 may hide one too. */
function mayBeAccessDenial(response: Response): boolean {
  if (response.status === 401 || response.status === 403) return true;
  return response.status === 404 && !MISSING_FROM_VISIBLE_REPO.has(response.headers.get('X-Error-Code') ?? '');
}

/** Anonymously, the Hub cannot say whether a repo is missing or private. */
const MISSING_OR_PRIVATE = 'Hugging Face dataset not found, or it is private. Check the URL. '
  + 'Sign in with Hugging Face to open a private dataset, then retry.';

const isGated = (response: Response) => response.headers.get('X-Error-Code') === 'GatedRepo';

function signedOutDenial(response: Response): HfError {
  return new HfError(isGated(response)
    ? 'This Hugging Face dataset is gated: only accounts its owner has approved can open its files.'
    : MISSING_OR_PRIVATE, response.status, false, { provider: 'hf' });
}

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
      throw new HfError('Your Hugging Face connection expired. Sign in again to open private datasets.', 401, false, { provider: 'hf' });
    }
    if (response.status === 403) {
      discard(response);
      // Without the gated-repos scope, an account its owner approved is refused too.
      throw new HfError(isGated(response) ? 'This Hugging Face dataset is gated, and this sign-in cannot open its files.'
        : 'This Hugging Face account cannot read the dataset. Check repository and organization permissions.', 403, false, { provider: 'hf' });
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
  // Only an answer an account could change is retried: a public repo's missing file stays one request.
  if (!mayBeAccessDenial(response)) return response;
  const retryToken = hfAuth.getReadAccessToken();
  if (retryToken) {
    discard(response);
    return authenticated(retryToken);
  }
  if (response.status !== 404) {
    discard(response);
    throw signedOutDenial(response);
  }
  return response;
}

/** A busy or unreachable metadata API says nothing about the files themselves. */
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Fail before replacing the current scene, including Hub's deliberately ambiguous private 404s.
 * `signal` is the load's own; while it is live, an AbortError means a stalled Hub API.
 */
export async function checkHuggingFaceDatasetAccess(infoUrl: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, signal?: AbortSignal): Promise<void> {
  // Only the status is needed. Avoid generating the repo's complete sibling listing.
  const accessUrl = new URL(infoUrl);
  accessUrl.searchParams.delete('expand[]');
  accessUrl.searchParams.set('expand', 'private');
  let response: Response;
  try {
    response = await fetchImpl(accessUrl.href);
  } catch (error) {
    // Cancellation and the account answers raised while fetching stand. Some engines report the
    // transport timeout as a plain AbortError too.
    const aborted = Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
    if (error instanceof HfError || (aborted && (!signal || signal.aborted))) throw error;
    appLogger.warn('[Hugging Face] Dataset access check failed; continuing with the dataset files.', error);
    return;
  }
  discard(response);
  if (response.ok) return;
  if (response.status === 404) throw new HfError(hfAuth.getReadAccessToken()
    ? 'Hugging Face dataset not found or unavailable to this account. Check the URL and repository permissions.'
    : MISSING_OR_PRIVATE, 404, false, hfAuth.getReadAccessToken() ? undefined : { provider: 'hf' });
  if (isTransientStatus(response.status)) {
    appLogger.warn(`[Hugging Face] Dataset access check returned ${response.status}; continuing with the dataset files.`);
    return;
  }
  throw new HfError(`Could not check Hugging Face dataset access (${response.status}). Please retry.`, response.status);
}
