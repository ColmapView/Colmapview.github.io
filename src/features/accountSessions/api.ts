import { anySignal, timeoutSignal } from '../../utils/abortSignals';

export type SessionProvider = 'google' | 'hf';
export type SessionPurpose = 'view' | 'publish' | 'install';
export interface SessionToken { accessToken: string; expiresAt: number; scope: string; accountId: string; username?: string; renewable: boolean }
export interface SavedBucket { config: { baseUrl: string; region: string; publicBaseUrl?: string }; writable: boolean }
export interface AccountSessionState {
  ready: boolean;
  capabilities: { google: boolean; hf: boolean; bucket: boolean };
  accounts: { provider: SessionProvider; purpose: SessionPurpose; accountId: string; username?: string; renewable: boolean }[];
  bucket: SavedBucket | null;
  expiresAt: number;
}

export class AccountSessionError extends Error {
  readonly status: number;
  constructor(message: string, status = 503) { super(message); this.status = status; }
}

const emptyState = (): AccountSessionState => ({ ready: false, capabilities: { google: false, hf: false, bucket: false }, accounts: [], bucket: null, expiresAt: 0 });
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const provider = (value: unknown): value is SessionProvider => value === 'google' || value === 'hf';
const purpose = (value: unknown): value is SessionPurpose => value === 'view' || value === 'publish' || value === 'install';
const CALLBACK_TYPE = 'colmapview:account-session:v1';

/** Only the registered custom host offers persistent connections. Other hosted builds make no session requests. */
export function accountSessionsSupported(): boolean {
  if (import.meta.env.VITE_ACCOUNT_SESSIONS_ENABLED !== 'true') return false;
  return window.location.origin === 'https://colmapview.opsiclear.com'
    || (import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname));
}

