import { assertGoogleDriveHostAllowed, getGoogleDriveConfiguration, getGoogleDriveHostingConfig, validateGoogleDriveClientId } from './config';
import { accountSessions, type SessionToken } from '../accountSessions/api';

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_DRIVE_INSTALL_SCOPE = 'https://www.googleapis.com/auth/drive.install';

export interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  token_type?: string;
  error?: string;
}
export interface GoogleOAuthSdk {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    include_granted_scopes: boolean;
    login_hint?: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback: (error: { type: string }) => void;
  }): { requestAccessToken(options: { prompt: string }): void };
}
export interface GoogleDriveAuthState {
  status: 'disconnected' | 'connecting' | 'connected';
  error: string | null;
}

function getGoogleOAuthSdk(): GoogleOAuthSdk | undefined {
  return (window as Window & { google?: { accounts?: { oauth2?: GoogleOAuthSdk } } }).google?.accounts?.oauth2;
}

let sdkPromise: Promise<GoogleOAuthSdk> | null = null;
/** Load Google's library only when the user opens the Drive account control. */
export function loadGoogleOAuthSdk(): Promise<GoogleOAuthSdk> {
  try { assertGoogleDriveHostAllowed(); }
  catch (error) { return Promise.reject(error); }
  if (!getGoogleDriveClientId()) return Promise.reject(new Error('Google Drive sign-in is not configured for this viewer.'));
  const existing = getGoogleOAuthSdk();
  if (existing) return Promise.resolve(existing);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<GoogleOAuthSdk>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    const timer = setTimeout(() => finish(), 30_000);
    const finish = (sdk?: GoogleOAuthSdk) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (sdk) resolve(sdk);
      else {
        script.remove();
        sdkPromise = null;
        reject(new Error('Could not load Google sign-in. Check your connection and try again.'));
      }
    };
    script.onload = () => finish(getGoogleOAuthSdk());
    script.onerror = () => finish();
    document.head.append(script);
  });
  return sdkPromise;
}

export function getGoogleDriveClientId(): string | null {
  return getGoogleDriveConfiguration().clientId;
}

