import type { HfConfig } from './config';
import { boundedFetch, HfError } from './http';
import { awaitWithAbort } from '../../utils/awaitWithAbort';
import { anySignal, timeoutSignal } from '../../utils/abortSignals';
import { accountSessions, type SessionToken } from '../accountSessions/api';

export interface HfIdentity { username: string }
export interface HfAuthState { status: 'disconnected' | 'connecting' | 'connected'; identity: HfIdentity | null; error: string | null }
interface Session { accessToken: string; expiresAt: number; identity: HfIdentity; canPublish: boolean }
type OAuthMemory = { codeVerifier?: string; nonce?: string };
export const HF_READ_SCOPES = 'openid profile read-repos';
export const HF_SCOPES = `${HF_READ_SCOPES} contribute-repos`;
export const HF_CALLBACK_TYPE = 'colmapview:hf-oauth:v1';

export function validateOAuthCallback(value: unknown, redirectUri: string, expectedState: string): string | null {
  if (typeof value !== 'object' || value === null || !('type' in value) || value.type !== HF_CALLBACK_TYPE
    || !('url' in value) || typeof value.url !== 'string' || value.url.length > 16384) return null;
  try {
    const url = new URL(value.url);
    const expected = new URL(redirectUri);
    if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.hash || url.username || url.password
      || url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== expectedState) return null;
    return url.href;
  } catch { return null; }
}

/** Explicit client_id is required for the public-client token exchange. */
export async function exchangeOAuthCode(config: HfConfig, callback: string, memory: OAuthMemory, signal: AbortSignal): Promise<Session> {
  const url = new URL(callback);
  if (url.searchParams.has('error')) throw new HfError('Hugging Face sign-in was declined.');
  const code = url.searchParams.get('code');
  const state = JSON.parse(url.searchParams.get('state') ?? '{}') as { nonce?: unknown; redirectUri?: unknown };
  if (!code || !memory.codeVerifier || !memory.nonce || state.nonce !== memory.nonce || state.redirectUri !== config.redirectUri) {
    throw new HfError('The sign-in response is invalid. Please reconnect.');
  }
  const request = boundedFetch(signal, 30_000);
  const response = await request('https://huggingface.co/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId,
      redirect_uri: config.redirectUri, code, code_verifier: memory.codeVerifier }),
  });
  if (!response.ok) throw new HfError('Hugging Face sign-in failed. Please reconnect.', response.status);
  const token = await response.json() as { access_token?: unknown; expires_in?: unknown; scope?: unknown };
  if (typeof token.access_token !== 'string' || !token.access_token || typeof token.expires_in !== 'number'
    || !Number.isFinite(token.expires_in) || token.expires_in <= 5 || typeof token.scope !== 'string') {
    throw new HfError('Hugging Face sign-in returned an invalid token. Please reconnect.');
  }
  const scopes = token.scope.split(' ');
  if (!scopes.includes('read-repos')) throw new HfError('Private dataset read permission was not granted. Reconnect and allow repository read access.');
  if (!config.readOnly && !scopes.includes('contribute-repos')) throw new HfError('Dataset publication permission was not granted.');
  const profile = await request('https://huggingface.co/oauth/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!profile.ok) throw new HfError('Could not identify the connected Hugging Face account.', profile.status);
  const user = await profile.json() as { preferred_username?: unknown };
  if (typeof user.preferred_username !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(user.preferred_username)) {
    throw new HfError('The connected account did not provide a valid username.');
  }
  signal.throwIfAborted();
  return { accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000,
    identity: { username: user.preferred_username }, canPublish: scopes.includes('contribute-repos') };
}