export function createAccountSessions() {
  let state = emptyState();
  let pending: Promise<AccountSessionState> | null = null;
  let revision = 0;
  const listeners = new Set<() => void>();
  const update = (next: AccountSessionState) => { state = next; listeners.forEach(listener => listener()); };

  const request = async (path: string, body?: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> => {
    if (!accountSessionsSupported()) throw new AccountSessionError('Remembered connections are unavailable in this viewer.');
    const response = await fetch(`/auth/${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      cache: 'no-store', redirect: 'error', signal: anySignal([timeoutSignal(20_000), ...(signal ? [signal] : [])]),
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json', 'X-ColmapView-Session': '1' }, body: JSON.stringify(body) }) });
    if (!response.headers.get('Content-Type')?.startsWith('application/json')) throw new AccountSessionError('Remembered connections are temporarily unavailable.');
    const value: unknown = await response.json();
    if (!object(value)) throw new AccountSessionError('The connection response is invalid.');
    if (!response.ok) throw new AccountSessionError(typeof value.error === 'string' && value.error.length < 300 ? value.error : 'Could not complete this connection.', response.status);
    return value;
  };

  const load = (reload = false): Promise<AccountSessionState> => {
    if (pending) return reload ? pending.then(() => load(true)) : pending;
    if (state.ready && !reload) return Promise.resolve(state);
    if (!accountSessionsSupported()) { update({ ...emptyState(), ready: true }); return Promise.resolve(state); }
    const attempt = revision;
    pending = request('session').then(value => {
      if (!object(value.capabilities) || !Array.isArray(value.accounts)) throw new AccountSessionError('Invalid session response.');
      const accounts = value.accounts.filter((entry): entry is AccountSessionState['accounts'][number] => object(entry)
        && provider(entry.provider) && purpose(entry.purpose) && typeof entry.accountId === 'string'
        && entry.accountId.length <= 255 && (entry.username === undefined || typeof entry.username === 'string'))
        .map(entry => ({ provider: entry.provider, purpose: entry.purpose, accountId: entry.accountId,
          ...(entry.username ? { username: entry.username } : {}), renewable: entry.renewable === true }));
      let bucket: SavedBucket | null = null;
      if (object(value.bucket) && object(value.bucket.config) && typeof value.bucket.config.baseUrl === 'string' && typeof value.bucket.config.region === 'string') {
        bucket = { config: { baseUrl: value.bucket.config.baseUrl, region: value.bucket.config.region,
          ...(typeof value.bucket.config.publicBaseUrl === 'string' ? { publicBaseUrl: value.bucket.config.publicBaseUrl } : {}) }, writable: value.bucket.writable === true };
      }
      const next: AccountSessionState = { ready: true, capabilities: { google: value.capabilities.google === true,
        hf: value.capabilities.hf === true, bucket: value.capabilities.bucket === true }, accounts, bucket,
        expiresAt: typeof value.expiresAt === 'number' ? value.expiresAt : 0 };
      if (attempt === revision) update(next);
      return state;
    }).catch(() => { if (attempt === revision) update({ ...emptyState(), ready: true }); return state; })
      .finally(() => { pending = null; });
    return pending;
  };

  const token = async (selectedProvider: SessionProvider, selectedPurpose: SessionPurpose = 'view', accountId?: string, signal?: AbortSignal, refresh = false): Promise<SessionToken> => {
    let value: Record<string, unknown>;
    try { value = await request(`${selectedProvider}/token`, { purpose: selectedPurpose, ...(accountId ? { accountId } : {}), ...(refresh ? { refresh: true } : {}) }, signal); }
    catch (error) {
      if (error instanceof AccountSessionError && [401, 403].includes(error.status)) update({ ...state,
        accounts: state.accounts.filter(account => account.provider !== selectedProvider || (account.purpose !== selectedPurpose
          && !(selectedProvider === 'google' && selectedPurpose === 'view' && account.purpose === 'install'))) });
      throw error;
    }
    if (typeof value.accessToken !== 'string' || !value.accessToken || typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)
      || value.expiresAt <= Date.now() + 5000 || typeof value.scope !== 'string' || typeof value.accountId !== 'string'
      || (selectedProvider === 'hf' && (typeof value.username !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(value.username)))) {
      throw new AccountSessionError('The provider connection is invalid.');
    }
    return { accessToken: value.accessToken, expiresAt: value.expiresAt, scope: value.scope, accountId: value.accountId,
      username: typeof value.username === 'string' ? value.username : undefined, renewable: value.renewable === true };
  };

  const begin = async (selectedProvider: SessionProvider, options: { purpose?: SessionPurpose; loginHint?: string; returnTo?: string; mode: 'popup' | 'redirect' }, signal?: AbortSignal) => {
    const value = await request(`${selectedProvider}/connect`, { purpose: options.purpose ?? 'view', mode: options.mode,
      returnTo: options.returnTo ?? `${window.location.pathname}${window.location.search}${window.location.hash}`,
      ...(options.loginHint ? { loginHint: options.loginHint } : {}) }, signal);
    if (typeof value.url !== 'string' || typeof value.transactionId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.transactionId)) throw new AccountSessionError('Could not start sign-in.');
    const url = new URL(value.url);
    const expected = selectedProvider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://huggingface.co/oauth/authorize';
    if (url.origin + url.pathname !== expected || url.username || url.password || url.hash) throw new AccountSessionError('Unexpected sign-in destination.');
    return { url: url.href, transactionId: value.transactionId };
  };

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load,
    token,
    async connect(selectedProvider: SessionProvider, options: { purpose?: SessionPurpose; loginHint?: string } = {}, signal?: AbortSignal): Promise<SessionToken> {
      const popup = window.open('about:blank', '_blank', 'popup,width=600,height=740');
      if (!popup) throw new AccountSessionError('Allow the sign-in popup, then try again.');
      const controller = new AbortController();
      const combined = anySignal([controller.signal, timeoutSignal(180_000), ...(signal ? [signal] : [])]);
      let transactionId: string | undefined;
      let completed = false;
      try {
        const started = await begin(selectedProvider, { ...options, mode: 'popup' }, combined);
        transactionId = started.transactionId;
        await new Promise<void>((resolve, reject) => {
          const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`colmapview-account-${started.transactionId}`);
          const clean = () => { window.removeEventListener('message', onMessage); combined.removeEventListener('abort', abort); clearInterval(poll); channel?.close(); };
          const accept = (value: unknown) => {
            if (!object(value) || value.type !== CALLBACK_TYPE || value.transactionId !== started.transactionId || value.provider !== selectedProvider) return;
            clean();
            if (typeof value.error === 'string') reject(new AccountSessionError(value.error.length < 300 ? value.error : 'Sign-in was not completed.'));
            else resolve();
          };
          const onMessage = (event: MessageEvent) => { if (event.origin === window.location.origin && event.source === popup) accept(event.data); };
          const abort = () => { clean(); reject(new AccountSessionError('Sign-in was cancelled or timed out. Try again.')); };
          const poll = setInterval(() => { if (!channel && popup.closed) abort(); }, 500);
          window.addEventListener('message', onMessage);
          if (channel) channel.onmessage = event => accept(event.data);
          combined.addEventListener('abort', abort, { once: true });
          if (combined.aborted) { abort(); return; }
          try { popup.location.href = started.url; } catch { abort(); }
        });
        const result = await token(selectedProvider, options.purpose, options.loginHint, combined);
        combined.throwIfAborted();
        completed = true;
        // The token completes sign-in. A slow metadata refresh must not leave a completed connection in the cancellable UI.
        void load(true);
        return result;
      } finally {
        controller.abort(); try { popup.close(); } catch { /* COOP may detach the popup. */ }
        if (!completed && transactionId) await request(`${selectedProvider}/cancel`, { transactionId }).catch(() => undefined);
      }
    },
    async connectRedirect(selectedProvider: SessionProvider, options: { purpose?: SessionPurpose; loginHint?: string; returnTo: string }, signal?: AbortSignal) {
      const started = await begin(selectedProvider, { ...options, mode: 'redirect' }, signal);
      if (signal?.aborted) {
        await request(`${selectedProvider}/cancel`, { transactionId: started.transactionId }).catch(() => undefined);
        signal.throwIfAborted();
      }
      window.location.assign(started.url);
    },
    async disconnect(selectedProvider: SessionProvider | 'bucket' | 'all') {
      revision++;
      await request(`${selectedProvider}/disconnect`, {});
      if (selectedProvider === 'all') update({ ...emptyState(), ready: true, capabilities: state.capabilities });
      else update({ ...state, accounts: state.accounts.filter(account => account.provider !== selectedProvider), bucket: selectedProvider === 'bucket' ? null : state.bucket });
    },
    async rememberBucket(config: SavedBucket['config'], credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string }, writable: boolean) {
      await request('bucket/connect', { remember: true, config, credentials, writable });
      await load(true);
    },
    async enableBucketUploads() {
      await request('bucket/enable-uploads', { confirm: true });
      const next = await load(true);
      if (!next.bucket?.writable) throw new AccountSessionError('Could not enable bucket uploads. Try again.');
      return next.bucket;
    },
    async signBucket(url: string, method: string, signal?: AbortSignal): Promise<{ url: string; expiresAt: number }> {
      const value = await request('bucket/sign', { url, method }, signal);
      if (typeof value.url !== 'string' || new URL(value.url).origin !== new URL(url).origin || new URL(value.url).pathname !== new URL(url).pathname) throw new AccountSessionError('Invalid bucket authorization.');
      if (typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) throw new AccountSessionError('Bucket authorization expired. Try again.');
      return { url: value.url, expiresAt: Math.min(value.expiresAt, Date.now() + 110_000) };
    },
  };
}

export const accountSessions = createAccountSessions();

/** Result flags carry no credentials. Consume once to prevent automatic authorization loops after cancellation. */
export function consumeAccountReturn(): { provider: SessionProvider; failed: boolean } | null {
  const url = new URL(window.location.href);
  const selected = url.searchParams.get('account_provider');
  const result = url.searchParams.get('account_result');
  if (!provider(selected) || !['connected', 'cancelled'].includes(result ?? '')) return null;
  url.searchParams.delete('account_provider'); url.searchParams.delete('account_result');
  window.history.replaceState(window.history.state, '', url.href);
  return { provider: selected, failed: result === 'cancelled' };
}