/** Browser access tokens stay in tab memory; remembered credentials belong to the separate session service. */
export function createGoogleDriveAuth() {
  const expired = 'Google Drive sign-in expired. Sign in again to continue.';
  let session: { token: string; expiresAt: number } | null = null;
  let remembered = false;
  let needsRefresh = false;
  let accountSubject: string | undefined;
  let renewal: { accountId?: string; promise: Promise<boolean> } | null = null;
  let pendingSession: AbortController | null = null;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let state: GoogleDriveAuthState = { status: 'disconnected', error: null };
  const listeners = new Set<() => void>();
  const set = (next: GoogleDriveAuthState) => { state = next; listeners.forEach(listener => listener()); };
  const disconnect = (error: string | null = null) => {
    generation++;
    clearTimeout(timer);
    pendingSession?.abort(); pendingSession = null;
    session = null;
    set({ status: 'disconnected', error });
  };
  const acceptSession = (token: SessionToken) => {
    if (!getGoogleDriveHostingConfig().hostAllowed || !token.scope.split(' ').includes(GOOGLE_DRIVE_SCOPE)) throw new Error('Google Drive file permission was not granted.');
    remembered = true;
    needsRefresh = false;
    accountSubject = token.accountId;
    session = { token: token.accessToken, expiresAt: token.expiresAt };
    clearTimeout(timer);
    timer = setTimeout(() => disconnect(expired), Math.max(0, token.expiresAt - Date.now() - 5000));
    set({ status: 'connected', error: null });
  };
  const readToken = (): string | null => {
    if (!getGoogleDriveHostingConfig().hostAllowed) {
      if (session || state.status === 'connecting') disconnect();
      return null;
    }
    if (session && session.expiresAt <= Date.now() + 5000) disconnect(expired);
    return session?.token ?? null;
  };
  const restore = (accountId?: string): Promise<boolean> => {
    if (!accountSessions.getSnapshot().capabilities.google || !getGoogleDriveHostingConfig().hostAllowed) return Promise.resolve(false);
    if (renewal && renewal.accountId === accountId) return renewal.promise;
    const attempt = generation;
    const promise = (needsRefresh ? accountSessions.token('google', 'view', accountId, undefined, true)
      : accountSessions.token('google', 'view', accountId)).then(token => {
      if (attempt !== generation) return false;
      acceptSession(token); return true;
    }).catch(() => false).finally(() => { if (renewal?.promise === promise) renewal = null; });
    renewal = { accountId, promise };
    return promise;
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getAccessToken: readToken,
    async ensureAccessToken(): Promise<string | null> {
      const token = readToken();
      if (remembered && (!token || session!.expiresAt <= Date.now() + 60_000)) await restore(accountSubject);
      return readToken();
    },
    clear: () => { accountSubject = undefined; disconnect(); },
    disconnect() {
      const forget = remembered || accountSessions.getSnapshot().accounts.some(account => account.provider === 'google');
      remembered = false; accountSubject = undefined; disconnect();
      if (forget) void accountSessions.disconnect('google').catch(() => {
        remembered = true;
        set({ status: 'disconnected', error: 'Could not forget the saved connection. Check your connection and try Disconnect again.' });
      });
    },
    restore,
    /** Expire the session that holds the rejected token; one signed in while its request ran stays connected. */
    expire: (token: string) => { if (session?.token === token) { needsRefresh = true; disconnect(expired); } },
    /** Called synchronously from the sign-in button after the SDK is ready. */
    connect(clientId: string, sdk?: GoogleOAuthSdk | null, options: { loginHint?: string; install?: boolean } = {}) {
      try { assertGoogleDriveHostAllowed(); }
      catch (error) { disconnect((error as Error).message); return; }
      if (!validateGoogleDriveClientId(clientId)
        || (import.meta.env.PROD && clientId !== getGoogleDriveClientId())) {
        disconnect('Google Drive sign-in is not configured for this viewer.');
        return;
      }
      if (state.status === 'connecting') return;
      disconnect();
      const attempt = generation;
      set({ status: 'connecting', error: null });
      const fail = (message: string) => { if (attempt === generation && state.status === 'connecting') disconnect(message); };
      timer = setTimeout(() => fail('Google sign-in timed out. Sign in again to continue.'), 180_000);
      if (accountSessions.getSnapshot().capabilities.google) {
        const controller = new AbortController(); pendingSession = controller;
        const purpose = options.install ? 'install' : 'view';
        const existing = accountSessions.getSnapshot().accounts.some(account => account.provider === 'google'
          && (account.purpose === purpose || (purpose === 'view' && account.purpose === 'install'))
          && (!options.loginHint || options.loginHint === account.accountId));
        void (existing ? accountSessions.token('google', purpose, options.loginHint, controller.signal, needsRefresh)
          : accountSessions.connect('google', { purpose, loginHint: options.loginHint }, controller.signal))
          .then(token => { if (attempt === generation && state.status === 'connecting') acceptSession(token); })
          .catch(error => fail(error instanceof Error ? error.message : 'Could not connect to Google Drive. Try again.'));
        return;
      }
      if (!sdk) { fail('Google sign-in is still loading. Try again.'); return; }
      try {
        const client = sdk.initTokenClient({
          client_id: clientId,
          scope: options.install ? `${GOOGLE_DRIVE_SCOPE} ${GOOGLE_DRIVE_INSTALL_SCOPE}` : GOOGLE_DRIVE_SCOPE,
          include_granted_scopes: false,
          ...(options.loginHint ? { login_hint: options.loginHint } : {}),
          callback: (response) => {
            if (attempt !== generation || state.status !== 'connecting') return;
            if (!getGoogleDriveHostingConfig().hostAllowed) return disconnect();
            if (response.error) return fail('Google sign-in was declined. Public Drive links still work without sign-in.');
            const expires = Number(response.expires_in);
            if (!response.access_token || !Number.isFinite(expires) || expires <= 5 || expires > 86400
              || response.token_type?.toLowerCase() !== 'bearer'
              || !response.scope?.split(' ').includes(GOOGLE_DRIVE_SCOPE)) {
              return fail('Google Drive file permission was not granted. Sign in again and allow file access.');
            }
            if (options.install && !response.scope?.split(' ').includes(GOOGLE_DRIVE_INSTALL_SCOPE)) {
              return fail('Permission to add ColmapView to Google Drive was not granted. Try Add to Google Drive again.');
            }
            clearTimeout(timer);
            session = { token: response.access_token, expiresAt: Date.now() + expires * 1000 };
            timer = setTimeout(() => disconnect(expired), (expires - 5) * 1000);
            set({ status: 'connected', error: null });
          },
          error_callback: (error) => fail(error.type === 'popup_failed_to_open'
            ? 'Allow the Google sign-in popup, then try again.' : 'Google sign-in was closed. Try again.'),
        });
        client.requestAccessToken({ prompt: options.loginHint ? '' : 'select_account' });
      } catch { fail('Could not start Google sign-in. Try again.'); }
    },
  };
}

export const googleDriveAuth = createGoogleDriveAuth();
if (import.meta.hot) import.meta.hot.dispose(() => googleDriveAuth.disconnect());
