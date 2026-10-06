import { assertGoogleDriveHostAllowed, getGoogleDriveConfiguration, getGoogleDriveHostingConfig, validateGoogleDriveClientId } from './config';

export const GOOGLE_DRIVE_READ_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_DRIVE_PUBLISH_SCOPE = 'https://www.googleapis.com/auth/drive.file';

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

/** Tokens stay in this tab's memory, never in viewer state, storage, or shared links. */
export function createGoogleDriveAuth(purpose: 'read' | 'publish' = 'read') {
  const scope = purpose === 'publish' ? GOOGLE_DRIVE_PUBLISH_SCOPE : GOOGLE_DRIVE_READ_SCOPE;
  const expired = purpose === 'publish'
    ? 'Google Drive sign-in expired. Sign in again to continue publishing.'
    : 'Google Drive sign-in expired. Sign in again, then choose an archive in the Drive picker.';
  let session: { token: string; expiresAt: number } | null = null;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let state: GoogleDriveAuthState = { status: 'disconnected', error: null };
  const listeners = new Set<() => void>();
  const set = (next: GoogleDriveAuthState) => { state = next; listeners.forEach(listener => listener()); };
  const disconnect = (error: string | null = null) => {
    generation++;
    clearTimeout(timer);
    session = null;
    set({ status: 'disconnected', error });
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getAccessToken(): string | null {
      if (!getGoogleDriveHostingConfig().hostAllowed) {
        if (session || state.status === 'connecting') disconnect();
        return null;
      }
      if (session && session.expiresAt <= Date.now() + 5000) disconnect(expired);
      return session?.token ?? null;
    },
    disconnect: () => disconnect(),
    expire: () => disconnect(expired),
    /** Called synchronously from the sign-in button after the SDK is ready. */
    connect(clientId: string, sdk: GoogleOAuthSdk) {
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
      timer = setTimeout(() => fail('Google sign-in timed out. Try again.'), 180_000);
      try {
        const client = sdk.initTokenClient({
          client_id: clientId, scope, include_granted_scopes: false,
          callback: (response) => {
            if (attempt !== generation || state.status !== 'connecting') return;
            if (!getGoogleDriveHostingConfig().hostAllowed) return disconnect();
            if (response.error) return fail('Google sign-in was declined. Public Drive links still work without sign-in.');
            const expires = Number(response.expires_in);
            if (!response.access_token || !Number.isFinite(expires) || expires <= 5 || expires > 86400
              || response.token_type?.toLowerCase() !== 'bearer'
              || !response.scope?.split(' ').includes(scope)) {
              return fail(purpose === 'publish' ? 'Google Drive upload permission was not granted. Sign in again and allow file access.'
                : 'Google Drive file permission was not granted. Sign in again, then choose an archive in the Drive picker.');
            }
            clearTimeout(timer);
            session = { token: response.access_token, expiresAt: Date.now() + expires * 1000 };
            timer = setTimeout(() => disconnect(expired), (expires - 5) * 1000);
            set({ status: 'connected', error: null });
          },
          error_callback: (error) => fail(error.type === 'popup_failed_to_open'
            ? 'Allow the Google sign-in popup, then try again.' : 'Google sign-in was closed. Try again.'),
        });
        client.requestAccessToken({ prompt: 'select_account' });
      } catch { fail('Could not start Google sign-in. Try again.'); }
    },
  };
}

export const googleDriveAuth = createGoogleDriveAuth();
// Both use app-created/selected-file access, with independent memory-only sessions.
export const googleDrivePublishAuth = createGoogleDriveAuth('publish');