function receiveCallback(popup: Window, config: HfConfig, expectedState: string, transactionId: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`colmapview-hf-${transactionId}`);
    const cleanup = () => {
      clearInterval(poll); window.removeEventListener('message', onMessage); signal.removeEventListener('abort', abort); channel?.close();
    };
    const accept = (data: unknown) => {
      const result = validateOAuthCallback(data, config.redirectUri, expectedState);
      if (result) { cleanup(); resolve(result); }
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.source === popup) accept(event.data);
    };
    const abort = () => { cleanup(); reject(new HfError('Sign-in was cancelled or timed out. Please reconnect.')); };
    // COOP can sever WindowProxy while the same-origin callback channel still works.
    const poll = setInterval(() => { if (!channel && popup.closed) abort(); }, 500);
    window.addEventListener('message', onMessage);
    if (channel) channel.onmessage = event => accept(event.data);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export function createHfAuth() {
  let session: Session | null = null;
  let remembered = false;
  let needsRefresh = false;
  let currentPurpose: 'view' | 'publish' = 'view';
  let renewal: { purpose: 'view' | 'publish'; promise: Promise<boolean> } | null = null;
  let generation = 0;
  let pending: AbortController | null = null;
  let state: HfAuthState = { status: 'disconnected', identity: null, error: null };
  const listeners = new Set<() => void>();
  const set = (next: HfAuthState) => { state = next; listeners.forEach(listener => listener()); };
  const expire = () => {
    needsRefresh = true;
    session = null;
    set({ status: 'disconnected', identity: null, error: 'Your Hugging Face connection expired. Sign in again.' });
  };
  const getReadAccessToken = (): string | null => {
    if (session && session.expiresAt <= Date.now() + 5000) expire();
    return session?.accessToken ?? null;
  };
  const acceptSession = (token: SessionToken) => {
    if (!token.username || !token.scope.split(' ').includes('read-repos')) throw new HfError('Repository read permission was not granted.');
    remembered = true;
    needsRefresh = false;
    session = { accessToken: token.accessToken, expiresAt: token.expiresAt, identity: { username: token.username }, canPublish: token.scope.split(' ').includes('contribute-repos') };
    currentPurpose = session.canPublish ? 'publish' : 'view';
    set({ status: 'connected', identity: session.identity, error: null });
  };
  const restore = (purpose: 'view' | 'publish' = 'view', username?: string): Promise<boolean> => {
    const saved = accountSessions.getSnapshot();
    const hasPurpose = (value: 'view' | 'publish') => saved.accounts.some(account => account.provider === 'hf' && account.purpose === value);
    // A publishing grant already permits reads. Prefer a separate read grant when available.
    const actualPurpose = purpose === 'view' && !hasPurpose('view') ? 'publish' : purpose;
    if (!saved.capabilities.hf || !hasPurpose(actualPurpose)) return Promise.resolve(false);
    if (renewal?.purpose === actualPurpose) return renewal.promise;
    const attempt = generation;
    const promise = (needsRefresh ? accountSessions.token('hf', actualPurpose, undefined, undefined, true)
      : accountSessions.token('hf', actualPurpose)).then(token => {
      if (attempt !== generation || (username && token.username !== username)) return false;
      acceptSession(token); return true;
    }).catch(() => false).finally(() => { if (renewal?.promise === promise) renewal = null; });
    renewal = { purpose: actualPurpose, promise };
    return promise;
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getReadAccessToken,
    canPublish: () => Boolean(session?.canPublish),
    expire,
    restore,
    async ensureReadAccessToken(): Promise<string | null> {
      const token = getReadAccessToken();
      if (remembered && (!token || session!.expiresAt <= Date.now() + 60_000)) await restore(currentPurpose);
      return getReadAccessToken();
    },
    async ensureAccessToken(username?: string): Promise<string> {
      const token = getReadAccessToken();
      if (remembered && (!token || !session?.canPublish || session.expiresAt <= Date.now() + 60_000)) await restore('publish', username);
      if (!getReadAccessToken() || !session) throw new HfError('Reconnect the same Hugging Face account to continue.', 401);
      if (!session.canPublish) throw new HfError('Sign in from the publishing dialog to allow dataset publication.', 403);
      if (username && username !== session.identity.username) throw new HfError('Reconnect the account that started this publication.');
      return session.accessToken;
    },
    getAccessToken(username?: string) {
      if (!getReadAccessToken() || !session) {
        throw new HfError('Reconnect the same Hugging Face account to continue.', 401);
      }
      if (!session.canPublish) throw new HfError('Sign in from the publishing dialog to allow dataset publication.', 403);
      if (username && username !== session.identity.username) throw new HfError('Reconnect the account that started this publication.');
      return session.accessToken;
    },
    disconnect() {
      generation++;
      pending?.abort(); pending = null; session = null;
      set({ status: 'disconnected', identity: null, error: null });
      if (remembered || accountSessions.getSnapshot().accounts.some(account => account.provider === 'hf')) {
        remembered = false;
        void accountSessions.disconnect('hf').catch(() => {
          remembered = true;
          set({ status: 'disconnected', identity: null, error: 'Could not forget the saved connection. Check your connection and try Disconnect again.' });
        });
      }
    },
    connect(config: HfConfig): Promise<void> {
      if (pending) return Promise.resolve();
      generation++;
      if (accountSessions.getSnapshot().capabilities.hf) {
        const controller = new AbortController(); pending = controller;
        const attempt = generation;
        session = null; set({ status: 'connecting', identity: null, error: null });
        const purpose = config.readOnly ? 'view' : 'publish';
        const existing = accountSessions.getSnapshot().accounts.some(account => account.provider === 'hf' && account.purpose === purpose);
        return (existing ? accountSessions.token('hf', purpose, undefined, controller.signal, needsRefresh)
          : accountSessions.connect('hf', { purpose }, controller.signal))
          .then(token => { if (attempt === generation && pending === controller) acceptSession(token); })
          .catch(error => { if (attempt === generation && pending === controller) set({ status: 'disconnected', identity: null, error: error instanceof Error ? error.message : 'Could not connect to Hugging Face.' }); })
          .finally(() => { if (pending === controller) pending = null; });
      }
      const popup = window.open('about:blank', '_blank', 'popup,width=600,height=740');
      if (!popup) {
        set({ status: 'disconnected', identity: null, error: 'Allow the sign-in popup, then reconnect.' });
        return Promise.resolve();
      }
      const controller = new AbortController();
      const signal = anySignal([controller.signal, timeoutSignal(180_000)]);
      pending = controller;
      session = null;
      set({ status: 'connecting', identity: null, error: null });
      return (async () => {
        try {
          const { oauthLoginUrl } = await awaitWithAbort(import('@huggingface/hub'), signal);
          const memory: OAuthMemory = {};
          const id = crypto.randomUUID();
          const loginUrl = await awaitWithAbort(oauthLoginUrl({ clientId: config.clientId, redirectUrl: config.redirectUri,
            scopes: config.readOnly ? HF_READ_SCOPES : HF_SCOPES, state: id, localStorage: memory }), signal);
          signal.throwIfAborted();
          const authorization = new URL(loginUrl);
          if (authorization.origin !== 'https://huggingface.co') throw new HfError('Unexpected sign-in provider.');
          const response = receiveCallback(popup, config, authorization.searchParams.get('state')!, id, signal);
          try { popup.location.href = loginUrl; } catch { controller.abort(); }
          const callback = await response;
          const next = await exchangeOAuthCode(config, callback, memory, signal);
          if (pending !== controller) return;
          session = next;
          set({ status: 'connected', identity: next.identity, error: null });
        } catch (error) {
          if (pending === controller) set({ status: 'disconnected', identity: null,
            error: error instanceof HfError ? error.message : 'Could not connect to Hugging Face. Please reconnect.' });
        } finally {
          controller.abort(); popup.close();
          if (pending === controller) pending = null;
        }
      })();
    },
  };
}

export const hfAuth = createHfAuth();
